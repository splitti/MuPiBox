# NFC: Connecting the PN532

The **PN532** reads **ISO 14443 A**, not ISO 15693. On the board (Elechouse, Adafruit and clones) two switches choose the connection: **I2C**, **SPI** or **serial (UART)**. The same connection must be set at **PN532 connection**.

| Connection | Switches (SEL0 / SEL1) | Wiring |
| --- | --- | --- |
| **I2C** (default) | 1 / 0 | SDA to pin 3 (GPIO 2), SCL to pin 5 (GPIO 3) |
| **SPI** | 0 / 1 | as with the RC522: SCK, MOSI, MISO and SS to CE0 (pin 24) |
| **Serial (UART)** | 0 / 0 | TX of the board to pin 10 (RXD), RX of the board to pin 8 (TXD) |

Supply: 3.3 V or 5 V, depending on the board (check the label), and ground. The switch positions differ between boards: when in doubt they are printed on the board or in the seller's data sheet. Wire with the box switched off.

## I2C

![Wiring of the PN532 over I2C](wiring-pn532-i2c.svg)

| PN532 | Raspberry Pi | Pin of the header |
| --- | --- | --- |
| VCC | 3.3 V (or 5 V, depending on the board) | 1 (or 2) |
| GND | ground | 6 |
| SDA | GPIO 2 (I2C SDA) | 3 |
| SCL | GPIO 3 (I2C SCL) | 5 |

You switch on I2C in the app: on the sub page **NFC reader** the card **Ports** has the block **I2C**. If it is **Switched off**, tap **Switch I2C on** at the right of the **Status**; that enters `dtparam=i2c_arm=on` in the `config.txt` and the module `i2c-dev` in `/etc/modules`. Then **restart** the box. Then `/dev/i2c-1` exists.

## SPI

![Wiring of the PN532 over SPI](wiring-pn532-spi.svg)

| PN532 | Raspberry Pi | Pin of the header |
| --- | --- | --- |
| VCC | 3.3 V (or 5 V, depending on the board) | 1 (or 2) |
| GND | ground | 6 |
| SCK | GPIO 11 (SPI SCLK) | 23 |
| MISO | GPIO 9 (SPI MISO) | 21 |
| MOSI | GPIO 10 (SPI MOSI) | 19 |
| SS | GPIO 8 (SPI CE0) | 24 |

SPI is switched on as for the PN5180 (see [Connecting the PN5180](nfc-pn5180.md), section **Switching SPI on**: the block **SPI** of the card **Ports** on the page **NFC reader**).

## Serial (UART)

![Wiring of the PN532 over the serial port](wiring-pn532-uart.svg)

| PN532 | Raspberry Pi | Pin of the header |
| --- | --- | --- |
| VCC | 3.3 V (or 5 V, depending on the board) | 1 (or 2) |
| GND | ground | 6 |
| TX | GPIO 15 (RXD) | 10 |
| RX | GPIO 14 (TXD) | 8 |

TX and RX are **crossed**: the sending (TX) of the board goes to the receiving (RXD) of the Pi. You switch on serial in the app: the block **Serial (UART)** of the card **Ports** on the sub page **NFC reader** shows the **Status** and the **System console**. **Switch serial on** enters `enable_uart=1` in the `config.txt` and switches off the console on the interface (the console of the system would occupy the interface). If the port is on already but the **System console** says **On, blocks the port for the PN532**, **Switch console off** switches it off. Then **restart** the box. By hand it is done in `dietpi-config` under **Advanced Options › Serial/UART**. As **Serial interface** choose `/dev/serial0`; on the Pi 5 `/dev/ttyAMA0` is the interface on pins 8 and 10. On a Pi 3 and 4 the box's **Bluetooth** is on `/dev/ttyAMA0` – do not choose `/dev/ttyAMA0` there.

## Settings

On the sub page **NFC reader** choose the **PN532** at **Type** (see [Adding readers](nfc-leser.md)), then at **PN532 connection** I2C, SPI or serial and, for serial, the **Serial interface**. For SPI also **NSS on** (CE0 or CE1).
