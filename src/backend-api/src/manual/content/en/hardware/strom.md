# Battery, MuPiHAT and power button

Under **Settings › Battery & Power** you find everything about the power supply.

## Battery display

**Settings › Battery & Power › Battery** shows the charge level, the voltage and the history of the last 24 hours. The display shows the level in the status indicator.

## MuPiHAT and battery profile

The **MuPiHAT** is a board with battery management that is plugged onto the Raspberry Pi. Under **MuPiHAT & battery profile** you set:

| Setting | Meaning |
| --- | --- |
| **MuPiHAT active** | switches the support on. Switching it also changes the sound card and restarts the box |
| **Battery** | the profile of your battery: Ansmann 2S1P, ENERpower 2S2P 10.000mAh, ENERpower 2S3P 15.000mAh, **USB-C operation (without battery)** or **Custom profile** |

Below it are the voltages of the chosen profile in millivolts. You can change them and apply them with **Save profile**; the MuPiHAT service restarts for this. If none of the profiles fits your battery, choose **Custom profile**. With **USB-C operation (without battery)** there are no voltages and no charge curve.

| Card | Value | Range |
| --- | --- | --- |
| **Charge curve** | **Empty**, **25 %**, **50 %**, **75 %**, **Full** (v_0 to v_100): the voltage at this charge level. The values rise from “Empty” to “Full” | 5000–9000 each |
| **Thresholds** | **Warning from**: from this voltage the box warns | 5500–8000 |
| **Thresholds** | **Shut down at**: from this voltage the box switches itself off. Must be below the warning | 5000–7500 |
| Charging | **Charge cutoff** (VREG, optional): the voltage at which charging ends. Empty = the charger chip's default | 6000–8400 |

> [!WARNING]
> **The charge cutoff (VREG) is safety-critical.** With two cells in series at most 8400 mV are allowed (4.2 V per cell). Higher damages the battery; the app does not accept a higher value. Change it only if you know what you are doing.

If the battery is empty, the box switches itself off, and the display first shows the “battery empty” picture ([Covers and themes](../bedienung/cover-und-themes.md)). With Telegram you also get a message when the battery is almost empty ([Telegram](../netzwerk/telegram.md)).

## Automatic shutdown

**Settings › Battery & Power › Automatic shutdown**: The box switches itself off when nobody is listening. Adjustable from 0 to 300 minutes in steps of five. **0 means never**, that is how it is set after installation. The box checks every 10 seconds whether something is playing.

## Power button and LED

With an **OnOff SHIM** (on/off button with status LED) you switch the box on and off cleanly. Under **Power switch and LED**:

| Setting | Effect |
| --- | --- |
| **Delay of the shutdown button** | how long you hold the button until the box goes off, 0 to 5 seconds (2 after installation). Applies after a restart |
| **LED pin (OnOffShim)** | the GPIO pin of the LED (13 after installation). Applies after a restart |
| **LED brightness normal** | brightness in operation, 0 to 100 % |
| **LED brightness dimmed** | brightness when dimmed, 0 to 100 % |

When switching off, the display shows the goodbye picture, a sound plays, and the LED fades out slowly. If music is playing, it is paused first.

If the box hangs when switching off and does not go off, read [The box hangs when shutting down](../fehlerbehebung/haengt-beim-ausschalten.md).
