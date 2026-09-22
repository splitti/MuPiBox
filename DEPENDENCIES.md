# MuPiBox dependencies

What MuPiBox needs to build and run, and what for. Audited on **2026-09-22** by searching the
repository for every use (imports, commands, services, install scripts). "Unused" means nothing in
this repository uses it; a package the box happens to have from DietPi is not listed as a MuPiBox
dependency.

Where something is unused it is commented out or marked in place with the date and the reason. The
places are listed in [Unused and deprecated](#unused-and-deprecated).

## Overview

| Part | What it is | Where |
|---|---|---|
| `frontend-box` | Display UI (Angular 20 + Ionic 8), served by the server on port 8200 | `src/frontend-box` |
| `backend-api` | REST API (Express 5, esbuild bundle `server.js`, pm2 process `server`, port 8200) | `src/backend-api` |
| `backend-player` | Player control (Express 4 + `mplayer` in slave mode, bundle `spotify-control.js`, pm2 process `spotify-control`, port 5005) | `src/backend-player` |
| Admin interface | PHP pages behind lighttpd | `AdminInterface/www` |
| Scripts and services | Shell/Python helpers and systemd units | `scripts`, `config/services` |

Built with Node.js 22 (esbuild target `node22`). The deploy zips (`bin/nodejs/deploy.zip`,
`AdminInterface/release/www.zip`) are what an update installs.

## npm packages

### backend-api (`src/backend-api`)

| Package | Used for |
|---|---|
| `express` | HTTP server and all `/api/...` routes |
| `cors` | cross-origin access for the display UI |
| `jsonfile` | reads and writes the JSON data/config files |
| `ky` | HTTP client with timeouts (RSS feeds and their pictures, WebDAV NAS) |
| `xml-js` | converts RSS feeds to JSON (`/api/rssfeed`); the fast path for podcasts uses a regex parser instead |
| `@spotify/web-api-ts-sdk` | Spotify Web API calls of the API server |

Dev: `esbuild` (bundle), `tsx` (run TypeScript), `typescript`, `@types/*`, `supertest` + `nock` (tests).

### backend-player (`src/backend-player`)

| Package | Used for |
|---|---|
| `express`, `body-parser` | HTTP server and request bodies for the player commands |
| `spotify-web-api-node` | remote control of the Spotify Connect device (librespot) |
| `google-tts-api` | spoken text ("read the title aloud") |
| `console-log-level`, `debug` | log output |
| `js-string-escape` | quoting file names for mplayer's slave commands |

Dev: `esbuild`.

### frontend-box (`src/frontend-box`)

| Package | Used for |
|---|---|
| `@angular/*`, `rxjs`, `zone.js`, `tslib` | the Angular application |
| `@ionic/angular` | UI components, page navigation and transitions (also the cover flip) |
| `swiper` | the cover lists (including the Cover Flow theme) |
| `simple-keyboard` | on-screen keyboard |
| `lodash-es` | `cloneDeep` in the swiper |

Dev: Angular CLI/compiler, `@ionic/angular-toolkit`, `typescript`, karma + jasmine (unit tests), `@types/*`.

### Unused npm packages

Moved out of `dependencies` into an `_unusedDependencies` block with the date and reason (JSON has no
comments; npm ignores the block). `package-lock.json` was updated to match and all three workspaces
still build.

| Package | Workspace | Why unused |
|---|---|---|
| `byline` | backend-player | mplayer output is split into lines by hand now (Latin-1 titles need raw bytes) |
| `protobufjs`, `protobufjs-cli` | backend-player | only the `build-proto` script used them; the `proto/` folder and the generated file do not exist |
| `nodemon` | backend-player | the `serve` script starts `node` directly |
| `http`, `path` | backend-player | Node.js built-in modules, no npm package needed |
| `qrcode`, `@types/qrcode` | frontend-box | nothing draws a QR code |
| `@spotify/web-api-ts-sdk` | frontend-box | the UI uses its own `spotify.service`; only backend-api uses the SDK |

The `build-proto` script in `src/backend-player/package.json` still points at the missing `proto/`
folder. It cannot be commented out in JSON; it can simply be deleted.

## System packages (apt) installed by the update and autosetup scripts

Kept, with what uses them:

| Package | Used by |
|---|---|
| `mplayer` | playback engine (`mplayer-wrapper.js`) |
| `libasound2`, `python3-alsaaudio` | audio output, volume in `mqtt.py` |
| `pulseaudio-module-bluetooth`, `bluez` | Bluetooth speakers (`scripts/bluetooth`, Bluetooth pages) |
| `lighttpd-mod-openssl` | HTTPS for the admin interface (lighttpd) |
| `git`, `zip` | admin pages (service, network, backup), update |
| `rrdtool` | system graphs (`save_rrd.sh`, admin start page) |
| `scrot` | screenshots (Telegram `/screen`, admin) |
| `net-tools`, `wireless-tools` | `ifconfig`, `iwconfig`/`iwgetid` for network status and WiFi icons |
| `raspberrypi-kernel-headers`, `dkms` | USB WiFi driver installers (`scripts/online/install_rtl88x2bu.sh`, `install_rtl8821au.sh`), installed on demand from the Network admin page - not by autosetup/update |
| `bc` | `mupi_start_led.sh` |
| `build-essential`, `pigpio`, `libjson-c-dev` | autosetup compiles `scripts/led/led_control.c` (`-lpigpio -ljson-c`) |
| `gpiod` | power button/shim scripts (`scripts/OnOffShim`) |
| `libi2c-dev`, `python3-smbus2` | MuPiHAT (`scripts/mupihat`) |
| `python3-rpi.gpio`, `python3-lgpio` | LED and fan control (`RPi.GPIO`); `lgpio` is not imported by any script, it is kept as the GPIO backend for the Raspberry Pi 5 |
| `python3-serial` | WLED scripts |
| `python3-requests` | many scripts (Telegram, network check, MQTT) |
| `python3-paho-mqtt`, `python3-netifaces` | `scripts/mqtt/mqtt.py` (Home Assistant) |
| `python3-flask` | MuPiHAT status page (`mupihat.py`) |
| `python3-pil` | cover thumbnails of the API server (falls back to the original pictures without it) |
| `pip`, `python3-dev` | autosetup installs `telepot`, `requests`, `pyserial` with pip; `telepot` is used by the Telegram scripts |
| `libgles2-mesa`, `preload` | GPU/graphics stack for the kiosk browser and application preloading; no explicit call, kept as system tuning |

No longer installed (commented out in `update/start_mupibox_update.sh` and `autosetup/autosetup.sh`
with the date and reason):

| Package | Why |
|---|---|
| `id3tool` | only the ID3 converter used it, which was removed from the admin |
| `python3-mutagen` and the pip `mutagen` step (autosetup) | same |
| `python3-gpiozero` | no script imports it |
| `python3-smbus` | unused, the scripts use `python3-smbus2` |
| `i2c-tools` | no script calls `i2cdetect`/`i2cget`/`i2cset` |
| `mesa-utils` | diagnostics only (`glxinfo`), never called |
| `libsdl2-dev` | no SDL code is built or used |
| `libwidevinecdm0` | DRM playback in the browser; there is no Spotify web player in the code |
| `autoconf`, `automake` | only needed to compile `fbv` (`dev/compile_scripts/fbv.sh`), which ships prebuilt |

Packages that are already installed on a box stay there; the change only stops them from being
installed again. Also installed by autosetup, but not by MuPiBox code: `nodejs` 22 and the global npm
package `pm2` (process manager for `server` and `spotify-control`).

Python libraries used only by manual analysis tools (`scripts/mupihat/plot_*.py`, `parse_log.py`):
`matplotlib`, `pandas`, `numpy`. Nothing installs them; they are not needed to run the box.

## Programs and binaries

| Binary | Used for | Where it comes from |
|---|---|---|
| `mplayer` | playback | apt |
| `jq` | reads the JSON config in nearly every shell script | downloaded from the jq GitHub release by update/autosetup (1.8.1) |
| `librespot` | Spotify Connect player, see below | downloaded from `splitti/MuPiBox` (`bin/librespot/dev_0.6_20250806`) |
| `fbv` | shows pictures on the framebuffer (splash) | `bin/fbv` (`fbv`, `fbv_64`) |
| `led_control` | LED ring | compiled from `scripts/led/led_control.c` by autosetup; prebuilt copies in `bin/led_control` |
| `pm2`, `nodejs` | run the two Node.js servers | npm / apt |
| `dietpi-dashboard` | DietPi web dashboard | downloaded from GitHub (`nonnorm/DietPi-Dashboard`) by update/autosetup |
| `chromium` | kiosk browser for the display UI | DietPi |
| `lighttpd` + PHP | admin interface | DietPi |

### librespot

- **What it does:** it makes the box a Spotify Connect device. `spotify-control.js` then tells that
  device with the Spotify Web API (`spotify-web-api-node`) what to play. Local files, radio streams,
  podcasts and NAS content do not use it at all.
- **When it runs:** `librespot.service` starts it with the settings from
  `config/templates/env-librespot` (cache path and name come from `mupiboxconfig.json`, track events
  go to `telegram_Track_Spotify.py`). The update script enables it on stable installs and disables it
  for `dev`/branch installs (`RELEASE="dev"`). On the boxes of this fork it is therefore disabled and
  inactive, and Spotify playback only works after enabling the service by hand.
- **Status:** optional. It is only needed for Spotify; the program stays installed because the Spotify
  pages and the player code still exist. Nothing else depends on it.
- **Versions in the repository:** only `dev_0.6_20250806` is used, and it is downloaded from the
  upstream repository `splitti/MuPiBox` at update time, not from this fork's `bin/` folder. The other
  binaries in `bin/librespot` are not referenced by any script and can be deleted: `0.5.0`,
  `dev_0.5_20240905`, `dev_0.5_20241008`, `dev_0.6_20250628`. `0.6.0` is only used by the `Dockerfile`,
  `dev_0.6_20250305` only by commented-out lines.
- **Leftovers:** `scripts/librespot/librespot-start.sh` (replaced by the service) and the `spotifyd`
  files (replaced by librespot) are marked as deprecated, see below.

## systemd services (`config/services`)

| Service | Purpose |
|---|---|
| `mupi_startstop`, `mupi_splash`, `mupi_idle_shutdown`, `mupi_change_checker` | start/stop, splash screen, idle shutdown, watches the media directory for changes |
| `mupi_wifi`, `mupi_autoconnect-wifi`, `mupi_check_internet`, `mupi_check_monitor` | network and display monitoring |
| `dietpi-wifi-monitor` (override) | this fork's tolerant replacement for DietPi's WiFi monitor (`scripts/mupibox/wifi_monitor.sh`) |
| `pulseaudio`, `mupi_autoconnect_bt` | audio server, Bluetooth speaker reconnect |
| `mupi_hat`, `mupi_hat_control`, `mupi_powerled`, `mupi_fan` | MuPiHAT, power LED, fan |
| `mupi_telegram`, `mupi_mqtt` | Telegram bot, Home Assistant/MQTT (both optional, off by default) |
| `mupi_vnc`, `mupi_novnc` | remote view (optional, off by default) |
| `dietpi-dashboard` | DietPi dashboard |
| `librespot` | Spotify Connect (optional, see above) |
| `spotifyd` | not used any more, replaced by librespot |

## Unused and deprecated

Marked in place with a comment that carries the date and the reason. They are kept for reference and
can be deleted.

- `scripts/librespot/librespot-start.sh` - replaced by `librespot.service` and `env-librespot`
- `scripts/mupibox/get_deviceid.sh` - nothing runs it
- `config/services/spotifyd.service`, `config/templates/spotifyd.conf` - spotifyd was replaced by librespot
- `scripts/telegram/telegram_end_publish.py`, `telegram_playing.py`, `telegram_shutdown.py`,
  `telegram_stop.py` - nothing starts them
- Binaries in `bin/librespot` other than `dev_0.6_20250806` (see above)
- `build-proto` script in `src/backend-player/package.json`

Manual analysis tools, not dead code: `scripts/mupihat/parse_log.py`, `plot_charge.py`,
`plot_discharge.py`.
