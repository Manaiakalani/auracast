"""python3 -m auracast_relay [--lan] [--port 8787]

Run this from the relay/ directory, or with relay/ on PYTHONPATH.
An iPhone uses --lan and opens the printed http address. The phone
does not talk to the badge. This computer's Bluetooth radio does.
"""

from __future__ import annotations

import argparse
import socket
from pathlib import Path

from .ble import BleakSession
from .server import Relay


def _lan_ips() -> list[str]:
    ips: list[str] = []
    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(("8.8.8.8", 80))
        ips.append(probe.getsockname()[0])
        probe.close()
    except OSError:
        pass
    return ips


def _default_static() -> Path | None:
    dist = Path(__file__).resolve().parents[2] / "web" / "dist"
    if (dist / "index.html").is_file():
        return dist
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description="AuraCast Bluetooth relay for Safari, Firefox, and iPhone.")
    parser.add_argument("--host", default="127.0.0.1", help="Bind address. Default 127.0.0.1.")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--lan", action="store_true", help="Bind 0.0.0.0 so a phone on this Wi-Fi can connect. No password.")
    parser.add_argument("--static", dest="static_dir", default=None, help="Directory of the built web app. Default: web/dist if it exists.")
    parser.add_argument("--no-watch", action="store_true", help="Do not scan for a badge until Connect/Send.")
    args = parser.parse_args()
    host = "0.0.0.0" if args.lan else args.host
    if args.static_dir:
        static_root = Path(args.static_dir).expanduser().resolve()
        if not static_root.is_dir():
            raise SystemExit(f"Static directory does not exist: {static_root}")
    else:
        static_root = _default_static()

    relay = Relay(BleakSession(), host=host, port=args.port, static_root=static_root, watch=not args.no_watch)
    relay.start()
    port = relay.port
    print("[relay] AuraCast relay is up.", flush=True)
    print("[relay] A still image and the Painted Base loop were sent to a physical E87. Unit tests still use a simulated badge.", flush=True)
    if static_root is None:
        print("[relay] web/dist was not found. API only. Build with: cd web && npm run build", flush=True)
    else:
        print(f"[relay] Serving {static_root}", flush=True)
    if host in ("0.0.0.0", "::"):
        print(f"[relay] Local:   http://127.0.0.1:{port}/", flush=True)
        for ip in _lan_ips():
            print(f"[relay] On Wi-Fi: http://{ip}:{port}/", flush=True)
        print("[relay] --lan has no password. Use it only on a network you trust.", flush=True)
    else:
        print(f"[relay] Open http://{host}:{port}/", flush=True)
    print("[relay] Dev UI: npm run dev in web/ proxies /api to this port.", flush=True)
    try:
        relay.http_thread.join()
    except KeyboardInterrupt:
        print("\n[relay] Stopping.", flush=True)
    finally:
        relay.close()


if __name__ == "__main__":
    main()
