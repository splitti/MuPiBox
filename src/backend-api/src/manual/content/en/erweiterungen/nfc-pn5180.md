# NFC: Connecting the PN5180

The **PN5180** (NXP) reads both worlds: **ISO 14443 A** (NTAG, MIFARE and most cards and stickers) and **ISO 15693** (ICODE, SLIX). It connects to the **SPI port** of the Raspberry Pi.

## Wiring

Wire with the box switched off. The PN5180 needs **both** supplies: **5 V** for the transmitter of the antenna and **3.3 V** for the logic. The signals are 3.3 V, no level shifter is needed.

![Wiring of the PN5180 to the Raspberry Pi](wiring-pn5180.svg)

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
| IRQ, GPIO, AUX, REQ | leave free | – |

The pins **SCK, MOSI, MISO and NSS** are fixed by the SPI port. You choose **BUSY and RST** yourself in the settings; GPIO 25 and GPIO 23 are free on most boxes, and the choice locks pins that are already taken. The PN5180 tells through BUSY when it is ready, it does not work without BUSY. The IRQ connection is not needed, the extension polls the chip.

Short wires help (up to about 15 cm), best with an extra ground wire. The pin labels of the boards differ: check the label on yours, especially for 5V and 3.3V. The whole header is shown in the appendix [GPIO pinout](../anhang/gpio.md).

## Switching SPI on

The SPI port is off on a fresh box. The easiest way is to switch it on in the app: on the sub page **NFC reader** the card **Ports**, right under the text of the page, has the block **SPI**. If **SPI** is **Switched off**, tap **Switch SPI on** at the right of the **Status** and confirm; if it is **Switched on**, the button says **Switch SPI off**. After switching it on **restart** the box: then the **Status** shows **Switched on** and the **Device** `/dev/spidev0.0`.

You can also do it by hand:

- in `dietpi-config` under **Advanced Options › SPI state**, or
- enter the line `dtparam=spi=on` in the `config.txt` (`/boot/firmware/config.txt`; older systems: `/boot/config.txt`).

Then also **restart** the box.

## Settings

On the sub page **NFC reader** choose the **PN5180** at **Type** (see [Adding readers](nfc-leser.md)):

| Setting | Effect |
| --- | --- |
| **NSS on** | **CE0** (pin 24, default) or **CE1** (pin 26), depending on where NSS is connected |
| **GPIO pin BUSY** | the pin BUSY is connected to (suggestion GPIO 25) |
| **GPIO pin RST** | the pin RST is connected to (suggestion GPIO 23) |
| **Detect** | **Both** (default), only **ISO 14443 A** or only **ISO 15693** |

Then the **Status** shows **Ready** and **Firmware PN5180 4.0** (the version number comes from the chip). If it does not answer, the reason is under **Note** (see the table on the page [Adding readers](nfc-leser.md)).
