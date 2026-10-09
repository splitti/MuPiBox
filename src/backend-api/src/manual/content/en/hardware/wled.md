# WLED

With **WLED** a light strip shows light effects that go with the box: in operation, when switching on and when switching off. The box controls a WLED controller over a **serial interface** (USB).

**Settings › Services › WLED**

## Connection

| Setting | Meaning |
| --- | --- |
| **WLED active** | switches the connection on (off after installation) |
| **Interface** | the controller's USB connection, usually `/dev/ttyUSB0` |
| **Baud rate** | transmission speed, 300 to 921600, usually 115200 |

At the top the card shows whether a WLED device has answered. If none answers, tap **Search again**. Saving works anyway.

## Presets

A **preset** is a saved light effect in the WLED controller:

- **In normal operation**: the everyday effect,
- **At startup**: a preset of its own when switching on (switch on, then choose the preset),
- **On shutdown**: a preset of its own when switching off (switch on, then choose the preset).

If the WLED device has answered, you choose the presets from its list. Otherwise you enter their **numbers**.

## Brightness

**Normal** and **Dimmed**, each from 0 to 100 %.

**Save** applies the connection, presets and brightness. If the WLED device is reachable, the values also go to the device.

> [!NOTE]
> You create the presets in WLED itself, with WLED's app or web interface. The MuPiBox only calls them up.
