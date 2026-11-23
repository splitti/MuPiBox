# NFC: Connecting the RC522

The **RC522** (MFRC522) is the small blue board. It reads **ISO 14443 A**, not ISO 15693. It works with **3.3 V**, **never on 5 V**. It connects to the **SPI port** of the Raspberry Pi; SPI must be switched on (see [Connecting the PN5180](nfc-pn5180.md), section **Switching SPI on**: the block **SPI** of the card **Ports** on the page **NFC reader**).

## Wiring

Wire with the box switched off.

![Wiring of the RC522 to the Raspberry Pi](wiring-rc522.svg)

| RC522 | Raspberry Pi | Pin of the header |
| --- | --- | --- |
| 3.3V | 3.3 V | 1 |
| GND | ground | 6 |
| SCK | GPIO 11 (SPI SCLK) | 23 |
| MOSI | GPIO 10 (SPI MOSI) | 19 |
| MISO | GPIO 9 (SPI MISO) | 21 |
| SDA (= NSS) | GPIO 8 (SPI CE0) | 24 |
| RST | a free pin, for example GPIO 25 | 22 |
| IRQ | leave free | – |

The **RST pin** is optional: without a pin the extension resets the chip through its software reset.

Short wires help (up to about 15 cm). The pin labels of the boards differ: check yours. The whole header is shown in the appendix [GPIO pinout](../anhang/gpio.md).

## Settings

On the sub page **NFC reader** choose the **RC522** at **Type** (see [Adding readers](nfc-leser.md)):

| Setting | Effect |
| --- | --- |
| **NSS on** | **CE0** (pin 24, default) or **CE1** (pin 26), depending on where SDA is connected |
| **GPIO pin RST** | the pin RST is connected to; may stay free |

The RC522 has no choice of the kind of tag and no BUSY pin; the page does not show them for the RC522. The **Status** shows **Ready** and, at **Chip**, the version of the RC522.
