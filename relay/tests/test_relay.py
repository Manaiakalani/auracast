"""Relay checks that do not need a badge or bleak.

The upload test speaks the same acks as writeFileE87, through a fake link.
Auth ciphertext is compared with getEncryptedAuthData() in the web app.
"""

from __future__ import annotations

import asyncio
import http.client
import json
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
sys.path.insert(0, str(ROOT))

from auracast_relay.auth import get_encrypted_auth_data  # noqa: E402
from auracast_relay.frames import (  # noqa: E402
    build_e87_frame,
    build_file_path_response,
    crc16_xmodem,
    parse_e87_frame,
)
from auracast_relay.link import Link  # noqa: E402
from auracast_relay.server import MAX_BODY_BYTES, Relay  # noqa: E402
from auracast_relay.upload import UploadError, write_file  # noqa: E402


CHALLENGE = bytes([0x00]) + bytes((i * 17 + 3) & 255 for i in range(16))


def _window_ack(seq: int, win: int, offset: int) -> bytes:
    body = bytes([
        seq & 0xFF,
        0x00,
        (win >> 8) & 0xFF,
        win & 0xFF,
        (offset >> 24) & 0xFF,
        (offset >> 16) & 0xFF,
        (offset >> 8) & 0xFF,
        offset & 0xFF,
    ])
    return build_e87_frame(0x80, 0x1D, body)


class ScriptedLink(Link):
    """Badge stand-in. Data writes are recorded before any notification."""

    def __init__(self, file_size: int, *, reject: bool = False) -> None:
        super().__init__()
        self.file_size = file_size
        self.reject = reject
        self.data_writes: list[bytes] = []
        self.control_writes: list[bytes] = []
        self.chunks: list[bytes] = []
        self._second_window = False

    async def write_control(self, data: bytes) -> None:
        self.control_writes.append(bytes(data))
        if data.startswith(bytes.fromhex("9ed30b")):
            self.receive(bytes([0x9E, 0x00, 0xC7, 0x00, 0x00]))
        if data.startswith(bytes.fromhex("9ef4")):
            self.receive(bytes([0x9E, 0xE6, 0x00, 0x00]))

    async def write_data(self, data: bytes) -> None:
        self.data_writes.append(bytes(data))
        frame = parse_e87_frame(data)
        if frame is None:
            self._on_auth(data)
            return
        # Path and session-close replies must not be fed back into the badge.
        if frame.flag == 0x00:
            return
        self._on_frame(frame)

    def _on_auth(self, data: bytes) -> None:
        if len(data) == 17 and data[0] == 0x00:
            self.receive(bytes([0x01]) + b"\x11" * 16)
        elif len(data) >= 5 and data[0] == 0x02 and data[1:5] == b"pass":
            self.receive(CHALLENGE)
        elif len(data) == 17 and data[0] == 0x01:
            self.receive(bytes([0x02, 0x70, 0x61, 0x73, 0x73]))

    def _on_frame(self, frame) -> None:
        if frame.cmd in (0x06, 0x03, 0x07, 0x21, 0x27):
            self.receive(build_e87_frame(0x00, frame.cmd, bytes([0x00])))
            return
        if frame.cmd == 0x1B:
            self.receive(build_e87_frame(0x00, 0x1B, bytes([0x00, 0x00, 0x00, 64])))
            win = min(128, self.file_size)
            self.receive(_window_ack(0, win, 0))
            return
        if frame.flag == 0x80 and frame.cmd == 0x01:
            piece = bytes(frame.body[5:])
            crc = (frame.body[3] << 8) | frame.body[4]
            if crc != crc16_xmodem(piece):
                raise AssertionError(f"chunk crc 0x{crc:04x} != 0x{crc16_xmodem(piece):04x}")
            self.chunks.append(piece)
            got = sum(len(part) for part in self.chunks)
            if got == 128 and not self._second_window and got < self.file_size:
                self._second_window = True
                remaining = self.file_size - 128
                self.receive(_window_ack(frame.body[0], remaining, 128))
            elif got == self.file_size:
                seq = frame.body[0]
                self.receive(build_e87_frame(0xC0, 0x20, bytes([seq])))
                status = 0x05 if self.reject else 0x00
                self.receive(build_e87_frame(0xC0, 0x1C, bytes([seq, status])))


