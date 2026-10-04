# GPIO assignment

The **GPIO pins** are the connections on the Raspberry Pi's pin header. The MuPiBox's accessories use them by their **BCM numbers** (GPIO 26 is not pin 26 of the header, but the connection labelled “GPIO26”).

## Pins the box uses

| Accessory | Function | GPIO (BCM) | Adjustable |
| --- | --- | --- | --- |
| Rotary knob | A (CLK) | 26 | no |
| Rotary knob | B (DT) | 24 | no |
| Rotary knob | Button | 10 | no |
| OnOff SHIM | signal to shut down (`gpio-poweroff`) | 4 | in the configuration (`shim.poweroffPin`) |
| OnOff SHIM | button (trigger) | 17 | in the configuration (`shim.triggerPin`) |
| OnOff SHIM | power cut | 27 | in the configuration (`shim.cutPin`) |
| OnOff SHIM | status LED | 13 | yes, **Settings › Battery & Power › Power switch and LED** |
| Fan | PWM signal | 12 | yes, **Settings › Battery & Power › Fan** |

The pin numbers in the table are the values entered after installation.

> [!WARNING]
> Two devices must **not** share a pin. For LED and fan choose pins that are not otherwise used above. The app warns if you choose a pin for an accessory that another enabled accessory already uses.

## Where else is the pin setting?

The pin for switching off is in **two** places, and both must match:

1. in the box's configuration: `shim.poweroffPin`,
2. in `/boot/config.txt`: as the parameter `gpiopin=…` of the overlay `gpio-poweroff`.

More on this and what happens with a duplicate line: [The box hangs when shutting down](../fehlerbehebung/haengt-beim-ausschalten.md).
