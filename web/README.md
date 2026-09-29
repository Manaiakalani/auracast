# AuraCast web app

Small Svelte 5 app to send images, video, text, patterns and QR codes to a
Jieli-based BLE LED badge.

- Primary GATT service: `0xAE00` (data) + `0xFD00` (control)
- Protocol notes live in [PROTOCOL.md](../PROTOCOL.md). The [root README](../README.md) is the user guide.

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
| Safari (macOS + iOS) | Python relay | `relay/` on a computer with Bluetooth |
| Firefox | Python relay | `relay/` on a computer with Bluetooth |
| Chrome on iOS | Python relay | Every iOS browser is WebKit. The phone uses the computer's radio |

The frontend auto-detects `navigator.bluetooth`. If it's missing, Connect
calls a same-origin HTTP bridge. That bridge is [`relay/`](../relay/README.md).
There is no `e87-webui` or `e87-cli` project to clone, and the page does
not post to `/api/upload`.

In local development, `npm run dev` proxies `/api` to `http://127.0.0.1:8787`.
Start the relay first (`python3 -m auracast_relay` from `relay/`). For an
iPhone, run it with `--lan`, build this app (`npm run build`, no `BASE_PATH`),
and open the address the relay prints. A still image and the Painted Base
loop were sent to a physical E87.

The client calls:

| Endpoint | Method | Purpose |
| ----------------------- | ------ | -------------------------------------------- |
| `/api/status` | GET | Connection + transfer progress polling |
| `/api/blob` | POST | Multipart payload upload (image, AVI, etc.) |
| `/api/cancel` | POST | Abort an in-flight transfer |
| `/api/diagnostics` | GET | Scan + connect probe with verdict + timings |
| `/api/cache/bust` | POST | Forget the last Bluetooth sighting |

The diagnostics button in the rail footer hits `/api/diagnostics` and
prints the verdict to the activity log. It only renders on browsers
without Web Bluetooth. Chrome users don't need it because the device
picker shows the badge directly.

### Hosting the frontend on its own

`npm run build` produces a static bundle in `dist/`. Drop it behind any
HTTPS host and Chrome / Edge users will be able to talk to badges
directly. Web Bluetooth requires a secure context (HTTPS, except on
`localhost`). A static-only host has no Bluetooth bridge. Safari, Firefox,
and iOS need the Python relay running on a computer that has a radio, serving
this `dist/` or reached through the Vite `/api` proxy.

## Feature map

- **Image**: drag/drop or pick a file, center/crop to 368×368, optional
 zoom + rotation, sent as JPEG.
- **Video**: trim, frame-step, sent as an AVI at the chosen frame rate (default 12 fps).
- **Patterns**: 30 generative animations (matrix rain, reaction diffusion,
 painted base, voronoi, aurora, and others), rendered to AVI client-side.
- **Text**: rich text with rotating colours and presets.
- **Sequence**: ordered list of static frames, looped.
- **QR**: high-contrast QR code with optional rotation/zoom.

### E87 protocol notes

- Uses FE/DC/BA framed control + data packets observed in the captures
 documented in the root README.
- Subscribes to `AE02` notify and validates protocol acks before
 advancing.
- The transfer uses a random temp name, then a timestamped `.jpg` or `.avi`
 path on FILE_COMPLETE. Clips are fitted under 900 KB first. The badge's
 flash is about 970 KB, so old files can still fill it.
- Audio / pixel-streaming features of the badge are not yet implemented.

## General notes

- Web Bluetooth requires HTTPS or `localhost`.
- iOS Safari (and therefore every iOS browser) will never support Web
 Bluetooth. Use the Python relay in `../relay` on a computer with a radio.
 A still image and the Painted Base loop were sent to a physical E87.
- Source captures of the official Android companion app are in
 `protocol-understanding/` at the repo root.
