# NFC extension

The **NFC extension** connects an **NFC reader** to the box. It supports the **PN5180** (NXP), the **RC522** and the **PN532** on the Raspberry Pi, and **USB readers** that type the card number like a keyboard. It reads the **UID** of tags and cards when one comes close and when it is taken away. Every tag can **start an album, an audio-play folder, a station or a podcast**; the assignment works as with TeddyCloud: choose media, lay the tag on, done. The settings also show whether the reader is running and which tag was read last.

The PN5180 reads both worlds: **ISO 14443 A** (NTAG, MIFARE and most cards and stickers) and **ISO 15693** (ICODE, SLIX).

After the [installation](installieren.md) the settings are under **Settings › System › NFC extension**. The page has two sub pages: **NFC reader** sets up the reader (wiring, pins, state of the reader), **Assigned tags** shows the tags with their media. Media are assigned in the library (see below).

## Wiring

Wire with the box switched off. The PN5180 needs **both** supplies: **5 V** for the transmitter of the antenna and **3.3 V** for the logic. The signals are 3.3 V, no level shifter is needed.

| PN5180 | Raspberry Pi | Pin of the header |
| --- | --- | --- |
| 5V | 5 V | 2 |
| 3.3V | 3.3 V | 1 |
| GND | ground | 6 |
| SCK | GPIO 11 (SPI SCLK) | 23 |
| MOSI | GPIO 10 (SPI MOSI) | 19 |
| MISO | GPIO 9 (SPI MISO) | 21 |
| NSS | GPIO 8 (SPI CE0) | 24 |
| BUSY | GPIO 25 (suggestion) | 22 |
| RST | GPIO 23 (suggestion) | 16 |
| IRQ, GPIO, AUX, REQ | leave open | – |

The pins **SCK, MOSI, MISO and NSS** are fixed by the SPI port. You choose **BUSY and RST** in the settings; GPIO 25 and GPIO 23 are free on most boxes, and the choice locks pins that are taken. The PN5180 tells through BUSY when it is ready; it does not work without it. The IRQ pin is not needed, the extension asks the chip.

> [!WARNING]
> The box's **rotary encoder** has its button on GPIO 10 by default, which is also MOSI of the SPI port. With a rotary encoder, move its button to a free pin under **Settings › Rotary encoder** (GPIO 5, say) and restart the box afterwards (until then GPIO 10 stays blocked for the reader); the page shows a hint while a pin of the rotary encoder is also taken by the SPI port.

Short wires help (up to about 15 cm), ideally with an extra ground wire. The labels differ from board to board: check the labels on yours, especially 5V and 3.3V. The whole header is shown in the appendix [GPIO assignment](../anhang/gpio.md).

## Switching SPI on

SPI is off on a fresh box. Switch it on

- in `dietpi-config` under **Advanced Options › SPI state**, or
- by adding the line `dtparam=spi=on` to `config.txt` (`/boot/firmware/config.txt`; older systems: `/boot/config.txt`).

Then **restart** the box. The device `/dev/spidev0.0` is there afterwards.

## Settings

The settings of the reader are on the sub page **NFC reader**.

| Setting | Effect |
| --- | --- |
| **Type** | **No reader** (default), **PN5180**, **RC522**, **PN532** or **USB reader (keyboard)** |
| **NSS on** | the chip select NSS is wired to: **CE0** (pin 24, default) or **CE1** (pin 26) |
| **GPIO pin BUSY**, **GPIO pin RST** | the pins for the two lines; two different ones |
| **Detect** | PN5180 only: **Both** (default), only **ISO 14443 A** or only **ISO 15693**. The RC522, PN532 and USB readers read ISO 14443 A |
| **PN532 connection**, **Serial port** | PN532 only: I2C (default), SPI or serial, and for serial the port |
| **Name of the USB reader** | USB reader only: leave empty or enter a part of the name |

The page shows only the settings and notes of the reader you chose at **Type**: with the RC522, for example, no BUSY pin, no choice of the kind of tag and nothing about the PN532. Every change takes effect at once. A restart is not needed.

## More readers

Besides the PN5180 the extension knows three more readers. You choose one with **Type**. Every reader reports the same: a tag comes, a tag goes (the USB reader does not). Which medium a tag starts is the same for all of them.

