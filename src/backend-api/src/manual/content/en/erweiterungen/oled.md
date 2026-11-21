# OLED display

The **OLED display** extension shows on a small OLED display what the box plays: title, artist and album, the time, the track number, the volume, the WLAN, the battery of a MuPiHAT, shuffle and repeat, and the output (speaker, headphones, Bluetooth). When nothing plays it shows a picture: by default the NFC reader, which waits for a tag. At start, during an update, in the rest time and at shutdown it has pictures of its own, which can be changed. The box can also run **without the DSI display altogether**; since MuPiBox 5.1 that is a switch of the box itself (see [Without DSI display](ohne-dsi-display.md)).

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
| arrows with **A** or **1** | **repeat**: the whole list (A) or one track (1). The repeat button of the Buttons & GPIO Input extension cycles through them: all (A), one (1), off |
| crossed arrows | **shuffle** is on |
| number and symbol at the right | volume and **output**: speaker, headphones or Bluetooth |

Below are **title**, **artist** and **album**; a long line scrolls by itself (or not: see **Long texts** below). A **stream** (a radio station, which has no end) gets no progress bar. At the bottom left a triangle says the box plays (two bars: paused), next to it the **time**, at the bottom right the **track number** ("Track:3/12").

![The time counts down, the output is Bluetooth](oled-play-bt.png)

When nothing plays, the display shows what is chosen under **Idle display**: the **NFC reader** (a hand with a card: the box waits for a tag), the **barcode scanner**, the **clock** with the date (the default; the weekday in the language of the box, which you choose under **Settings › System › Language**; German if none is chosen) or **your own picture**; after the time you set it switches off.

![The clock when idle](oled-idle.png)

A short picture appears when playback starts or pauses and when the volume changes. The picture for the volume can be switched off with **Show the volume animation**, the one for start and pause with **Show the play/pause animation**. With **Show the IP address of the box as a QR code** a **QR code** with the IP address of the box appears for ten seconds, and nothing else. A phone scans it and opens the box in the browser. The same action can also be given to a button, a double button or the rotary knob ([Buttons & GPIO Input](buttons.md), [Rotary knob and button](../hardware/drehregler.md)). If the box has no network address, the display shows the **network page** instead, with WLAN name, address and version.

![The QR code with the address of the box](oled-info.png)

If the **rotary knob** chooses an album with the NFC extension ([NFC: Rotary knob](nfc-drehregler.md)), the information area shows the **name** the knob is on, with its place in the list. After the choice the normal picture comes back.

## Settings

The settings are in cards: **Display** (chip, size, address, rotation), **Display** mode (what is shown), **Brightness & switch-off** (brightness, display off after), **Evening dimming**, **Pictures** and **Without DSI display**.

