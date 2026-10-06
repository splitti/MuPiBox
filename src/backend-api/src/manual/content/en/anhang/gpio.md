# GPIO assignment

The **GPIO pins** are the connections on the Raspberry Pi's pin header. The MuPiBox's accessories use them by their **BCM numbers** (GPIO 26 is not pin 26 of the header, but the connection labelled “GPIO26”).

:::gpio-map

> [!NOTE]
> The **MuPiHAT** assignment is taken from the board's official pinout. The eight pins of the extension header **J5** (GPIO 5, 6, 8, 9, 10, 11, 12, 25) are free to use; they are marked with a dashed outline and cause no overlap. The MuPiHAT has the OnOff SHIM on board and therefore uses the same two pins as the SHIM (4 and 17). Both together do not work.

## Pins the box uses

| Accessory | Function | GPIO (BCM) | Adjustable |
| --- | --- | --- | --- |
| {rotary-a} Rotary knob | A (CLK) | 26 | no |
| {rotary-b} Rotary knob | B (DT) | 24 | no |
| {rotary-button} Rotary knob | Button | 10 | no |
| {poweroff} OnOff SHIM (also the MuPiHAT) | signal to shut down (`gpio-poweroff`) | 4 | in the configuration (`shim.poweroffPin`) |
| {trigger} OnOff SHIM (also the MuPiHAT) | button (trigger) | 17 | in the configuration (`shim.triggerPin`) |
| {cut} Power cut (set by the box, not by the SHIM) | signal when switching off | 27 | in the configuration (`shim.cutPin`) |
| {led} Status LED (a separate LED, not part of the SHIM) | status LED | 13 | yes, **Settings › Battery & Power › Power switch and LED** |
| {fan} Fan | PWM signal | 12 | yes, **Settings › Battery & Power › Fan** |

On your box this table shows **only the pins that are in use there** with the current settings: a fan that is switched off, or a rotary knob that is switched off, does not appear, and a pin you have changed shows its new number. Where the page cannot ask the box (for example on GitHub), it lists the pins as entered after installation.

> [!WARNING]
> Two devices must **not** share a pin. For LED and fan choose pins that are not otherwise used above. The app warns if you choose a pin for an accessory that another enabled accessory already uses.

## Where else is the pin setting?

The pin for switching off is in **two** places, and both must match:

1. in the box's configuration: `shim.poweroffPin`,
2. in `/boot/config.txt`: as the parameter `gpiopin=…` of the overlay `gpio-poweroff`.

More on this and what happens with a duplicate line: [The box hangs when shutting down](../fehlerbehebung/haengt-beim-ausschalten.md).