### RC522

The RC522 (MFRC522) is the small blue board. It reads **ISO 14443 A**, not ISO 15693. It works on **3.3 V**, **never on 5 V**. SPI must be switched on (see above).

| RC522 | Raspberry Pi | Header pin |
| --- | --- | --- |
| 3.3V | 3.3 V | 1 |
| GND | Ground | 6 |
| SCK | GPIO 11 (SPI SCLK) | 23 |
| MOSI | GPIO 10 (SPI MOSI) | 19 |
| MISO | GPIO 9 (SPI MISO) | 21 |
| SDA (= NSS) | GPIO 8 (SPI CE0) | 24 |
| RST | a free pin, for example GPIO 25 | 22 |
| IRQ | leave free | – |

The **RST pin** is optional: without a pin the extension resets the chip with its software reset. As with the PN5180, move the **rotary encoder's** button (GPIO 10 by default, MOSI) to another pin.

### PN532

The PN532 reads **ISO 14443 A**, not ISO 15693. On the board (Elechouse, Adafruit and copies) two switches choose the connection; the same connection must be set at **PN532 connection**.

| Connection | Switches (SEL0 / SEL1) | Wiring |
| --- | --- | --- |
| **I2C** (default) | 1 / 0 | SDA to pin 3 (GPIO 2), SCL to pin 5 (GPIO 3) |
| **SPI** | 0 / 1 | as with the RC522: SCK, MOSI, MISO and SS to CE0 (pin 24) |
| **Serial (UART)** | 0 / 0 | TX of the board to pin 10 (RXD), RX of the board to pin 8 (TXD) |

Supply: 3.3 V or 5 V, depending on the board (check its label), and ground. The switch positions differ between boards: when in doubt they are printed on the board or in the seller's data sheet.

- **I2C** needs `dtparam=i2c_arm=on` in `config.txt` and the module `i2c-dev` (a line `i2c-dev` in `/etc/modules`), then a restart. Then `/dev/i2c-1` exists.
- **SPI** is switched on as above.
- **Serial** needs `enable_uart=1` in `config.txt`; the console on the port must be off (in `dietpi-config` under **Advanced Options › Serial/UART**). Choose `/dev/serial0` as the **serial port**; on the Pi 5 `/dev/ttyAMA0` is the port on pins 8 and 10. On a Pi 3 and 4 the box's **Bluetooth** is on `/dev/ttyAMA0` – do not choose `/dev/ttyAMA0` there.

### USB reader (keyboard)

Cheap USB readers (Neuftech, Sycreader and the like, often "RFID Reader 125 kHz / 13.56 MHz") register as a **keyboard** and **type the card number**, usually ten digits and Enter. They need nothing but the plug. The extension reads the keys of the device and **takes the device for itself**: the digits land neither in the console nor in the browser of the display.

- **Name of the USB reader**: leave empty, the box finds the reader itself when only one USB keyboard is plugged in (or only one is named like a reader). If another USB keyboard is plugged in, enter a part of the name (for example `Sycreader`) or the path (`/dev/input/event3`). `cat /proc/bus/input/devices` shows which devices there are.
- The **number** of the tag is the card number as the reader types it. It stands like that in the list of tags (without colons). A tag that another reader (PN5180, RC522, PN532) reads has another number: tags are **not** interchangeable between the types of reader.
- A USB reader reports **only the laying on**, never the taking off. **When taken off** therefore does nothing with it; playback just goes on. The page does not show "Tag in the field".
- When setting up for the first time (or after plugging in another reader) **plug the device in again**, so that the permission (the udev rule of the extension) applies.

## Giving media to tags

A tag gets its medium where you find the medium: in the **library**.

1. In the library open an **album, an audio-play folder, a station or a podcast**: for folders of the SD card and the NAS the window of the album, for Spotify, radio, podcast and TIDAL entries the window of the entry.
2. Tap **NFC tag**. The window shows which tags the medium already has (with a picture) and lets you change a picture or **remove** a tag there.
3. Tap **Add NFC tag** (for the first tag) or **Add another NFC tag**. The window shows the cover and "Now lay the NFC tag on the reader".
4. Lay the tag on the reader. The window says "Done – the tag now belongs to this medium", and the medium starts on the display.