| Setting | Effect |
| --- | --- |
| **Chip** | **SSD1306** (almost all 0.96 inch modules), **SH1106** (mostly 1.3 inch) or **SSD1309**. If the picture is shifted or has stripes at the edge, choose the other chip |
| **Size** | **128 × 64** or **128 × 32** |
| **I2C address** | **0x3C** or **0x3D** |
| **Turn by 180°** | if the display is mounted upside down |
| **Display while playing** | **Full** (the picture above), **Mix** (the track number large) or **Compact** (the time large). A button or double button can switch to the next one with **Switch OLED display (Full / Mix / Compact)** ([Buttons & GPIO Input](buttons.md)); that lasts until the next save |
| **Idle display** (card **Pictures**) | what the display shows while nothing plays: **NFC reader**, **Barcode scanner**, **Clock** (default) or **Own picture** |
| **Show the volume animation** | the short picture when the volume changes; when it is off the display stays as it is |
| **Show the play/pause animation** | the short picture with play or pause when playback starts or stops; when it is off the display stays as it is |
| **Show podcasts and radio** | For a podcast or a radio station: **Picture, if there is one** (the [picture of the tag](#the-picture-of-a-tag), while the tag started the medium) or always **Title and time**: the title, and below it in the middle the **time of day** at twice the size. If the tag has no picture, the title and the time are shown with "Picture" too. Applies to all three displays (Full, Mix, Compact); albums and audiobooks always show the picture of their tag |
| **Show the time** | **Elapsed** (counts up from the start) or **Remaining** (counts down to the end, with a minus); a station or podcast of unknown length counts up |
| **Long texts** | **Scroll again and again** (default), **Scroll once** (the line scrolls through completely one time and then stays with "…" at the end) or **Do not scroll** (the line is cut with "…") |
| **Brightness** | 1 to 255 |
| **Evening dimming** | the OLED display gets darker in the evening and normally bright again in the morning. The times are those of "Evening dimming" in the display settings (fixed times or sunset to sunrise, gradual dimming, quiet hours); whether the box's own display dims is independent of it. The card **Evening dimming** shows these times too: sunset, place, times, gradual dimming and quiet hours you change here apply to the box's display as well |
| **Evening brightness** | 1 to 255, with the slider or typed straight into the field; never brighter than the normal brightness |
| **Display off after** | **Never**, 1, 5, 15 minutes or 1 hour, when nothing plays |
| **Without DSI display** | only says what the box does; the switch is under **Settings › Display** (see [Without DSI display](ohne-dsi-display.md)) |

The button **Show the IP address of the box as a QR code** tries the QR code out. A change of chip, size, address or rotation restarts the display; the others apply at once.

The **128 × 32** display shows title, artist, time, volume and WLAN in one layout.

## Pictures

The **Pictures** card shows the pictures of the display and where they appear. All are **128 × 64** dots, white on black.

| Picture | When it appears | Changeable |
| --- | --- | --- |
| **Start picture** (the MuPiBox logo) | at boot, as soon as the display program starts, until the box is ready (two minutes at most) | yes |
| **Idle: NFC reader** | when idle, if **Idle display** is **NFC reader** | no |
| **Idle: Barcode scanner** | when idle, if **Idle display** is **Barcode scanner** | no |
| **Idle: Own picture** | when idle, if **Idle display** is **Own picture** (until you choose one, the NFC reader stays) | yes |
| **Update** | while an update runs | yes |
| **Rest time and limit** (a sleeping face) | while a rest time runs or the limit is reached | yes |
| **Shutdown** (the power symbol) | as soon as the box shuts down | no |

Every picture has a button **Show picture**: the picture is then on the display for **ten seconds**, after which the display shows what it showed before. That way you see a picture without its occasion happening.

For a changeable picture tap **Change picture** and choose a picture from your device. The box takes **only pictures that are exactly 128 × 64 points and consist of pure black and white only (1 bit)**; white is lit. The app checks this when you choose, the box checks again. A picture with another size, grey tones, colours or transparent parts is **refused**; nothing is scaled or converted. Prepare the picture beforehand in a graphics program (size 128 × 64, mode "black and white", with or without dithering as you like). **Reset** brings the original back.

### The picture of a tag

Every NFC tag can have a picture of its own that the display shows while **the medium of that tag** plays (an album, a stream, a podcast, whatever the tag starts). It replaces the progress bar and the big time (in **Full** the lines with title and artist); the top 50 points belong to the picture, while the status bar (Mix) or the WLAN symbol and PAUSE (Compact) stay. For a podcast or a radio station, **Full** and **Mix** show the **time of day** where the track number would be. In **Full** too the picture is at the top; below it stays the row with the play mark and the time. On a display of 128 × 32 points it does not appear. For a podcast or a radio station **Show podcasts and radio** (Settings › OLED display › Display) chooses whether the picture or the title with the time of day is shown.

You choose the picture in **Settings › NFC extension › Assigned tags** with the **OLED picture** button on the tile of the tag (the button is there only when the OLED extension is installed), see [Assigned tags](nfc-zugeordnete-tags.md). The box takes **only pictures that are exactly 128 × 50 points and consist of pure black and white only (1 bit)**; white is lit. Anything else is refused, as with the other pictures. If the tag already has a picture, the same window shows it first and asks whether you want to change or **remove** it; when the tag is removed, its picture goes with it. The picture appears only when the tag started the medium: if the child then chooses something else on the display, the normal picture is back. The pictures of the tags are not part of the export of the tag list.

The update and shutdown pictures are drawn by the box itself, even when the server has stopped by then. The start picture appears as soon as the display program has started; a picture before that, while Linux is still starting, is not possible.

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
