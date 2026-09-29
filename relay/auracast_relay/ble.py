"""Bleak adapter for the E87 / E92 / L8 / X9 badge.

Discovery follows the same service and characteristic candidates as
web/src/lib/e87-protocol.ts. A scan or an auth probe is as far as this
machine was exercised: no file was written to a badge from here.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass

from .link import Link
from .upload import UploadError, ensure_auth, write_file

NAME_PREFIXES = ("e87", "e92", "l8", "x9", "led badge")

SERVICE_CANDIDATES = (
    "ae00",
    "0000ae00-0000-1000-8000-00805f9b34fb",
    "fd00",
    "0000fd00-0000-1000-8000-00805f9b34fb",
    "c2e6fd00-e966-1000-8000-bef9c223df6a",
)
WRITE_CANDIDATES = ("ae01", "0000ae01-0000-1000-8000-00805f9b34fb")
CONTROL_CANDIDATES = ("c2e6fd02-e966-1000-8000-bef9c223df6a",)
NOTIFY_CANDIDATES = (
    "ae02",
    "0000ae02-0000-1000-8000-00805f9b34fb",
    "c2e6fd01-e966-1000-8000-bef9c223df6a",
    "c2e6fd03-e966-1000-8000-bef9c223df6a",
    "c2e6fd05-e966-1000-8000-bef9c223df6a",
)


def _norm(value: str) -> str:
    return value.lower().replace("-", "")


def _matches(uuid: str, candidates: tuple[str, ...]) -> bool:
    norm = _norm(uuid)
    return any(_norm(candidate) in norm for candidate in candidates)


def name_matches(name: str | None) -> bool:
    if not name:
        return False
    lowered = name.lower()
    return any(lowered.startswith(prefix) for prefix in NAME_PREFIXES)


@dataclass
class Sighting:
    name: str
    address: str
    device: object


class BleakLink(Link):
    def __init__(self, client, write_char, control_char, notify_chars) -> None:
        super().__init__()
        self.client = client
        self.write_char = write_char
        self.control_char = control_char
        self.notify_chars = list(notify_chars)

    def _on_notify(self, _sender, data) -> None:
        self.receive(bytes(data))

    async def start(self) -> None:
        for char in self.notify_chars:
            await self.client.start_notify(char, self._on_notify)

    async def stop(self) -> None:
        for char in self.notify_chars:
            try:
                await self.client.stop_notify(char)
            except Exception:
                pass

    async def _write(self, char, data: bytes) -> None:
        props = set(getattr(char, "properties", []) or [])
        response = "write-without-response" not in props
        await self.client.write_gatt_char(char, data, response=response)

    async def write_data(self, data: bytes) -> None:
        await self._write(self.write_char, data)

    async def write_control(self, data: bytes) -> None:
        await self._write(self.control_char, data)


def _import_bleak():
    try:
        from bleak import BleakClient, BleakScanner
    except ImportError as exc:
        raise UploadError(
            "Bluetooth support is not installed. From the relay directory run: "
            "python3 -m pip install -r requirements.txt"
        ) from exc
    return BleakClient, BleakScanner


def _services_of(client):
    services = getattr(client, "services", None)
    if not services:
        raise UploadError("Connected, but the badge exposed no GATT services.")
    return list(services)


async def open_link(client, log) -> BleakLink:
    writable = []
    notifiable = []
    for service in _services_of(client):
        chars = list(getattr(service, "characteristics", []) or [])
        log(f"Service {service.uuid} exposes {len(chars)} characteristic(s).")
        for char in chars:
            props = set(char.properties or [])
            if "write" in props or "write-without-response" in props:
                writable.append(char)
                log(f"  writable: {char.uuid}")
            if "notify" in props or "indicate" in props:
                notifiable.append(char)
                log(f"  notify: {char.uuid}")
    write = next((char for char in writable if _matches(char.uuid, WRITE_CANDIDATES)), None)
    if write is None:
        seen = ", ".join(char.uuid for char in writable) or "none"
        raise UploadError(f"E87 requires AE01 data writer; discovered: {seen}")
    control = next((char for char in writable if _matches(char.uuid, CONTROL_CANDIDATES)), None)
    if control is None:
        seen = ", ".join(char.uuid for char in writable) or "none"
        raise UploadError(f"E87 requires FD02 control writer; discovered: {seen}")
    preferred = [char for char in notifiable if _matches(char.uuid, NOTIFY_CANDIDATES)]
    chosen = preferred or notifiable
    if not chosen:
        raise UploadError("E87 requires a notify characteristic; none discovered.")
    log(f"Selected write: {write.uuid}")
    log(f"Selected control: {control.uuid}")
    for char in chosen:
        log(f"Selected notify: {char.uuid}")
    mtu = getattr(client, "mtu_size", None)
    if mtu:
        log(f"ATT MTU: {mtu}")
    link = BleakLink(client, write, control, chosen)
    await link.start()
    return link


class BleakSession:
    """Scans and uploads on one asyncio loop. Cache is the last matching advertisement."""

    def __init__(self) -> None:
        self._ble = __import__("asyncio").Lock()
        self._meta = threading.Lock()
        self._cached: Sighting | None = None
        self._cached_at: float | None = None
        self._force = False

    def clear_cache(self) -> None:
        with self._meta:
            self._cached = None
            self._cached_at = None
            self._force = True

    def cache_age(self) -> float | None:
        with self._meta:
            if self._cached_at is None:
                return None
            return max(0.0, time.time() - self._cached_at)

    async def _scan_unlocked(self, timeout: float) -> Sighting | None:
        _BleakClient, BleakScanner = _import_bleak()
        try:
            devices = await BleakScanner.discover(timeout=timeout)
        except Exception as exc:
            raise UploadError(f"Bluetooth scan failed: {exc}") from exc
        matches = [device for device in devices if name_matches(getattr(device, "name", None))]
        if not matches:
            return None
        device = matches[0]
        if len(matches) > 1:
            names = ", ".join((getattr(item, "name", None) or "?") for item in matches)
            print(f"[relay] {len(matches)} badges advertising ({names}). Using {device.name}.", flush=True)
        sight = Sighting(name=device.name or "badge", address=device.address, device=device)
        with self._meta:
            self._cached = sight
            self._cached_at = time.time()
            self._force = False
        return sight

    async def scan(self, timeout: float) -> Sighting | None:
        async with self._ble:
            return await self._scan_unlocked(timeout)

    async def _connect(self, sight: Sighting, log):
        BleakClient, _scanner = _import_bleak()
        client = BleakClient(sight.device, timeout=25.0)
        try:
            await client.connect()
        except Exception as exc:
            with self._meta:
                self._cached = None
                self._cached_at = None
            raise UploadError(f"Could not connect to {sight.name}: {exc}") from exc
        if not client.is_connected:
            raise UploadError(f"Could not connect to {sight.name}.")
        try:
            link = await open_link(client, log)
        except Exception:
            try:
                await client.disconnect()
            except Exception:
                pass
            raise
        return client, link

    async def probe(self, sight: Sighting) -> None:
        logs: list[str] = []

        def log(msg: str) -> None:
            logs.append(msg)
            print(f"[relay] {msg}", flush=True)

        async with self._ble:
            client, link = await self._connect(sight, log)
            try:
                await ensure_auth(link, log)
            finally:
                try:
                    await link.stop()
                finally:
                    await client.disconnect()

    async def upload(self, payload: bytes, kind: str, cancel, on_progress, log, language: str = "en") -> None:
        async with self._ble:
            with self._meta:
                cached = None if self._force else self._cached
            sight = cached
            if sight is None:
                log("Scanning for a badge...")
                sight = await self._scan_unlocked(6.0)
            if sight is None:
                raise UploadError("No badge advertising. Wake it with the side button and try again.")
            log(f"Connecting to {sight.name} ({sight.address})...")
            client, link = await self._connect(sight, log)
            try:
                await write_file(
                    link,
                    payload,
                    kind=kind,
                    log=log,
                    on_progress=on_progress,
                    cancel=cancel,
                    language=language,
                    pace=True,
                )
            finally:
                try:
                    await link.stop()
                finally:
                    try:
                        await client.disconnect()
                    except Exception as exc:
                        log(f"Disconnect: {exc}")

    async def diagnostics(self) -> dict:
        started = time.monotonic()
        try:
            hit = await self.scan(4.0)
        except Exception as exc:
            return {
                "verdict": "scan-failed",
                "detail": str(exc),
                "scan_seconds": round(time.monotonic() - started, 2),
                "scan_found": False,
                "connect_seconds": None,
                "scanner_alive": False,
                "cache_age_seconds": self.cache_age(),
            }
        scan_seconds = round(time.monotonic() - started, 2)
        if hit is None:
            return {
                "verdict": "no-badge",
                "detail": "No E87, E92, L8, X9, or LED Badge advertisement.",
                "scan_seconds": scan_seconds,
                "scan_found": False,
                "connect_seconds": None,
                "scanner_alive": True,
                "cache_age_seconds": self.cache_age(),
            }
        connect_started = time.monotonic()
        try:
            await self.probe(hit)
        except Exception as exc:
            return {
                "verdict": "connect-failed",
                "detail": str(exc),
                "scan_seconds": scan_seconds,
                "scan_found": True,
                "connect_seconds": round(time.monotonic() - connect_started, 2),
                "scanner_alive": True,
                "cache_age_seconds": self.cache_age(),
            }
        return {
            "verdict": "connect-ok",
            "detail": f"Authenticated to {hit.name}. No file was sent. Upload has not been tried on a physical badge from this relay.",
            "scan_seconds": scan_seconds,
            "scan_found": True,
            "connect_seconds": round(time.monotonic() - connect_started, 2),
            "scanner_alive": True,
            "cache_age_seconds": self.cache_age(),
        }