A medium can have **several tags**, for instance one for each child: the window **NFC tag** lists them all, and **Add another NFC tag** adds one.

From then on the tag starts its medium every time it lies on the reader, without you setting anything. If the tag had a medium already, the new one replaces it; the window names the old one ("Before: …"). An assignment waits for at most **ten minutes**, and only while the window is open: if you close it, lock the phone or reload the app, it is cancelled after a few seconds.

**Podcasts:** A tag with a podcast plays an **episode** of it, and only one that the tile shows too (your choice of episodes and the entry's sorting count): the one that was begun and not heard to the end, else the first one not heard (without a sorting of your own the newest), else the first. For this the box needs the feed (internet, or the box's cache); when it cannot be reached, nothing starts.

Not every entry can be given to a tag: a folder that only holds other folders, and a whole artist (Spotify, TIDAL), have no single medium. There the button is missing, or the box says "This medium cannot be given to a tag".

### The picture of a tag

In the list of the tags every tag shows a picture. It is the **cover of the medium**, as the tile shows it (an album with `cover.jpg`, the picture from Spotify, the picture of a podcast, the logo of a station). You choose **an own picture** in the window with **Choose picture** or **Change picture** (a search at iTunes, Deezer and Spotify, or a picture from your device), either when assigning or later in the list. **Use the cover of the medium** gives the picture of the medium back.

### Flex tag

With the **Flex tag** tick in the window the tag becomes the **flex tag** (as it is called in TeddyCloud too): a tag whose medium you can change at any time. When you later assign another medium with the tick set, the flex tag has it **at once**, without having to lie on the reader. There is only one flex tag; a new one replaces the old one.

### Assigned tags

The sub page **Assigned tags** lists all tags with picture, medium, kind (SD card, NAS, Spotify, radio, podcast, TIDAL) and UID. There you change the picture of a tag or **remove** it; a removed tag counts as new the next time it is laid on and plays nothing.

### Laying on and taking off

The sub page **Assigned tags** holds these settings too:

| Setting | Effect |
| --- | --- |
| **Tag starts its medium** | Off: tags are only read and assigned, nothing starts. |
| **When taken off** | **Pause** (default), **Stop** or **Keep playing**. Only a tag that has a medium triggers it, and only while what it started still plays: if the child chose something else on the display meanwhile, that goes on. |

With **Pause** an audio play goes on where it was when the same tag is laid on again within half an hour. With another tag its medium starts as with a tap on the tile.

The assignments are in `tags.json` in the extension's data folder (`~/.mupibox/data/extensions/nfc/`) and stay through updates. The box starts through the **display** (so tile times, play time and "Resume" count as with a tap); with no display running a tag therefore starts nothing.

## Status

The **Status** card at the top of the sub page **NFC reader** shows how far the reader has come and updates itself:

| Display | Meaning |
| --- | --- |
| **Reader: Off** | no reader chosen |
| **Ready**, **Firmware PN5180 4.0** | the chip answers; the version number comes from the chip itself. Wiring and SPI are right |
| **Tag in the field** | a tag is on the reader right now |
| **Last tag** | the UID (for example `04:A1:B2:C3:D4:E5:F6`) and the kind of tag |

If the reader is not ready, **Note** says what to check:

| Note | What to do |
| --- | --- |
| Please choose the pins BUSY and RST | set two different pins |
| SPI is off: add dtparam=spi=on to config.txt, then restart | add `dtparam=spi=on` and restart (see above) |
| No access to the SPI bus | install the extension again, it sets the access rule for `/dev/spidev` |
| The packages python3-spidev and python3-lgpio are missing | install the extension again (it loads the packages) |
| The pins BUSY and RST cannot be used | another program holds the pin; choose another |
| BUSY does not react: check BUSY, RST and the power supply | check BUSY, RST and both supplies (5 V and 3.3 V) |
| The reader does not answer: check MISO, MOSI, SCK, NSS and the power supply | check the wires and ground, and whether the reader has both supplies |

The extension runs as a program in the background and starts itself again after an error, after a few seconds first, then more slowly. Messages are in the box's log (`pm2 logs server`, lines with `[nfc]`).
