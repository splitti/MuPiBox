# System and expert settings

You rarely need these settings under **Settings › System**. They are for advanced users, and some can cripple the box. Make a [backup](backup.md) first.

## System options

**Settings › System › System options**. Everything here only applies after a restart of the box; only the CPU governor applies at once.

| Setting | Effect |
| --- | --- |
| **Overclock SD card** | faster access to the SD card. Some cards do not run stably with it, so the app asks first |
| **PM2 logs in RAM** | the logs of the server and the player in memory instead of on the SD card. This spares the card, but the logs are lost on restart |
| **Wait for the network at startup** | the box waits for the network at boot (slower start, but online right away) |
| **Turbo at startup** | higher clock speed in the first 30 seconds, for a faster start |
| **CPU governor** | the way the processor regulates its clock (for example ondemand = as needed) |
| **Hide undervoltage warnings** | hides the lightning icon for a power supply that is too weak |
| **SWAP** | swap file on the SD card |

> [!WARNING]
> An undervoltage warning means the power supply or cable is too weak. That is the most common cause of dropouts. Fix it instead of hiding it.

## Browser (Chromium)

The display is a browser in kiosk mode. **Settings › System › Browser (Chromium)**:

| Setting | Effect |
| --- | --- |
| **GPU support (experimental)** | graphics via the GPU |
| **Smooth scrolling (experimental)** | smoother scrolling |
| **Kiosk mode** | full screen without the browser's controls. Off = with a window frame, only for testing |
| **Cache size** | 0 to 512 MB |
| **Chrome debugging** | writes a detailed log of the browser. Switch it off again after troubleshooting |

The changes apply after a restart of the display. You restart it right away with **Apply and restart display**.

## Experts

**Settings › System › Experts**:

- **Hostname**: the box's name on the network, for example `mupibox` (reachable as `mupibox.local`). Only letters, digits and hyphen. Applied after a restart.
- **More tools**: the **DietPi Dashboard** (DietPi system management, port 5252) and the **Previous admin interface**. Both open in a new window.
- **Edit configuration directly**: an editor for the box's JSON files. Under **File** you choose which one, for example `mupiboxconfig.json` (box), `data.json` (library) or `config.json` (server).
- **Reset**: **Reset box configuration** (all settings back to the state of the installed version; the password stays), **Clear library** (all entries of the library gone; the files stay) and **Reset server configuration**.

> [!WARNING]
> Wrong values in the configuration can **cripple** the box, and a reset cannot be undone. Make a [backup](backup.md) first.

## Language

**Settings › System › Language**:

- **App language**: only this app in this browser. “Automatic” follows the browser's language, otherwise English applies.
- **Box language**: the texts on the display (limit, quiet time, QR code for parents), in the boot and maintenance screens and of the Telegram bot ([Telegram](../netzwerk/telegram.md)). If there is a voice for this language, the box speaks it too.

You set both languages separately. The voice for speech output is under **Audio › Speech output**.
