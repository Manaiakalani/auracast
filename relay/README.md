# AuraCast Python relay

Safari, Firefox, and iPhone cannot open a Web Bluetooth connection to an E87, E92, L8, or X9 badge. This process runs on a computer that has a Bluetooth radio and speaks the badge protocol for them. The browser talks to this process over HTTP. The phone does not talk to the badge.

The upload state machine was checked against a simulated badge (`python3 -m unittest discover -s tests -v`). It has not been tried on a physical badge. A passing test is not proof that a real badge accepted a file.

## Install

From this directory:

```bash
python3 -m pip install -r requirements.txt
```

`bleak` is the only dependency. The simulated-badge tests do not need it:

```bash
python3 -m unittest discover -s tests -v
```

## Run

```bash
python3 -m auracast_relay
```

Then open the URL it prints. By default that is `http://127.0.0.1:8787/`.

The relay serves `web/dist` when that build exists. From the repo:

```bash
cd ../web
npm run build
```

Build without `BASE_PATH`. The GitHub Pages base path is for the hosted site. A local relay expects the app at `/`.

If `web/dist` is missing, the relay still answers the API and shows a short help page at `/`.

### Same Mac, Safari or Firefox, during development

Leave the relay on port 8787. In `web/`:

```bash
npm run dev
```

Vite proxies `/api` to `http://127.0.0.1:8787`. Open the Vite URL. Restart `npm run dev` if it was already running when the proxy was added, so the proxy is actually loaded.

### iPhone

```bash
python3 -m auracast_relay --lan
```

`--lan` binds `0.0.0.0`. There is no password. Use it only on a Wi-Fi network you trust. The iPhone opens the `http://` address the relay prints (a LAN IP, not `localhost`). iPhone Safari uses this computer's Bluetooth radio. The phone cannot reach the badge by itself.

HTTP on a LAN IP is not a secure context, so the service worker may not install. The page still runs.

## What the page calls

| Endpoint | Method | Body |
|---|---|---|
| `/api/status` | GET | Connection, advertising age, transfer percent |
| `/api/blob` | POST | Multipart `file` plus `kind` (`still` or `animated`) |
| `/api/cancel` | POST | Aborts the upload in progress |
| `/api/diagnostics` | GET | Scan and authenticate, then disconnect. Sends no file |
| `/api/cache/bust` | POST | Forgets the last Bluetooth sighting |

There is no login. Requests are same-origin because the relay serves the page, or because Vite proxies `/api`.

## Flags

| Flag | Meaning |
|---|---|
| `--host` | Bind address. Default `127.0.0.1`. |
| `--port` | Default `8787`. |
| `--lan` | Bind `0.0.0.0` and print Wi-Fi URLs. No password. |
| `--static PATH` | Built web app directory. Default is `web/dist` when `index.html` is there. |
| `--no-watch` | Do not scan until a request needs the badge. |

## What this is not

This relay drives the round Jieli badges (E87, E92, L8, X9, and badges that advertise as LED Badge). It does not speak the protocol used by square scrolling-text panels.

The old `badge_magic` repository is gone. Living tools for a different family of 11x44 and 12x48 LED name badges are [led-name-badge-ls32](https://github.com/fossasia/led-name-badge-ls32) and [Badge Magic](https://github.com/fossasia/badgemagic-app). Do not flash that firmware onto a round badge. The Badge Magic firmware notes say flashing the wrong board can brick it.

Chrome, Edge, Brave, Arc, and Opera on desktop or Android should keep using Web Bluetooth directly. They do not need this process.
