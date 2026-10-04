# WLED

With **WLED** a light strip shows light effects that go with the box: in operation, when switching on and when switching off. The box controls a WLED controller over a **serial interface** (USB).

**Settings › Services › WLED**

| Setting | Meaning |
| --- | --- |
| **WLED active** | switches the connection on (off after installation) |
| **Serial interface** | the controller's USB connection, usually `/dev/ttyUSB0` |
| **Baud rate** | transmission speed, 300 to 921600 bps, usually 115200 |

## Presets

A **preset** is a saved light effect in the WLED controller. You only enter the **numbers**:

- **Main preset**: the effect in normal operation,
- **Preset at start** with its number,
- **Preset at shutdown** with its number.

## Brightness

**Brightness normal** and **Brightness dimmed**, each from 0 to 255.

> [!NOTE]
> You create the presets in WLED itself, with WLED's app or web interface. The MuPiBox only calls them by their number.
