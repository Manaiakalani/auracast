"""Same-origin HTTP bridge the AuraCast page already calls.

GET  /api/status
POST /api/blob          multipart fields: file, kind (still|animated)
POST /api/cancel
GET  /api/diagnostics
POST /api/cache/bust

There is no login. Bind to 127.0.0.1 unless an iPhone on the same Wi-Fi
needs --lan. The iPhone uses this computer's Bluetooth radio.
"""

from __future__ import annotations

import asyncio
import json
import mimetypes
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

MAX_UPLOAD_BYTES = 900_000
MAX_BODY_BYTES = 2_000_000

_MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
    ".map": "application/json",
    ".wasm": "application/wasm",
}


class RelayState:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.seen_at: float | None = None
        self.address: str | None = None
        self.name: str | None = None
        self.state = "idle"
        self.detail = "Relay up. No badge advertising."
        self.percent: int | None = None
        self.total: int | None = None
        self.scanner_alive = False
        self.busy = False

    def is_busy(self) -> bool:
        with self.lock:
            return self.busy

    def set_busy(self, value: bool) -> None:
        with self.lock:
            self.busy = value

    def set_phase(self, state: str, detail: str) -> None:
        with self.lock:
            self.state = state
            self.detail = detail
            if state != "sending":
                self.percent = None
                self.total = None

    def set_progress(self, percent: int, total: int) -> None:
        with self.lock:
            self.state = "sending"
            self.percent = percent
            self.total = total
            self.detail = f"{percent}% of {total} bytes"

    def note_sighting(self, hit) -> None:
        with self.lock:
            self.scanner_alive = True
            if hit is not None:
                self.seen_at = time.time()
                self.address = hit.address
                self.name = hit.name
                if self.state not in ("sending", "connecting"):
                    self.state = "idle"
                    self.detail = f"{hit.name} is advertising."
            elif self.state not in ("sending", "connecting", "error"):
                self.state = "idle"
                if self.seen_at is None:
                    self.detail = "Relay up. No badge advertising."

    def note_adapter_error(self, message: str) -> None:
        with self.lock:
            self.scanner_alive = False
            if self.state not in ("sending", "connecting"):
                self.state = "adapter"
                self.detail = message

    def snapshot(self) -> dict:
        with self.lock:
            now = time.time()
            ago = None if self.seen_at is None else int(now - self.seen_at)
            online = self.seen_at is not None and (now - self.seen_at) <= 12
            if self.state == "sending":
                online = True
            progress = None
            if self.percent is not None:
                progress = {"percent": int(self.percent), "total_bytes": int(self.total or 0)}
            return {
                "online": online,
                "seen_seconds_ago": ago,
                "state": self.state,
                "detail": self.detail,
                "address": self.address,
                "progress": progress,
            }


def parse_multipart(content_type: str, body: bytes) -> dict[str, dict[str, bytes | str]]:
    match = re.search(r'boundary=(?:"([^"]+)"|([^;]+))', content_type, re.I)
    if not match:
        raise ValueError("multipart body is missing a boundary")
    boundary = (match.group(1) or match.group(2)).strip().encode("utf-8")
    parts = body.split(b"--" + boundary)
    fields: dict[str, dict[str, bytes | str]] = {}
    for part in parts:
        if not part or part in (b"--", b"--\r\n") or part.startswith(b"--"):
            continue
        if part.startswith(b"\r\n"):
            part = part[2:]
        if part.endswith(b"\r\n"):
            part = part[:-2]
        header_blob, sep, data = part.partition(b"\r\n\r\n")
        if not sep:
            continue
        disposition = ""
        for line in header_blob.decode("utf-8", "replace").split("\r\n"):
            if line.lower().startswith("content-disposition:"):
                disposition = line
        name_match = re.search(r'name="([^"]*)"', disposition)
        if not name_match:
            continue
        file_match = re.search(r'filename="([^"]*)"', disposition)
        fields[name_match.group(1)] = {
            "filename": file_match.group(1) if file_match else "",
            "data": data,
        }
    return fields


def _static_file(root: Path, url_path: str) -> Path | None:
    rel = unquote(url_path).lstrip("/")
    if not rel or rel.endswith("/"):
        rel = (rel + "index.html") if rel else "index.html"
    candidate = (root / rel).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        return None
    if candidate.is_file():
        return candidate
    if "." not in Path(rel).name:
        index = (root / "index.html").resolve()
        if index.is_file():
            return index
    return None


