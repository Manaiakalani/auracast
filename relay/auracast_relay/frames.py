"""E87 frame codec, CRC-16/XMODEM, and the FILE_COMPLETE path body.

Mirrors web/src/lib/e87-protocol.ts and web/src/lib/utils.ts. The timestamped
device path is intentionally not a fixed filename: each upload is a new file
on the badge.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime


@dataclass
class E87Frame:
    flag: int
    cmd: int
    body: bytes


def crc16_xmodem(data: bytes) -> int:
    crc = 0x0000
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return crc


def to_hex(data: bytes) -> str:
    return data.hex()


def parse_e87_frame(data: bytes) -> E87Frame | None:
    if len(data) < 8:
        return None
    if data[0] != 0xFE or data[1] != 0xDC or data[2] != 0xBA:
        return None
    if data[-1] != 0xEF:
        return None
    flag = data[3]
    cmd = data[4]
    length = (data[5] << 8) | data[6]
    body = data[7:-1]
    if len(body) != length:
        return None
    return E87Frame(flag, cmd, body)


def build_e87_frame(flag: int, cmd: int, body: bytes) -> bytes:
    out = bytearray(3 + 1 + 1 + 2 + len(body) + 1)
    out[0] = 0xFE
    out[1] = 0xDC
    out[2] = 0xBA
    out[3] = flag & 0xFF
    out[4] = cmd & 0xFF
    out[5] = (len(body) >> 8) & 0xFF
    out[6] = len(body) & 0xFF
    out[7:7 + len(body)] = body
    out[-1] = 0xEF
    return bytes(out)


def build_qix_frame(cmd: int, payload: bytes, flag: int) -> bytes:
    inner = bytearray(4 + len(payload))
    inner[0] = flag & 0xFF
    inner[1] = cmd & 0xFF
    inner[2] = len(payload) & 0xFF
    inner[3] = (len(payload) >> 8) & 0xFF
    inner[4:] = payload
    checksum = sum(inner) & 0xFF
    return bytes([0x9E, checksum, *inner])


def random_temp_name() -> str:
    return f"{secrets.token_hex(3)}.tmp"


def extension_for(payload: bytes, kind: str) -> str:
    if payload.startswith(b"\xff\xd8"):
        return ".jpg"
    if payload.startswith(b"RIFF"):
        return ".avi"
    return ".jpg" if kind == "still" else ".avi"


def build_file_path_response(device_seq: int, ext: str, now: datetime | None = None) -> bytes:
    stamp = now or datetime.now()
    date_str = stamp.strftime("%Y%m%d%H%M%S")
    # U+555C is the path prefix the badge firmware expects. UTF-16LE plus NUL.
    device_path = f"\u555c{date_str}{ext}"
    encoded = device_path.encode("utf-16le") + b"\x00\x00"
    return bytes([0x00, device_seq & 0xFF]) + encoded


def local_time_payload(now: datetime | None = None) -> bytes:
    stamp = now or datetime.now()
    year = stamp.year
    return bytes([
        0x9E, 0x45, 0x08, 0x02, 0x07, 0x00,
        year & 0xFF, (year >> 8) & 0xFF,
        stamp.month, stamp.day, 0x00,
        stamp.hour, stamp.minute,
    ])
