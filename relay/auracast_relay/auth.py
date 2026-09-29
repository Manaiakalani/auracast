"""Jieli RCSP auth, ported from web/src/jl-auth.ts.

Tables are loaded from that file so this copy cannot drift from the browser.
The browser module was checked against a captured handshake. This port is
checked against getEncryptedAuthData() in Node. The handshake also succeeded on a physical E87.
"""

from __future__ import annotations

import re
from pathlib import Path

_TS_PATH = Path(__file__).resolve().parents[2] / "web" / "src" / "jl-auth.ts"
_MASK = 0x9999


def _load_array(name: str, text: str) -> list[int]:
    match = re.search(rf"const {name}(?:: number\[\])?\s*=\s*\[([^\]]+)\]", text)
    if not match:
        raise RuntimeError(f"Could not find {name} in {_TS_PATH}")
    return [int(token, 0) for token in re.findall(r"0x[0-9a-fA-F]+|\d+", match.group(1))]


def _load_tables() -> tuple[list[int], list[int], list[int], list[int], list[int]]:
    if not _TS_PATH.is_file():
        raise RuntimeError(f"Missing {_TS_PATH}. Run the relay from a checkout of this repo.")
    text = _TS_PATH.read_text(encoding="utf-8")
    ks = _load_array("KS_TABLE", text)
    sbox = _load_array("SBOX", text)
    isbox = _load_array("ISBOX", text)
    static_key = _load_array("STATIC_KEY", text)
    magic = _load_array("MAGIC", text)
    if len(ks) < 256 or len(sbox) < 256 or len(isbox) < 256:
        raise RuntimeError("jl-auth.ts tables are shorter than 256 bytes")
    if len(static_key) != 16 or len(magic) != 6:
        raise RuntimeError("jl-auth.ts STATIC_KEY or MAGIC has an unexpected length")
    return ks, sbox, isbox, static_key, magic


KS_TABLE, SBOX, ISBOX, STATIC_KEY, MAGIC = _load_tables()


def key_schedule(data16: list[int]) -> list[int]:
    out = [0] * 272
    for i in range(16):
        out[i] = data16[i] & 0xFF
    buf = [b & 0xFF for b in data16[:16]]
    checksum = 0
    for b in data16[:16]:
        checksum ^= b
    buf.append(checksum & 0xFF)
    for rnd in range(16):
        for i in range(17):
            b = buf[i]
            buf[i] = ((b << 3) | (b >> 5)) & 0xFF
        read_pos = (rnd + 1) % 17
        for j in range(16):
            src = buf[read_pos]
            tbl_idx = 0xF + rnd * 16 - j
            out[16 + rnd * 16 + j] = (KS_TABLE[tbl_idx] + src) & 0xFF
            read_pos += 1
            if read_pos > 16:
                read_pos = 0
    return out


def _fibonacci_mix(state: list[int]) -> list[int]:
    r: dict[int, int] = {}
    mask = 0xFFFFFFFF
    s = state
    r[16] = s[0]
    r[17] = s[1]
    r[3] = s[2]
    r[4] = s[3]
    r[5] = s[4]
    r[6] = s[5]
    r[7] = s[6]
    r[19] = s[7]
    r[20] = s[8]
    r[21] = s[9]
    r[22] = s[10]
    r[23] = s[11]
    r[24] = s[12]
    r[25] = s[13]
    r[26] = s[14]
    r[27] = s[15]

    r[28] = (r[17] + r[16] * 2) & mask
    r[16] = (r[17] + r[16]) & mask
    r[17] = (r[4] + r[3] * 2) & mask
    r[3] = (r[4] + r[3]) & mask
    r[4] = (r[6] + r[5] * 2) & mask
    r[5] = (r[6] + r[5]) & mask
    r[6] = (r[19] + r[7] * 2) & mask
    r[7] = (r[19] + r[7]) & mask
    r[19] = (r[21] + r[20] * 2) & mask
    r[20] = (r[21] + r[20]) & mask
    r[21] = (r[23] + r[22] * 2) & mask
    r[22] = (r[23] + r[22]) & mask
    r[23] = (r[25] + r[24] * 2) & mask
    r[24] = (r[25] + r[24]) & mask
    r[25] = (r[27] + r[26] * 2) & mask
    r[26] = (r[27] + r[26]) & mask

    r[27] = (r[22] + r[19] * 2) & mask
    r[19] = (r[22] + r[19]) & mask
    r[22] = (r[26] + r[23] * 2) & mask
    r[23] = (r[26] + r[23]) & mask
    r[26] = (r[16] + r[17] * 2) & mask
    r[16] = (r[17] + r[16]) & mask
    r[17] = (r[5] + r[6] * 2) & mask
    r[5] = (r[6] + r[5]) & mask
    r[6] = (r[20] + r[21] * 2) & mask
    r[20] = (r[21] + r[20]) & mask
    r[21] = (r[24] + r[25] * 2) & mask
    r[24] = (r[25] + r[24]) & mask
    r[25] = (r[7] + r[28] * 2) & mask
    r[7] = (r[7] + r[28]) & mask
    r[28] = (r[3] + r[4] * 2) & mask
    r[3] = (r[4] + r[3]) & mask

    r[4] = (r[24] + r[6] * 2) & mask
    r[6] = (r[24] + r[6]) & mask
    r[24] = (r[3] + r[25] * 2) & mask
    r[3] = (r[25] + r[3]) & mask
    r[25] = (r[19] + r[22] * 2) & mask
    r[19] = (r[22] + r[19]) & mask
    r[22] = (r[16] + r[17] * 2) & mask
    r[16] = (r[17] + r[16]) & mask
    r[17] = (r[20] + r[21] * 2) & mask
    r[20] = (r[21] + r[20]) & mask
    r[21] = (r[7] + r[28] * 2) & mask
    r[7] = (r[7] + r[28]) & mask
    r[28] = (r[5] + r[27] * 2) & mask
    r[5] = (r[27] + r[5]) & mask
    r[27] = (r[23] + r[26] * 2) & mask
    r[23] = (r[23] + r[26]) & mask

    r[26] = (r[7] + r[17] * 2) & mask
    r[17] = (r[17] + r[7]) & mask
    r[7] = (r[23] + r[28] * 2) & mask
    r[23] = (r[23] + r[28]) & mask
    r[28] = (r[6] + r[24] * 2) & mask
    r[6] = (r[6] + r[24]) & mask
    r[24] = (r[19] + r[22] * 2) & mask
    r[19] = (r[19] + r[22]) & mask
    r[22] = (r[20] + r[21] * 2) & mask
    r[20] = (r[20] + r[21]) & mask
    r[21] = (r[5] + r[27] * 2) & mask
    r[5] = (r[27] + r[5]) & mask
    r[27] = (r[16] + r[4] * 2) & mask
    r[16] = (r[4] + r[16]) & mask
    r[4] = (r[3] + r[25] * 2) & mask
    r[3] = (r[25] + r[3]) & mask

    return [
        r[26] & 0xFF, r[17] & 0xFF, r[7] & 0xFF, r[23] & 0xFF,
        r[28] & 0xFF, r[6] & 0xFF, r[24] & 0xFF, r[19] & 0xFF,
        r[22] & 0xFF, r[20] & 0xFF, r[21] & 0xFF, r[5] & 0xFF,
        r[27] & 0xFF, r[16] & 0xFF, r[4] & 0xFF, r[3] & 0xFF,
    ]


