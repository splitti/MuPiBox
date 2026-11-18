# OLED display

The **OLED display** extension shows on a small OLED display what the box plays: title, artist and album, the time, the track number, the volume, the WLAN, the battery of a MuPiHAT, shuffle and repeat, and the output (speaker, headphones, Bluetooth). When nothing plays it shows the clock. The box can also run **without the DSI display altogether** (see [Without DSI display](ohne-dsi-display.md)).

The chips **SSD1306**, **SH1106** and **SSD1309** on the **I2C connector** are supported, with **128 × 64** or **128 × 32** pixels, on the **Raspberry Pi 4 and the Pi 5**. The display needs no package apart from `python3-pil`, which the installation of the extension brings along.

After the [installation](installieren.md) the settings are under **Settings › OLED display**.

## Connecting

The display connects to the I2C bus of the pin header. Wire it with the box switched off:

| OLED | Raspberry Pi | Pin of the header |
| --- | --- | --- |
| VCC | 3.3 V | 1 |
| GND | ground | 6 |
| SDA | GPIO 2 (I2C SDA) | 3 |
| SCL | GPIO 3 (I2C SCL) | 5 |

Most modules have the address **0x3C**; some can be set to **0x3D** with a solder bridge. The I2C bus can be shared with other devices, such as a PN532 or a MuPiHAT.

If I2C is still off, the **Display** card shows the **I2C** block as **Switched off**. Tap **Switch on I2C** next to it and **restart** the box afterwards.

## The display

![An album plays: the status bar at the top, below it title, artist and album, the time and track number at the bottom](oled-play.png)

The **status bar** at the top shows, from left to right:

| Symbol | Meaning |
| --- | --- |
| aerial with bars | WLAN reception (without bars: no connection) |
| screen with a network plug | the box is on the **LAN cable** (the symbol then takes the place of the aerial) |
| number with battery | charge of the battery (only with a MuPiHAT) |
| arrows with **A** or **1** | **repeat**: the whole list (A) or one track (1, with Spotify) |
| crossed arrows | **shuffle** is on |
| number and symbol at the right | volume and **output**: speaker, headphones or Bluetooth |

Below are **title**, **artist** and **album**; a long line scrolls by itself (or not: see **Long texts** below). At the bottom left a triangle says the box plays (two bars: paused), next to it the **time**, at the bottom right the **track number** ("Track:3/12").

![The time counts down, the output is Bluetooth](oled-play-bt.png)

When nothing plays, the display shows the **clock** with the date (the weekday in the language of the box, which you choose under **Settings › System › Language**; German if none is chosen); after the time you set it switches off.

![The clock when idle](oled-idle.png)

A short picture appears when playback starts or pauses and when the volume changes. The picture for the volume can be switched off with **Show the volume animation**. With **Show the address of the box** the **network page** appears for ten seconds: WLAN name (on the LAN cable **LAN** instead), address and version, with the symbol (i) at the top.

![The network page](oled-info.png)

## Settings

| Setting | Effect |
| --- | --- |
| **Chip** | **SSD1306** (almost all 0.96 inch modules), **SH1106** (mostly 1.3 inch) or **SSD1309**. If the picture is shifted or has stripes at the edge, choose the other chip |
| **Size** | **128 × 64** or **128 × 32** |
| **I2C address** | **0x3C** or **0x3D** |
| **Turn by 180°** | if the display is mounted upside down |
| **Display while playing** | **Full** (the picture above), **Mix** (the track number large) or **Compact** (the time large) |
| **Show the clock** | the clock when idle |
| **Show the volume animation** | the short picture when the volume changes; when it is off the display stays as it is (play and pause still show theirs) |
| **Show the time** | **Elapsed** (counts up from the start) or **Remaining** (counts down to the end, with a minus); a station or podcast of unknown length counts up |
| **Long texts** | **Scroll again and again** (default), **Scroll once** (the line scrolls through completely one time and then stays with "…" at the end) or **Do not scroll** (the line is cut with "…") |
| **Brightness** | 0 to 255 |
| **Evening dimming** | the OLED display gets darker in the evening and normally bright again in the morning. The times are those of "Evening dimming" in the display settings (fixed times or sunset to sunrise, gradual dimming, quiet hours); whether the box's own display dims is independent of it |
| **Evening brightness** | 1 to 255, with the slider or typed straight into the field; never brighter than the normal brightness |
| **Display off after** | **Never**, 1, 5, 15 minutes or 1 hour, when nothing plays |
| **Run without DSI display** | see [Without DSI display](ohne-dsi-display.md) |

The buttons **Show the address of the box** and **Next layout** try the display out: the second switches between **Full**, **Mix** and **Compact** until the next save. A change of chip, size, address or rotation restarts the display; the others apply at once.

The **128 × 32** display shows title, artist, time, volume and WLAN in one layout.

## If the display stays dark

The **Display** line of the card says what is missing:

| Message | What to do |
| --- | --- |
| **I2C is off: switch it on, then restart** | tap **Switch on I2C**, restart the box |
| **No access to the I2C bus** | restart the box once (the access rule becomes active then) |
| **No answer: check the wiring and the address** | check the wiring, try the **I2C address** and the **Chip** |
| **The package python3-pil is missing** | install the extension again (it fetches the package) |

> [!NOTE]
> The program for the display is an implementation of its own: the layout is inspired by the project [oled_phoniebox](https://github.com/splitti/oled_phoniebox) but uses no code from it. It writes directly to the I2C bus and needs neither `luma.oled` nor `RPi.GPIO`, so it runs the same on the Pi 4 and the Pi 5.
