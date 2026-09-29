"""File upload state machine.

Port of writeFileE87 and ensureE87Auth in web/src/lib/e87-protocol.ts.
Phase order matches that file. The unit tests use a simulated badge.
A still JPEG and the Painted Base AVI were accepted by a physical E87.
"""

from __future__ import annotations

import asyncio
import secrets
import time
from collections.abc import Callable

from .auth import get_encrypted_auth_data
from .frames import (
    E87Frame,
    build_e87_frame,
    build_file_path_response,
    build_qix_frame,
    crc16_xmodem,
    extension_for,
    local_time_payload,
    parse_e87_frame,
    random_temp_name,
    to_hex,
)
from .link import Link

LANGUAGE_CODE = {"zh-CN": 0x00, "en": 0x01}
DATA_CHUNK_SIZE = 490

CTRL_AFTER_06 = bytes.fromhex("9ebd0b600d0003")
CTRL_B5 = bytes.fromhex("9eb50b29010080")
CTRL_D3 = bytes.fromhex("9ed30bc6010001")
CTRL_30 = bytes.fromhex("9e3008200200ff07")
CTRL_2B = bytes.fromhex("9e2b08ff02002200")
CTRL_2D = bytes.fromhex("9e2d08ff02002400")
CTRL_F4 = bytes.fromhex("9ef40bdc01000c")

STATUS_NAMES = {
    0x00: "SUCCESS",
    0x01: "UNKNOWN_ERROR",
    0x02: "BUSY",
    0x03: "DATA_ERROR/CRC_FAIL",
    0x04: "TIMEOUT",
    0x05: "REJECTED",
}


class UploadError(RuntimeError):
    pass


def _preview(queue: list[bytes]) -> str:
    tail = queue[-6:]
    if not tail:
        return "no queued notifications"
    parts = []
    for raw in tail:
        frame = parse_e87_frame(raw)
        if frame:
            parts.append(f"frame(flag=0x{frame.flag:x},cmd=0x{frame.cmd:x},len={len(frame.body)})")
        else:
            parts.append(f"raw({len(raw)}):{raw[:8].hex()}")
    return ", ".join(parts)


async def _wait(
    queue: list[bytes],
    found,
    timeout: float,
    label: str,
    log: Callable[[str], None],
    cancel: Callable[[], bool] | None,
):
    log(f"Waiting for {label}...")
    deadline = time.monotonic() + timeout
    while True:
        if cancel and cancel():
            raise UploadError("Write cancelled.")
        item = found(queue)
        if item is not None:
            return item
        if time.monotonic() >= deadline:
            raise UploadError(f"Timeout waiting for {label}. Recent notifications: {_preview(queue)}")
        await asyncio.sleep(0.02)


def _take_frame(queue: list[bytes], pred: Callable[[E87Frame], bool]):
    for i, raw in enumerate(queue):
        frame = parse_e87_frame(raw)
        if frame and pred(frame):
            del queue[i]
            return frame
    return None


def _take_raw(queue: list[bytes], pred: Callable[[bytes], bool]):
    for i, raw in enumerate(queue):
        if pred(raw):
            del queue[i]
            return raw
    return None


async def wait_frame(queue, pred, timeout, label, log, cancel=None) -> E87Frame:
    return await _wait(queue, lambda q: _take_frame(q, pred), timeout, label, log, cancel)


async def wait_raw(queue, pred, timeout, label, log, cancel=None) -> bytes:
    return await _wait(queue, lambda q: _take_raw(q, pred), timeout, label, log, cancel)


def _listen(link: Link) -> tuple[list[bytes], Callable[[], None]]:
    queue: list[bytes] = []

    def on_note(raw: bytes) -> None:
        queue.append(raw)
        if len(queue) > 300:
            del queue[0]

    return queue, link.subscribe(on_note)


async def ensure_auth(link: Link, log: Callable[[str], None], timeout: float = 5.0) -> None:
    if link.authenticated:
        return
    queue, off = _listen(link)
    try:
        log("Auth: Starting Jieli RCSP crypto handshake...")
        random_auth = bytes([0x00]) + secrets.token_bytes(16)
        log(f"Auth TX: [0x00, rand*16] = {random_auth.hex()}")
        await link.write_data(random_auth)
        device_response = await wait_raw(
            queue,
            lambda raw: len(raw) == 17 and raw[0] == 0x01,
            timeout,
            "auth device response [0x01, encrypted*16]",
            log,
        )
        log(f"Auth RX: {device_response.hex()}")
        log("Auth TX: [0x02, pass]")
        await link.write_data(bytes([0x02, 0x70, 0x61, 0x73, 0x73]))
        challenge = await wait_raw(
            queue,
            lambda raw: len(raw) == 17 and raw[0] == 0x00,
            timeout,
            "auth device challenge [0x00, challenge*16]",
            log,
        )
        log(f"Auth RX challenge: {challenge.hex()}")
        encrypted = get_encrypted_auth_data(challenge)
        log(f"Auth TX encrypted: {encrypted.hex()}")
        await link.write_data(encrypted)
        confirm = await wait_raw(
            queue,
            lambda raw: len(raw) >= 5 and raw[0] == 0x02 and raw[1:5] == b"pass",
            timeout,
            "auth pass confirmation",
            log,
        )
        log(f"Auth SUCCESS: {confirm.hex()}")
        link.authenticated = True
    finally:
        off()


