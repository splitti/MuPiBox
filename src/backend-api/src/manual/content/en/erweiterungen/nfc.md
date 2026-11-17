# NFC extension

The **NFC extension** connects up to **three NFC readers** to the box. A reader reads the **UID** of tags and cards, when one comes near and when it goes away. Each tag can **start an album, an audio-play folder, a station or a podcast**; the assignment works like TeddyCloud: choose a medium, lay the tag on, done.

After the [installation](installieren.md) the settings are under **Settings › NFC extension**. The page has three sub pages:

- **NFC reader** sets up the readers: one card per reader with its status, type and settings.
- **Assigned tags** shows all tags with their media.
- **Speech output** sets what the box says with its voice when something is in the way (no WiFi, NAS not reachable, a tag without a medium, battery nearly empty).

## The manual pages on the NFC extension

| Page | Content |
| --- | --- |
| [Linking a tag to an album](nfc-tag-zuordnen.md) | step by step: choose a medium, lay the tag on, flex tag |
| [Changing the picture of a tag](nfc-bild.md) | the cover of the medium or your own picture |
| [Assigned tags](nfc-zugeordnete-tags.md) | the page with all tags as tiles (play, change, remove) and the setting for taking off |
| [Spoken messages](nfc-sprachnachrichten.md) | the messages of the box: WiFi, NAS, Spotify, a tag without a medium, battery at 10 % |
| [Adding readers](nfc-leser.md) | setting up a reader, up to three at once, the status |
| [Connecting the PN5180](nfc-pn5180.md) | wiring, SPI, settings |
| [Connecting the RC522](nfc-rc522.md) | wiring, SPI, settings |
| [Connecting the PN532](nfc-pn532.md) | wiring for I2C, SPI and serial |
| [Connecting a USB reader](nfc-usb.md) | USB Reader 1 and 2, barcode readers |

## Which reader?

| Reader | reads | Connection | Note |
| --- | --- | --- | --- |
| **PN5180** | ISO 14443 A and **ISO 15693** (NTAG, MIFARE, ICODE, SLIX) | SPI | reads both worlds; needs 5 V and 3.3 V |
| **RC522** | ISO 14443 A | SPI | the small blue board; 3.3 V only |
| **PN532** | ISO 14443 A | I2C, SPI or serial | the connection is chosen with two switches on the board |
| **USB reader** | ISO 14443 A or barcodes, depending on the device | USB | types the number like a keyboard; only laying on is reported |

## In short

1. Connect the reader to the box (see the page of the reader in the table above) and, for SPI, switch the port on.
2. On the sub page **NFC reader** choose the reader at **Type**. The **Status** shows **Ready** when everything is right.
3. In the library open an album, tap **NFC tag** and lay the tag on. From then on the tag starts the album.

The extension runs as a program in the background and restarts itself after an error, first after a few seconds, then more slowly. Messages are in the box's log (`pm2 logs server`, lines with `[nfc]`).
