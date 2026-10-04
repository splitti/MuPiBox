# Battery, MuPiHAT and power button

Under **Settings › Battery & Power** you find everything about the power supply.

## Battery display

**Settings › Battery & Power › Battery** shows the charge level, the voltage and the history of the last 24 hours. The display shows the level in the status indicator.

## MuPiHAT and battery profile

The **MuPiHAT** is a board with battery management that is plugged onto the Raspberry Pi. Under **MuPiHAT & battery profile** you set:

| Setting | Meaning |
| --- | --- |
| **MuPiHAT active** | switches the support on |
| **Battery** | the profile of your battery: ENERpower 2S3P 15,000 mAh, Ansmann 2S1P, ENERpower 2S2P 10,000 mAh, **USB-C operation (no battery)** or **Custom profile** |

If you choose **Custom profile**, you enter your battery's voltages in millivolts:

| Value | Meaning | Range |
| --- | --- | --- |
| **v_100**, **v_75**, **v_50**, **v_25**, **v_0** | voltage at 100 %, 75 %, 50 %, 25 % and 0 % | 5000–9000 for v_100 |
| **Warning** | from this voltage the box warns | 5500–8000 |
| **Shutdown** | from this voltage the box switches itself off, it must be below the warning | 5000–7500 |
| **Charge limit VREG** (optional) | the voltage at which charging ends | 6000–8500 |

> [!WARNING]
> **The charge limit (VREG) is safety-critical.** If it is set too high, it harms the cells. Change it only if you know what you are doing.

If the battery is empty, the box switches itself off, and the display first shows the “battery empty” picture ([Covers and themes](../bedienung/cover-und-themes.md)). With Telegram you also get a message when the battery is almost empty ([Telegram](../netzwerk/telegram.md)).

## Automatic shutdown

**Settings › Battery & Power › Automatic shutdown**: The box switches itself off when nobody is listening. Adjustable from 0 to 300 minutes in steps of five. **0 means never**, that is how it is set after installation.

## Power button and LED

With an **OnOff SHIM** (on/off button with status LED) you switch the box on and off cleanly. Under **Power switch and LED**:

| Setting | Effect |
| --- | --- |
| **Delay of the off button** | how long you hold the button until the box goes off, 0 to 5 seconds (2 after installation) |
| **LED pin (OnOffShim)** | the GPIO pin of the LED (13 after installation) |
| **LED brightness normal** | brightness in operation, 0 to 100 % |
| **LED brightness dimmed** | brightness when dimmed, 0 to 100 % |

When switching off, the display shows the goodbye picture, a sound plays, and the LED fades out slowly. If music is playing, it is paused first.

If the box hangs when switching off and does not go off, read [The box hangs when shutting down](../fehlerbehebung/haengt-beim-ausschalten.md).
