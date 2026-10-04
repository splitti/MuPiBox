# Files, ports and services

This page is for everyone who wants to look “under the hood” of the box, for example via SSH. In normal operation you do not need it.

## Important files and folders

| Path | Content |
| --- | --- |
| `/etc/mupibox/mupiboxconfig.json` | the box's configuration. The app writes into it, and so does the editor under **Experts** |
| `/home/dietpi/.mupibox/Sonos-Kids-Controller-master/` | the installed software: server, app (`mupi-app/`), display (`www/`) and this manual (`manual/`) |
| `/home/dietpi/.mupibox/spotifycontroller-main/` | the player (Spotify and local playback) |
| `/home/dietpi/MuPiBox/media/` | the media on the memory card |
| `/home/dietpi/MuPiBox/sysmedia/` | system files: boot screens, sounds |
| `/usr/local/bin/mupibox/` | the box's scripts (shutdown, rotary knob, network and more) |
| `/tmp/playerstate` | the player's state: `play` or `pause` |
| `/tmp/shutdown_control.log` | log of the off button |

> [!WARNING]
> The configuration file contains access data (Telegram token, Spotify, NAS). Do not pass it on. For error reports use the [problem report](../wartung/problem-melden.md).

## Ports

| Port | Who | Purpose |
| --- | --- | --- |
| 80 and 443 | web server | the app (`/app/`), this manual (`/manual/`) and the admin interface. It passes requests for the app and the interface on to the server |
| 8200 | server | display and the box's own interface. The display runs via `http://localhost:8200` |
| 5005 | player | the player's interface. It only accepts commands from the box itself, not from the network |

## Programs (PM2)

Two programs run under **PM2**:

- `server`: server with app, interface and manual,
- `spotify-control`: the player.

Their messages are under **Settings › System › Logs** as **PM2 log**.

## Services (systemd)

Other tasks are done by services whose names begin with `mupi_`. The most important:

| Service | Task |
| --- | --- |
| `mupi_startstop` | starts and ends the box's routines at boot and shutdown |
| `mupi_idle_shutdown` | switches the box off after a long silence |
| `mupi_check_internet` | checks the connection (status indicator) |
| `mupi_rotary` | rotary knob |
| `mupi_fan` | fan |
| `mupi_hat`, `mupi_hat_control` | MuPiHAT and battery |
| `mupi_powerled` | status LED |
| `mupi_telegram` | Telegram bot |
| `mupi_mqtt` | MQTT and Home Assistant |
| `mupi_tls` | certificate for HTTPS (checked daily) |
| `mupi_vnc`, `mupi_novnc` | remote control of the display |
| `mupi_wifi`, `mupi_autoconnect-wifi`, `mupi_ethernet` | Wi-Fi and LAN |
| `mupi_autoconnect_bt` | connect Bluetooth automatically |
| `mupi_goodbye` | the goodbye picture until the power is off |