def _cond_mix(state: list[int], key_block: list[int], mask: int, phase: int) -> list[int]:
    result = state[:]
    for i in range(16):
        bit_set = ((1 << i) & mask) != 0
        if phase == 3:
            result[i] = (result[i] ^ key_block[i]) if bit_set else ((key_block[i] + result[i]) & 0xFF)
        else:
            result[i] = ((key_block[i] + result[i]) & 0xFF) if bit_set else (result[i] ^ key_block[i])
    return result


def _sbox_sub(state: list[int]) -> list[int]:
    result = state[:]
    for pos in (0, 3, 4, 7, 8, 11, 12, 15):
        result[pos] = SBOX[result[pos]]
    for pos in (1, 2, 5, 6, 9, 10, 13, 14):
        result[pos] = ISBOX[result[pos]]
    return result


def _block_cipher(state_in: list[int], ek: list[int], mode: int) -> list[int]:
    s = state_in[:]
    initial = state_in[:]
    s = _cond_mix(s, ek[0:16], _MASK, 3)
    s = _sbox_sub(s)
    s = _cond_mix(s, ek[16:32], _MASK, 5)
    for x9 in range(1, 9):
        s = _fibonacci_mix(s)
        ek_off = x9 * 0x20
        if x9 == 8:
            s = _cond_mix(s, ek[0x100:0x110], _MASK, 3)
            break
        if mode != 0 and x9 == 2:
            mixed = s[:]
            for i in range(16):
                bit_set = ((1 << i) & _MASK) != 0
                mixed[i] = (s[i] ^ initial[i]) if bit_set else ((initial[i] + s[i]) & 0xFF)
            s = mixed
        s = _cond_mix(s, ek[ek_off:ek_off + 16], _MASK, 3)
        s = _sbox_sub(s)
        s = _cond_mix(s, ek[ek_off + 16:ek_off + 32], _MASK, 5)
    return s


def function_e1test(key6: list[int], input16: list[int], seed16: list[int]) -> list[int]:
    expanded = [key6[i % 6] for i in range(16)]
    output = input16[:16]
    cipher_out = _block_cipher(output[:], key_schedule(seed16[:16]), 0)
    for i in range(16):
        cipher_out[i] = (expanded[i] + (cipher_out[i] ^ input16[i])) & 0xFF
    obf = [
        (seed16[0] - 0x17) & 0xFF, seed16[1] ^ 0xE5,
        (seed16[2] - 0x21) & 0xFF, seed16[3] ^ 0xC1,
        (seed16[4] - 0x4D) & 0xFF, seed16[5] ^ 0xA7,
        (seed16[6] - 0x6B) & 0xFF, seed16[7] ^ 0x83,
        seed16[8] ^ 0xE9, (seed16[9] - 0x1B) & 0xFF,
        seed16[10] ^ 0xDF, (seed16[11] - 0x3F) & 0xFF,
        seed16[12] ^ 0xB3, (seed16[13] - 0x59) & 0xFF,
        seed16[14] ^ 0x95, (seed16[15] - 0x7D) & 0xFF,
    ]
    return _block_cipher(cipher_out, key_schedule(obf), 1)


def get_encrypted_auth_data(device_data_17: bytes) -> bytes:
    if len(device_data_17) < 17:
        raise ValueError("auth challenge must be 17 bytes")
    encrypted = function_e1test(MAGIC, list(device_data_17[1:17]), STATIC_KEY)
    return bytes([0x01, *encrypted])