_HELP = """<!doctype html>
<meta charset="utf-8">
<title>AuraCast relay</title>
<style>
  body { font: 16px/1.45 system-ui, sans-serif; max-width: 40rem; margin: 3rem auto; padding: 0 1rem; color: #142; }
  code { background: #f2f2f2; padding: 0.1rem 0.3rem; }
</style>
<h1>AuraCast relay</h1>
<p>This process is the Bluetooth bridge. The page API is up. To use it from Safari, Firefox, or an iPhone, build the web app and restart so this server can host it:</p>
<pre>cd web
npm run build</pre>
<p>Then open this same address again. An iPhone must stay on the same Wi-Fi. The phone does not talk to the badge itself. This computer's Bluetooth radio does.</p>
<p>A still image and the Painted Base loop were sent to a physical E87. Unit tests still use a simulated badge.</p>
"""


class Relay:
    def __init__(self, session, host: str = "127.0.0.1", port: int = 8787, static_root: Path | None = None, watch: bool = True) -> None:
        self.session = session
        self.state = RelayState()
        self.static_root = static_root
        self.watch = watch
        self.cancel = threading.Event()
        self._stop = threading.Event()
        self.loop = asyncio.new_event_loop()
        self.loop_thread = threading.Thread(target=self._run_loop, name="auracast-relay-loop", daemon=True)
        self.httpd = ThreadingHTTPServer((host, port), self._handler())
        self.http_thread = threading.Thread(target=self.httpd.serve_forever, name="auracast-relay-http", daemon=True)
        self._upload_lock = threading.Lock()

    @property
    def port(self) -> int:
        return int(self.httpd.server_address[1])

    def _run_loop(self) -> None:
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()

    def run(self, coro, timeout: float):
        future = asyncio.run_coroutine_threadsafe(coro, self.loop)
        try:
            return future.result(timeout=timeout)
        except Exception:
            future.cancel()
            raise

    def start(self) -> None:
        self.loop_thread.start()
        self.http_thread.start()
        if self.watch:
            asyncio.run_coroutine_threadsafe(self._watch(), self.loop)

    def close(self) -> None:
        self._stop.set()
        self.cancel.set()
        self.httpd.shutdown()
        self.httpd.server_close()
        self.loop.call_soon_threadsafe(self.loop.stop)
        self.loop_thread.join(timeout=3)
        if not self.loop.is_closed():
            self.loop.close()

    async def _watch(self) -> None:
        announced = False
        while not self._stop.is_set():
            if not self.state.is_busy():
                try:
                    hit = await self.session.scan(2.0)
                    self.state.note_sighting(hit)
                    announced = False
                except Exception as exc:
                    self.state.note_adapter_error(str(exc))
                    if not announced:
                        print(f"[relay] Bluetooth scan failed: {exc}", flush=True)
                        announced = True
            for _ in range(30):
                if self._stop.is_set():
                    return
                await asyncio.sleep(0.1)

    def _handler(self):
        relay = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, fmt: str, *args) -> None:
                return

            def _json(self, status: int, payload: dict) -> None:
                body = json.dumps(payload).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)

            def _bytes(self, status: int, body: bytes, content_type: str) -> None:
                self.send_response(status)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self) -> None:  # noqa: N802
                path = urlparse(self.path).path
                if path == "/api/status":
                    self._json(200, relay.state.snapshot())
                    return
                if path == "/api/diagnostics":
                    self._diagnostics()
                    return
                if relay.static_root is not None:
                    found = _static_file(relay.static_root, path)
                    if found is not None:
                        mime = _MIME.get(found.suffix.lower()) or mimetypes.guess_type(found.name)[0] or "application/octet-stream"
                        self._bytes(200, found.read_bytes(), mime)
                        return
                    self._bytes(404, b"Not found", "text/plain; charset=utf-8")
                    return
                if path == "/":
                    self._bytes(200, _HELP.encode("utf-8"), "text/html; charset=utf-8")
                    return
                self._json(404, {"detail": "Not found"})

            def do_POST(self) -> None:  # noqa: N802
                path = urlparse(self.path).path
                if path == "/api/cancel":
                    relay.cancel.set()
                    self._json(200, {"ok": True})
                    return
                if path == "/api/cache/bust":
                    relay.session.clear_cache()
                    with relay.state.lock:
                        relay.state.seen_at = None
                        relay.state.address = None
                        relay.state.name = None
                        relay.state.detail = "BLE cache cleared. Next send scans again."
                        if relay.state.state not in ("sending", "connecting"):
                            relay.state.state = "idle"
                    self._json(200, {"ok": True})
                    return
                if path != "/api/blob":
                    self._json(404, {"detail": "Not found"})
                    return
                self._upload()

            def _read_body(self) -> bytes | None:
                try:
                    length = int(self.headers.get("Content-Length", "0"))
                except ValueError:
                    self._json(400, {"detail": "Bad Content-Length"})
                    return None
                if length > MAX_BODY_BYTES:
                    self._json(413, {"detail": f"Body is {length} bytes. The limit is {MAX_BODY_BYTES}."})
                    return None
                return self.rfile.read(length) if length else b""

        # Bind the nested methods that need the handler instance via a mixin-style assignment.
        def diagnostics(handler: Handler) -> None:
            if not relay._upload_lock.acquire(blocking=False):
                handler._json(409, {"detail": "An upload is already running."})
                return
            relay.state.set_busy(True)
            try:
                result = relay.run(relay.session.diagnostics(), timeout=60)
                handler._json(200, result)
            except Exception as exc:
                handler._json(500, {"detail": str(exc)})
            finally:
                relay.state.set_busy(False)
                relay._upload_lock.release()

        def upload(handler: Handler) -> None:
            body = handler._read_body()
            if body is None:
                return
            if not relay._upload_lock.acquire(blocking=False):
                handler._json(409, {"detail": "An upload is already running."})
                return
            try:
                content_type = handler.headers.get("Content-Type", "")
                try:
                    fields = parse_multipart(content_type, body)
                except ValueError as exc:
                    handler._json(400, {"detail": str(exc)})
                    return
                file_field = fields.get("file")
                if not file_field or not file_field["data"]:
                    handler._json(400, {"detail": "Missing file field."})
                    return
                payload = bytes(file_field["data"])
                if len(payload) > MAX_UPLOAD_BYTES:
                    handler._json(413, {"detail": f"File is {len(payload)} bytes, over the {MAX_UPLOAD_BYTES} byte fit."})
                    return
                kind_raw = fields.get("kind", {}).get("data", b"")
                kind = bytes(kind_raw).decode("utf-8", "replace").strip() if kind_raw else ""
                filename = str(file_field.get("filename") or "")
                if kind not in ("still", "animated"):
                    kind = "still" if filename.lower().endswith((".jpg", ".jpeg")) or payload.startswith(b"\xff\xd8") else "animated"
                language_raw = fields.get("language", {}).get("data", b"")
                language = bytes(language_raw).decode("utf-8", "replace").strip() if language_raw else "en"
                if language not in ("en", "zh-CN"):
                    language = "en"
                relay.cancel.clear()
                relay.state.set_busy(True)
                relay.state.set_phase("connecting", "Connecting to the badge...")
                relay.state.set_progress(0, len(payload))

                def log(msg: str) -> None:
                    print(f"[relay] {msg}", flush=True)
                    with relay.state.lock:
                        if relay.state.state != "error":
                            relay.state.detail = msg

                def on_progress(sent: int, total: int) -> None:
                    percent = 0 if total <= 0 else min(100, round(sent * 100 / total))
                    relay.state.set_progress(percent, total)

                def cancel() -> bool:
                    return relay.cancel.is_set()

                try:
                    relay.run(
                        relay.session.upload(payload, kind, cancel, on_progress, log, language),
                        timeout=300,
                    )
                except Exception as exc:
                    message = str(exc) or exc.__class__.__name__
                    relay.state.set_phase("error", message)
                    handler._json(500, {"detail": message})
                    return
                relay.state.set_phase("idle", "Upload finished.")
                handler._json(200, {"ok": True})
            finally:
                relay.state.set_busy(False)
                relay._upload_lock.release()

        Handler._diagnostics = diagnostics  # type: ignore[attr-defined]
        Handler._upload = upload  # type: ignore[attr-defined]
        return Handler


def main_static(path: str | None) -> Path | None:
    if path:
        root = Path(path).expanduser().resolve()
        if not root.is_dir():
            raise SystemExit(f"Static directory does not exist: {root}")
        return root
    return None