class FrameTests(unittest.TestCase):
    def test_crc_and_frame_roundtrip(self) -> None:
        self.assertEqual(crc16_xmodem(b"123456789"), 0x31C3)
        body = bytes([0x01, 0x02, 0x03])
        parsed = parse_e87_frame(build_e87_frame(0xC0, 0x21, body))
        self.assertIsNotNone(parsed)
        assert parsed is not None
        self.assertEqual(parsed.flag, 0xC0)
        self.assertEqual(parsed.cmd, 0x21)
        self.assertEqual(parsed.body, body)

    def test_path_response_is_timestamped_utf16(self) -> None:
        stamp = datetime(2026, 9, 28, 15, 4, 5)
        raw = build_file_path_response(7, ".jpg", stamp)
        self.assertEqual(raw[0], 0x00)
        self.assertEqual(raw[1], 7)
        text = raw[2:-2].decode("utf-16le")
        self.assertEqual(text, "\u555c20260928150405.jpg")
        self.assertEqual(raw[-2:], b"\x00\x00")


class AuthTests(unittest.TestCase):
    def test_matches_node(self) -> None:
        script = (
            "import { getEncryptedAuthData } from './src/jl-auth.ts';"
            "const challenge = new Uint8Array(17);"
            "challenge[0] = 0x00;"
            "for (let i = 0; i < 16; i++) challenge[i + 1] = (i * 17 + 3) & 255;"
            "const out = getEncryptedAuthData(challenge);"
            "process.stdout.write(Buffer.from(out).toString('hex'));"
        )
        proc = subprocess.run(
            ["node", "--experimental-strip-types", "--input-type=module", "-e", script],
            cwd=REPO / "web",
            check=True,
            capture_output=True,
            text=True,
        )
        expected = bytes.fromhex(proc.stdout.strip())
        self.assertEqual(get_encrypted_auth_data(CHALLENGE), expected)


class UploadTests(unittest.TestCase):
    def _payload(self) -> bytes:
        return b"\xff\xd8" + bytes((i * 3 + 1) & 0xFF for i in range(198))

    def test_happy_path(self) -> None:
        payload = self._payload()
        link = ScriptedLink(len(payload))
        logs: list[str] = []

        async def run() -> None:
            await asyncio.wait_for(
                write_file(
                    link,
                    payload,
                    kind="still",
                    log=logs.append,
                    on_progress=lambda _sent, _total: None,
                    cancel=lambda: False,
                    pace=False,
                    ack_timeout=0.5,
                ),
                timeout=5,
            )

        asyncio.run(run())
        self.assertEqual(b"".join(link.chunks), payload)
        self.assertEqual(len(link.chunks), 4)
        data_frames = []
        path_frames = []
        for raw in link.data_writes:
            frame = parse_e87_frame(raw)
            if frame is None:
                continue
            if frame.flag == 0x80 and frame.cmd == 0x01:
                data_frames.append(frame)
            if frame.flag == 0x00 and frame.cmd == 0x20:
                path_frames.append(frame)
        self.assertEqual(len(data_frames), 4)
        self.assertEqual(data_frames[0].body[0], 6)
        meta = next(parse_e87_frame(raw) for raw in link.data_writes if parse_e87_frame(raw) and parse_e87_frame(raw).cmd == 0x1B and parse_e87_frame(raw).flag == 0xC0)
        assert meta is not None
        self.assertEqual(int.from_bytes(meta.body[1:5], "big"), len(payload))
        self.assertEqual(int.from_bytes(meta.body[5:7], "big"), crc16_xmodem(payload))
        self.assertEqual(len(path_frames), 1)
        text = path_frames[0].body[2:-2].decode("utf-16le")
        self.assertTrue(text.startswith("\u555c"))
        self.assertTrue(text.endswith(".jpg"))
        auth_writes = [raw for raw in link.data_writes if parse_e87_frame(raw) is None and len(raw) == 17 and raw[0] == 0x01]
        self.assertEqual(auth_writes, [get_encrypted_auth_data(CHALLENGE)])
        self.assertTrue(any("Upload complete." in line for line in logs))

    def test_cancel_before_acks(self) -> None:
        payload = self._payload()
        link = ScriptedLink(len(payload))

        async def run() -> None:
            await asyncio.wait_for(
                write_file(
                    link,
                    payload,
                    kind="still",
                    log=lambda _msg: None,
                    on_progress=lambda _sent, _total: None,
                    cancel=lambda: True,
                    pace=False,
                    ack_timeout=0.5,
                ),
                timeout=5,
            )

        with self.assertRaises(UploadError) as caught:
            asyncio.run(run())
        self.assertIn("cancelled", str(caught.exception).lower())

    def test_rejected_status(self) -> None:
        payload = self._payload()
        link = ScriptedLink(len(payload), reject=True)

        async def run() -> None:
            await asyncio.wait_for(
                write_file(
                    link,
                    payload,
                    kind="still",
                    log=lambda _msg: None,
                    on_progress=lambda _sent, _total: None,
                    cancel=lambda: False,
                    pace=False,
                    ack_timeout=0.5,
                ),
                timeout=5,
            )

        with self.assertRaises(UploadError) as caught:
            asyncio.run(run())
        self.assertIn("rejected", str(caught.exception))


