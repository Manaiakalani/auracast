# E87/L8 Badge Writer (Svelte)

Small Svelte 5 app to send images, video, text, patterns and QR codes to a
Jieli-based BLE LED badge.

- Primary GATT service: `0xAE00` (data) + `0xFD00` (control)
- See the [root README](../README.md) for the full protocol breakdown.

## Run (development)

```bash
npm install
npm run dev
```

Then open the local Vite URL.

## Browser support

The same UI runs everywhere, but how it reaches the badge depends on the
browser:

| Browser | Transport | Setup |
| ------------------ | ---------------- | ------------------------------ |
| Chrome, Edge, Brave, Arc, Opera (desktop + Android) | Native Web Bluetooth | None - just open the page |
| Safari (macOS + iOS) | HTTP bridge | Run the FastAPI bridge below |
| Firefox | HTTP bridge | Run the FastAPI bridge below |
| Chrome on iOS | HTTP bridge | Run the FastAPI bridge below (every iOS browser is WebKit) |

The frontend auto-detects `navigator.bluetooth`. If it's missing it falls
back to posting prepared payloads to a local FastAPI HTTP backend on the
same origin, which performs the BLE side in Python via `bleak`.
The "Connect" button labels itself "Connect (HTTP backend)" when running
in the fallback transport so the user can tell which path they are on.

### Running the HTTP bridge (Safari, Firefox, iOS, anything without Web Bluetooth)

The bridge implementation lives in a sibling project:
[`e87-webui`](https://github.com/Manaiakalani/e87-webui) (or your local
copy at `~/code/badge/e87-webui`). It wraps the Python [`e87_badge`
package](https://github.com/Manaiakalani/e87-cli) in FastAPI and serves
this same frontend at `/`.

Quick start (macOS / Linux, requires Python 3.11+):

```bash
# 1. Get the CLI/lib and the bridge
git clone https://github.com/Manaiakalani/e87-cli ~/code/badge/e87-cli
git clone https://github.com/Manaiakalani/e87-webui ~/code/badge/e87-webui

# 2. Install the BLE lib into a venv
cd ~/code/badge/e87-cli
python3 -m venv .venv && source .venv/bin/activate
pip install -e . fastapi 'uvicorn[standard]' python-multipart

# 3. Build this frontend once, drop it where the bridge serves it
cd ~/code/badge/web-bluetooth-e87/web
npm install && npm run build
ln -sfn "$(pwd)/dist" ~/code/badge/e87-webui/static

# 4. Run the bridge
cd ~/code/badge/e87-webui
python -m uvicorn server:app --host 0.0.0.0 --port 8089
```

Then open **any** browser at:

- Local: <http://localhost:8089/>
- Phone / tablet on the same Wi-Fi: <http://YOUR-MAC-IP:8089/>

The bridge exposes:

| Endpoint | Method | Purpose |
| ----------------------- | ------ | -------------------------------------------- |
| `/api/status` | GET | Connection + transfer progress polling |
| `/api/upload` | POST | Multipart payload upload (image, AVI, etc.) |
| `/api/cancel` | POST | Abort an in-flight transfer |
| `/api/diagnostics` | GET | Scan + connect probe with verdict + timings |

The diagnostics button in the rail footer hits `/api/diagnostics` and
prints the verdict to the activity log. It only renders on browsers
without Web Bluetooth - Chrome users don't need it because the device
picker shows the badge directly.

### Hosting the frontend on its own

`npm run build` produces a static bundle in `dist/`. Drop it behind any
HTTPS host and Chrome / Edge users will be able to talk to badges
directly. Web Bluetooth requires a secure context (HTTPS, except on
`localhost`). Safari / Firefox / iOS users on a static-only host still
won't have a backend to fall back to - they need the bridge running on
the same origin.

## Feature map

- **Image**: drag/drop or pick a file, center/crop to 368×368, optional
 zoom + rotation, sent as JPEG.
- **Video**: trim, frame-step, sent as 14-fps AVI.
- **Patterns**: 12+ generative animations (matrix rain, voronoi, aurora,
 Destiny-themed loops, etc.), rendered to AVI client-side.
- **Text**: rich text with rotating colours and presets.
- **Sequence**: ordered list of static frames, looped.
- **QR**: high-contrast QR code with optional rotation/zoom.

### E87 protocol notes

- Uses FE/DC/BA framed control + data packets observed in the captures
 documented in the root README.
- Subscribes to `AE02` notify and validates protocol acks before
 advancing.
- The Python lib pins a fixed filename so each upload overwrites the
 same gallery slot rather than filling the badge's ~970 KB flash.
- Audio / pixel-streaming features of the badge are not yet implemented.

## General notes

- Web Bluetooth requires HTTPS or `localhost`.
- iOS Safari (and therefore every iOS browser) will never support Web
 Bluetooth - the HTTP bridge path is the permanent solution there.
- Source captures of the official Android companion app are in
 `protocol-understanding/` at the repo root.