async def set_language(link: Link, language: str, log: Callable[[str], None]) -> None:
    if not link.connected:
        raise UploadError("Device is disconnected.")
    code = LANGUAGE_CODE.get(language, 0x01)
    seq = link.qix_seq & 0x0F
    link.qix_seq = (link.qix_seq + 1) & 0x0F
    flag = ((seq & 0x0F) << 3) | 0x02
    frame = build_qix_frame(0x16, bytes([code]), flag)
    label = "Simplified Chinese" if language == "zh-CN" else "English"
    log(f"Set device language: {label} (0x{code:02x}, seq={seq})")
    await link.write_control(frame)


def _limit(default: float, override: float | None) -> float:
    if override is None:
        return default
    return min(default, override)


async def write_file(
    link: Link,
    payload: bytes,
    *,
    kind: str,
    log: Callable[[str], None],
    on_progress: Callable[[int, int], None],
    cancel: Callable[[], bool],
    language: str = "en",
    inter_chunk_delay_ms: int = 0,
    pace: bool = True,
    ack_timeout: float | None = None,
) -> None:
    """Send one still or animation. kind is 'still' or 'animated'."""
    link.log = log
    ext = extension_for(payload, kind)
    link.path_for_seq = lambda seq, ext=ext: build_file_path_response(seq, ext)
    queue, off = _listen(link)

    async def pause(ms: int) -> None:
        if pace and ms > 0:
            await asyncio.sleep(ms / 1000)

    async def write_data(chunk: bytes) -> None:
        await link.write_data(chunk)

    async def send_frame(flag: int, cmd: int, body: bytes) -> None:
        frame = build_e87_frame(flag, cmd, body)
        log(f"TX frame flag=0x{flag:x} cmd=0x{cmd:x} len={len(body)}")
        await write_data(frame)

    def t(default: float) -> float:
        return _limit(default, ack_timeout)

    if payload.startswith(b"\xff\xd8"):
        fmt = "JPEG"
    elif payload.startswith(b"RIFF"):
        fmt = "AVI"
    else:
        fmt = "raw data"
    log(f"Prepared payload: {len(payload)} bytes ({fmt}).")

    try:
        await ensure_auth(link, log, t(5.0))
        seq_counter = 0x00

        log("Phase 1: cmd 0x06 (reset auth flag)...")
        await send_frame(0xC0, 0x06, bytes([0x02, 0x00, 0x01]))
        seq_counter = 0x01
        try:
            await link.write_control(CTRL_AFTER_06)
        except Exception:
            pass
        try:
            await wait_frame(queue, lambda f: f.cmd == 0x06, t(3.0), "ack cmd 0x06", log, cancel)
            log("cmd 0x06 acked.")
        except UploadError as exc:
            if "cancelled" in str(exc).lower():
                raise
            log("cmd 0x06 ack not received (continuing).")

        log("Phase 2: FD02 control writes...")
        await link.write_control(local_time_payload())
        await pause(20)
        await set_language(link, language, log)
        await pause(20)
        await link.write_control(CTRL_B5)
        await pause(200)

        try:
            log("Phase 3: cmd 0x03 (best-effort)...")
            await send_frame(0xC0, 0x03, bytes([seq_counter & 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x01]))
            seq_counter = (seq_counter + 1) & 0xFF
            await link.write_control(CTRL_D3)
            await pause(20)
            await link.write_control(CTRL_30)
            await wait_frame(queue, lambda f: f.cmd == 0x03, t(3.0), "ack cmd 0x03", log, cancel)
        except UploadError as exc:
            if "cancelled" in str(exc).lower():
                raise
            log("cmd 0x03 not acked (continuing).")

        try:
            log("Phase 4: cmd 0x07 (best-effort)...")
            await send_frame(0xC0, 0x07, bytes([seq_counter & 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]))
            seq_counter = (seq_counter + 1) & 0xFF
            await link.write_control(CTRL_2B)
            await pause(40)
            await link.write_control(CTRL_2D)
            await wait_frame(queue, lambda f: f.cmd == 0x07, t(3.0), "ack cmd 0x07", log, cancel)
        except UploadError as exc:
            if "cancelled" in str(exc).lower():
                raise
            log("cmd 0x07 not acked (continuing).")

        log("Phase 5: FD02 bootstrap...")
        await link.write_control(CTRL_B5)
        await pause(400)
        await link.write_control(CTRL_D3)
        try:
            await wait_raw(
                queue,
                lambda raw: len(raw) >= 5 and raw[0] == 0x9E and (raw[3] == 0xC7 or raw[2] == 0xC7),
                t(3.0),
                "FD01 device info (C7)",
                log,
                cancel,
            )
        except UploadError as exc:
            if "cancelled" in str(exc).lower():
                raise
            log("FD01 C7 not observed (continuing).")
        await link.write_control(CTRL_F4)
        try:
            await wait_raw(
                queue,
                lambda raw: len(raw) >= 4 and raw[0] == 0x9E and raw[1] == 0xE6,
                t(3.0),
                "FD03 ready signal (9EE6)",
                log,
                cancel,
            )
            log("Device ready signal received.")
        except UploadError as exc:
            if "cancelled" in str(exc).lower():
                raise
            log("FD03 ready signal not observed (continuing).")

        log("Phase 6: cmd 0x21 (begin upload)...")
        await send_frame(0xC0, 0x21, bytes([seq_counter & 0xFF, 0x00]))
        seq_counter = (seq_counter + 1) & 0xFF
        await wait_frame(queue, lambda f: f.cmd == 0x21, t(8.0), "ack cmd 0x21", log, cancel)

        log("Phase 7: cmd 0x27 (transfer params)...")
        await send_frame(0xC0, 0x27, bytes([seq_counter & 0xFF, 0x00, 0x00, 0x00, 0x00, 0x02, 0x01]))
        seq_counter = (seq_counter + 1) & 0xFF
        await wait_frame(queue, lambda f: f.cmd == 0x27, t(8.0), "ack cmd 0x27", log, cancel)

        log("Phase 8: cmd 0x1b (file metadata)...")
        file_size = len(payload)
        temp_name = random_temp_name()
        name_bytes = temp_name.encode("utf-8")
        file_crc = crc16_xmodem(payload)
        log(f"Whole-file CRC-16 XMODEM: 0x{file_crc:04x}")
        meta = bytearray(10 + len(name_bytes))
        meta[0] = seq_counter & 0xFF
        seq_counter = (seq_counter + 1) & 0xFF
        meta[1] = (file_size >> 24) & 0xFF
        meta[2] = (file_size >> 16) & 0xFF
        meta[3] = (file_size >> 8) & 0xFF
        meta[4] = file_size & 0xFF
        meta[5] = (file_crc >> 8) & 0xFF
        meta[6] = file_crc & 0xFF
        meta[7] = secrets.randbelow(256)
        meta[8] = secrets.randbelow(256)
        meta[9:9 + len(name_bytes)] = name_bytes
        meta[-1] = 0x00
        await send_frame(0xC0, 0x1B, bytes(meta))
        meta_ack = await wait_frame(queue, lambda f: f.cmd == 0x1B, t(8.0), "ack cmd 0x1b", log, cancel)

        chunk_size = DATA_CHUNK_SIZE
        if len(meta_ack.body) >= 4:
            chunk_size = (meta_ack.body[2] << 8) | meta_ack.body[3]
            log(f"Device chunk size from 0x1b ack: {chunk_size} bytes")
            if chunk_size == 0 or chunk_size > 4096:
                log(f"WARNING: unusual chunk size {chunk_size}, falling back to {DATA_CHUNK_SIZE}")
                chunk_size = DATA_CHUNK_SIZE

        log("Phase 9: Data transfer...")
        total_chunks = max(1, (file_size + chunk_size - 1) // chunk_size) if file_size else 0
        seq = seq_counter
        sent_chunks = 0
        total_bytes_sent = 0
        log(f"Total size: {file_size} bytes, {total_chunks} chunks")
        link.auto_file_complete = True
        link.file_complete_handled = False

        async def send_chunks_at(offset: int, win_size: int) -> None:
            nonlocal seq, sent_chunks, total_bytes_sent
            slot = 0
            bytes_sent = 0
            chunks_in_window = 0
            while bytes_sent < win_size:
                if cancel():
                    raise UploadError("Write cancelled.")
                chunk_offset = offset + bytes_sent
                if chunk_offset >= file_size:
                    break
                remaining = min(win_size - bytes_sent, file_size - chunk_offset)
                chunk_len = min(chunk_size, remaining)
                piece = payload[chunk_offset:chunk_offset + chunk_len]
                is_commit = offset == 0 and win_size <= chunk_size
                crc = crc16_xmodem(piece)
                body = bytearray(5 + len(piece))
                body[0] = seq & 0xFF
                body[1] = 0x1D
                body[2] = slot & 0xFF
                body[3] = (crc >> 8) & 0xFF
                body[4] = crc & 0xFF
                body[5:] = piece
                if sent_chunks == 0:
                    log(f"FIRST chunk: seq={seq & 0xFF} slot={slot & 0xFF} crc=0x{crc:04x} offset={chunk_offset} len={chunk_len}")
                if is_commit:
                    log(f"COMMIT chunk: seq={seq & 0xFF} slot={slot & 0xFF} crc=0x{crc:04x}")
                await send_frame(0x80, 0x01, bytes(body))
                sent_chunks += 1
                total_bytes_sent += chunk_len
                chunks_in_window += 1
                on_progress(total_bytes_sent, file_size)
                seq = (seq + 1) & 0xFF
                slot = (slot + 1) & 0x07
                bytes_sent += chunk_len
                if not is_commit and inter_chunk_delay_ms > 0:
                    await pause(inter_chunk_delay_ms)
            log(f"Window done: sent {chunks_in_window} chunks, {bytes_sent} bytes (total {total_bytes_sent}/{file_size})")

        async def handle_completion(frame: E87Frame) -> None:
            device_seq = frame.body[0] if frame.body else seq
            status_byte = frame.body[1] if len(frame.body) >= 2 else 0xFF
            status_str = STATUS_NAMES.get(status_byte, f"0x{status_byte:x}")
            log(f"Received SESSION_CLOSE cmd 0x{frame.cmd:x}, body: {to_hex(frame.body)}")
            log(f"  deviceSeq={device_seq}, status={status_str} (0x{status_byte:x})")
            log(f"  cmd 0x20 auto-responded: {link.file_complete_handled}")
            link.auto_file_complete = False
            await send_frame(0x00, 0x1C, bytes([0x00, device_seq & 0xFF]))
            if status_byte != 0x00:
                message = f"Device reported upload error: {status_str} (0x{status_byte:02x})"
                if status_byte == 0x05:
                    message += ". The badge rejected the file (gallery may be full)."
                raise UploadError(message)
            log("Upload complete.")

        try:
            first_win = await wait_frame(
                queue,
                lambda f: f.flag == 0x80 and f.cmd == 0x1D,
                t(10.0),
                "initial window ack (windowed flow control)",
                log,
                cancel,
            )
        except UploadError as exc:
            if "cancelled" in str(exc).lower() or ack_timeout is not None:
                raise
            raise UploadError(
                "Device did not send the initial window ACK within 10 s. "
                "Cannot start data transfer. Please retry the upload."
            ) from exc

        log("Using windowed flow control.")
        current: E87Frame | None = first_win
        while True:
            if cancel():
                raise UploadError("Write cancelled.")
            if current is not None and current.cmd == 0x1D and len(current.body) >= 8:
                ack_seq = current.body[0]
                ack_status = current.body[1]
                win_size = (current.body[2] << 8) | current.body[3]
                next_offset = (
                    (current.body[4] << 24)
                    | (current.body[5] << 16)
                    | (current.body[6] << 8)
                    | current.body[7]
                )
                log(f"Window ack #{ack_seq}: status=0x{ack_status:x} winSize={win_size} nextOffset={next_offset}")
                if ack_status != 0x00:
                    log(f"WARNING: non-zero ack status 0x{ack_status:x}")
                await send_chunks_at(next_offset, win_size)
                if next_offset == 0:
                    log(f"Commit sent. totalBytesSent={total_bytes_sent}, fileSize={file_size}")

            frame = await wait_frame(
                queue,
                lambda f: (f.flag == 0x80 and f.cmd == 0x1D) or f.cmd == 0x20 or f.cmd == 0x1C,
                t(15.0),
                "window ack, FILE_COMPLETE, or session close",
                log,
                cancel,
            )
            if frame.cmd == 0x20 and frame.flag == 0xC0:
                device_seq = frame.body[0] if frame.body else seq
                log(f"Received FILE_COMPLETE cmd 0x20 (seq={device_seq}). Auto-responded: {link.file_complete_handled}")
                if not link.file_complete_handled:
                    await send_frame(0x00, 0x20, link.path_for_seq(device_seq) if link.path_for_seq else b"")
                    link.file_complete_handled = True
                    log("Path response sent.")
                else:
                    await link.drain_auto()
                log("Waiting for SESSION_CLOSE...")
                close = await wait_frame(queue, lambda f: f.cmd == 0x1C, t(15.0), "session close (cmd 0x1c)", log, cancel)
                await handle_completion(close)
                break
            if frame.cmd == 0x1C:
                await handle_completion(frame)
                break
            current = frame
    finally:
        link.auto_file_complete = False
        off()
        await link.drain_auto()