class FakeSession:
    def __init__(self) -> None:
        self.uploads: list[tuple[bytes, str, str]] = []
        self.cleared = False
        self.hold: threading.Event | None = None
        self.started = threading.Event()

    async def upload(self, payload, kind, cancel, on_progress, log, language="en") -> None:
        self.uploads.append((bytes(payload), kind, language))
        on_progress(len(payload), len(payload))
        log("simulated upload")
        self.started.set()
        if self.hold is not None:
            while not self.hold.is_set():
                if cancel():
                    raise RuntimeError("Write cancelled.")
                await asyncio.sleep(0.01)

    async def diagnostics(self) -> dict:
        return {
            "verdict": "connect-ok",
            "detail": "simulated",
            "scan_seconds": 0.1,
            "scan_found": 1,
            "connect_seconds": 0.1,
            "scanner_alive": True,
            "cache_age_seconds": None,
        }

    def clear_cache(self) -> None:
        self.cleared = True

    async def scan(self, timeout: float):
        return None


def _multipart(fields: dict[str, tuple[str | None, bytes]]) -> tuple[bytes, str]:
    boundary = "----auracast"
    chunks: list[bytes] = []
    for name, (filename, data) in fields.items():
        disp = f'Content-Disposition: form-data; name="{name}"'
        if filename is not None:
            disp += f'; filename="{filename}"'
        chunks.append(f"--{boundary}\r\n{disp}\r\n\r\n".encode() + data + b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


class HttpTests(unittest.TestCase):
    def setUp(self) -> None:
        self.session = FakeSession()
        self.relay = Relay(self.session, host="127.0.0.1", port=0, static_root=None, watch=False)
        self.relay.start()
        self.port = self.relay.port

    def tearDown(self) -> None:
        if self.session.hold is not None:
            self.session.hold.set()
        self.relay.close()

    def request(self, method: str, path: str, body: bytes | None = None, headers: dict | None = None, timeout: float = 5):
        req = urllib.request.Request(
            f"http://127.0.0.1:{self.port}{path}",
            data=body,
            headers=headers or {},
            method=method,
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as exc:
            try:
                return exc.code, exc.read()
            finally:
                exc.close()

    def test_status_blob_cancel_diagnostics_and_bust(self) -> None:
        status, raw = self.request("GET", "/api/status")
        self.assertEqual(status, 200)
        snap = json.loads(raw)
        self.assertFalse(snap["online"])
        self.assertEqual(snap["state"], "idle")
        self.assertIsNone(snap["address"])

        payload = b"\xff\xd8hello"
        body, content_type = _multipart({"file": ("still.jpg", payload), "kind": (None, b"still")})
        status, raw = self.request("POST", "/api/blob", body, {"Content-Type": content_type})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(raw), {"ok": True})
        self.assertEqual(self.session.uploads, [(payload, "still", "en")])

        status, raw = self.request("POST", "/api/cancel")
        self.assertEqual(status, 200)
        self.assertTrue(self.relay.cancel.is_set())

        status, raw = self.request("GET", "/api/diagnostics")
        self.assertEqual(status, 200)
        diag = json.loads(raw)
        for key in (
            "verdict",
            "detail",
            "scan_seconds",
            "scan_found",
            "connect_seconds",
            "scanner_alive",
            "cache_age_seconds",
        ):
            self.assertIn(key, diag)
        self.assertEqual(diag["verdict"], "connect-ok")

        self.relay.state.address = "cached"
        self.relay.state.seen_at = 1
        status, raw = self.request("POST", "/api/cache/bust")
        self.assertEqual(status, 200)
        self.assertTrue(self.session.cleared)
        status, raw = self.request("GET", "/api/status")
        snap = json.loads(raw)
        self.assertIsNone(snap["address"])
        self.assertFalse(snap["online"])

    def test_missing_file_and_oversize(self) -> None:
        body, content_type = _multipart({"kind": (None, b"still")})
        status, raw = self.request("POST", "/api/blob", body, {"Content-Type": content_type})
        self.assertEqual(status, 400)
        self.assertIn("detail", json.loads(raw))

        huge = b"\xff\xd8" + b"x" * 900_000
        body, content_type = _multipart({"file": ("big.jpg", huge), "kind": (None, b"still")})
        status, raw = self.request("POST", "/api/blob", body, {"Content-Type": content_type}, timeout=15)
        self.assertEqual(status, 413)
        self.assertIn("detail", json.loads(raw))

        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        conn.putrequest("POST", "/api/blob")
        conn.putheader("Content-Type", "multipart/form-data; boundary=x")
        conn.putheader("Content-Length", str(MAX_BODY_BYTES + 1))
        conn.endheaders()
        resp = conn.getresponse()
        self.assertEqual(resp.status, 413)
        payload = json.loads(resp.read())
        self.assertIn(str(MAX_BODY_BYTES), payload["detail"])
        conn.close()

    def test_concurrent_upload_is_rejected(self) -> None:
        self.session.hold = threading.Event()
        payload = b"\xff\xd8held"
        body, content_type = _multipart({"file": ("still.jpg", payload), "kind": (None, b"still")})
        result: dict = {}

        def first() -> None:
            result["pair"] = self.request("POST", "/api/blob", body, {"Content-Type": content_type}, timeout=10)

        thread = threading.Thread(target=first)
        thread.start()
        self.assertTrue(self.session.started.wait(3))
        status, raw = self.request("GET", "/api/status")
        snap = json.loads(raw)
        self.assertEqual(snap["state"], "sending")
        self.assertTrue(snap["online"])
        status, raw = self.request("POST", "/api/blob", body, {"Content-Type": content_type})
        self.assertEqual(status, 409)
        self.assertIn("already running", json.loads(raw)["detail"])
        self.session.hold.set()
        thread.join(5)
        self.assertEqual(result["pair"][0], 200)

    def test_help_page_without_static(self) -> None:
        status, raw = self.request("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn(b"simulated", raw)

    def test_static_index_and_asset_404(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "index.html").write_text("<p>badge-app</p>", encoding="utf-8")
            relay = Relay(FakeSession(), host="127.0.0.1", port=0, static_root=root, watch=False)
            relay.start()
            try:
                req = urllib.request.Request(f"http://127.0.0.1:{relay.port}/")
                with urllib.request.urlopen(req, timeout=5) as resp:
                    self.assertEqual(resp.status, 200)
                    self.assertIn(b"badge-app", resp.read())
                req = urllib.request.Request(f"http://127.0.0.1:{relay.port}/assets/app.js")
                with self.assertRaises(urllib.error.HTTPError) as caught:
                    urllib.request.urlopen(req, timeout=5)
                self.assertEqual(caught.exception.code, 404)
                try:
                    self.assertNotIn(b"badge-app", caught.exception.read())
                finally:
                    caught.exception.close()
            finally:
                relay.close()


if __name__ == "__main__":
    unittest.main()
