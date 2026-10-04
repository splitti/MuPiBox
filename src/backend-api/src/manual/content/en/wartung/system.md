# System and expert settings

You rarely need these settings under **Settings › System**. They are for advanced users, and some can cripple the box. Make a [backup](backup.md) first.

## System options

**Settings › System › System options**:

| Setting | Effect |
| --- | --- |
| **Overclock SD card** | faster reading from the card |
| **PM2 logs in RAM** | spares the SD card. The logs are lost on restart |
| **Wait for network at start** | the box waits at boot until the network is ready |
| **Turbo at start** | higher clock speed during boot |
| **CPU governor** | the way the processor regulates its clock (conservative, ondemand, userspace, powersave, performance, schedutil) |
| **Hide under-voltage warnings** | hides the warning for a power supply that is too weak |
| **SWAP** | swap memory on the card |

> [!WARNING]
> An under-voltage warning means the power supply or cable is too weak. That is the most common cause of dropouts. Fix it instead of hiding it.

## Browser (Chromium)

The display is a browser in kiosk mode. **Settings › System › Browser (Chromium)**:

| Setting | Effect |
| --- | --- |
| **GPU support (experimental)** | graphics via the GPU |
| **Smooth scrolling (experimental)** | smoother scrolling |
| **Kiosk mode** | full screen without the browser's controls |
| **Cache size** | 0 to 512 MB |
| **Chrome debugging** | remote debugging of the display browser |

## Experts

**Settings › System › Experts**:

- **Hostname**: the box's name on the network, for example `mupibox.local`. Only letters, digits and hyphen. Applied after a restart.
- **Edit configuration directly**: an editor for the box's configuration file.
- **DietPi dashboard**: opens in a new window.

> [!WARNING]
> Wrong values in the configuration can **cripple** the box. Make a [backup](backup.md) first.

## Language

**Settings › System › Language**:

- **App language**: only this app in the browser. “Automatic” follows the browser's language.
- **Box language**: the texts on the display (limit, quiet time, QR code for parents) and in the boot and maintenance screens.

You set both languages separately. The voice for speech output is under **Audio › Speech output**.
