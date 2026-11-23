# NFC: Adding readers

You set up the readers on the sub page **NFC reader** (**Settings › NFC extension › NFC reader**). Up to **three readers** work side by side, for example a PN5180 on the SPI port and a USB reader.

## The first reader

The page starts with a card that explains the page. Below it come the card **Ports** (see below) and the card **Reader 1**. **Reader 1** has:

- the **Status** card: whether the reader runs (see below),
- the **Type**: **No reader** (default), **PN5180**, **RC522**, **PN532**, **USB Reader 1** or **USB Reader 2**,
- below it only the settings that belong to this type.

![The NFC reader page with Reader 1](nfc-reader-page.png)

Connect the reader (see the pages of the readers below), choose the **Type**, and set what the type asks for. Every change takes effect at once, no restart of the box is needed (except when you first have to switch on SPI, I2C or the serial port).

| Setting | Effect |
| --- | --- |
| **Type** | the reader that works in this place |
| **NSS on** | the chip select NSS is connected to: **CE0** (pin 24, default) or **CE1** (pin 26) |
| **GPIO pin BUSY**, **GPIO pin RST** | the pins for the two lines; two different ones |
| **Detect** | PN5180 only: **Both** (default), only **ISO 14443 A** or only **ISO 15693** |
| **PN532 connection**, **Serial interface** | PN532 only: I2C (default), SPI or serial, and for serial the interface |

## Switching SPI, I2C and serial on and off

The ports of the box that the readers talk through are off on a fresh box. The card **Ports** under the text of the page has a block for **SPI**, **I2C** and **Serial (UART)**. Each shows in the line **Status** whether the port is on, and **at the right of it** a button: if the port is **Switched on**, the button says **Switch SPI off** (**Switch I2C off**, **Switch serial off**); if it is **Switched off**, it says **Switch SPI on** (**Switch I2C on**, **Switch serial on**). After a question the box changes the line in the configuration; then **restart** the box. A USB reader needs none of these ports.

| Block | Who needs it | Switching on enters | Switching off enters | The device |
| --- | --- | --- | --- | --- |
| **SPI** | PN5180, RC522 and a PN532 on SPI | `dtparam=spi=on` in the `config.txt` | `dtparam=spi=off` | `/dev/spidev0.0` |
| **I2C** | a PN532 on I2C | `dtparam=i2c_arm=on` in the `config.txt` and `i2c-dev` in `/etc/modules` | `dtparam=i2c_arm=off` | `/dev/i2c-1` |
| **Serial (UART)** | a PN532 on the serial port | `enable_uart=1` in the `config.txt`, and the console on the port is switched off | `enable_uart=0` | `/dev/serial0` |

The **Status** says **Switched on**, **Switched off** or, as long as the box has not restarted after a change, **Switched on, the box has to restart** and **Switched off, the box has to restart**. The line **Device** names the device file when there is one. The block **Serial (UART)** has one more line, **System console**. That is the text access of the system (login by cable), which runs on the serial port by default. If it says **On, blocks the port for the PN532**, the system uses the port itself and a PN532 does not work. The button **Switch console off** next to that line switches the console off. Do not switch I2C off while something else needs it, for example a MuPiHAT. The details are on the pages of the readers, for example [Connecting the PN5180](nfc-pn5180.md) and [Connecting the PN532](nfc-pn532.md).

## Adding another reader

The button **+ Reader** under the last card adds **Reader 2**, then **Reader 3**. Every reader is in a **card of its own** with its own **Status** and its own **Type**.

![The NFC reader page with Reader 1 and Reader 2](nfc-reader-page-2.png)

1. Tap **+ Reader**. The new card appears and is first set to **No reader**.
2. Connect the new reader and choose it at **Type**.
3. The **Status** of the card shows **Ready** as soon as the reader runs.

The bin symbol at the top of the card of **Reader 2** or **Reader 3** takes the reader away again; its pins are free again and it no longer runs. When all three readers are there, the button **+ Reader** disappears.

## The readers must not get in each other's way

Every reader needs its **own connection**:

- An **SPI device** (**CE0** or **CE1**) belongs to one reader, whatever its type: a PN5180 and an RC522 both on CE0 do not work, an RC522 on CE1 beside it does.
- The **PN532** on **I2C** uses the I2C bus, on **SPI** an SPI device, on the **serial** connection the chosen port.
- **USB Reader 1** and **USB Reader 2** are two different devices and do not get in each other's way. Two readers of the same type (**USB Reader 1** twice) want the same device.
- **Pins** (BUSY, RST) can be given only once; the choice locks pins that are taken.

A reader that would fight an earlier one for the same connection does not start and says **This reader needs the same connection as another one** (see **Status**). The earlier reader keeps running.

A tag counts the same on every reader: which medium it starts depends only on its number. The same card has a different number on a USB reader than on a PN5180, though: tags are **not** interchangeable between the types of reader.

## Connecting the readers

| Reader | Page |
| --- | --- |
| **PN5180** | [Connecting the PN5180](nfc-pn5180.md) |
| **RC522** | [Connecting the RC522](nfc-rc522.md) |
| **PN532** | [Connecting the PN532](nfc-pn532.md) |
| **USB Reader 1**, **USB Reader 2** | [Connecting a USB reader](nfc-usb.md) |

## Status

The **Status** card of every reader shows how far it is, and updates itself:

| Display | Meaning |
| --- | --- |
| **Reader: Off** | no reader chosen |
| **Ready**, **Firmware PN5180 4.0** | the chip answers; the version number comes from the chip itself. Wiring and SPI are right |
| **Device** | for a USB reader: its name (for example "Tera 5100 dongle") |
| **Tag in the field** | a tag is lying on the reader right now (not for USB readers) |
| **Last tag** | the UID (for example `04:A1:B2:C3:D4:E5:F6`) and the kind of tag |

If the reader is not ready, **Note** says what to check:

| Note | What to do |
| --- | --- |
| Please choose the pins BUSY and RST | set two different pins |
| This reader needs the same connection as another one | choose another SPI device or port, or choose different types for USB readers (**USB Reader 1** and **USB Reader 2**) |
| SPI is off: switch it on in the Ports card, then restart | in the card **Ports**, at **SPI**, tap **Switch SPI on** and restart the box (see [Connecting the PN5180](nfc-pn5180.md)) |
| I2C is off: switch it on in the Ports card, then restart | in the card **Ports**, at **I2C**, tap **Switch I2C on** and restart the box (see [Connecting the PN532](nfc-pn532.md)) |
| The serial port is missing: switch serial on in the Ports card, then restart | in the card **Ports**, at **Serial (UART)**, tap **Switch serial on** and restart the box (see [Connecting the PN532](nfc-pn532.md)) |
| No access to the SPI bus | reinstall the extension, it creates the access rule for `/dev/spidev` |
| The packages python3-spidev and python3-lgpio are missing | reinstall the extension (it loads the packages) |
| The pins BUSY and RST cannot be used | another program has the pin; choose another |
| BUSY does not react: check BUSY, RST and the power supply | check BUSY and RST and both supplies (5 V and 3.3 V) |
| The reader does not answer: check MISO, MOSI, SCK, NSS and the power supply | check the wires and the ground, and whether the reader has both supplies |
| No USB reader found: plug it in or choose another USB reader in the Type menu | plug the reader in, or choose the other USB reader at **Type** |
