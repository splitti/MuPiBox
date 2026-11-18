# NFC: PN532 anschließen

Der **PN532** liest **ISO 14443 A**, kein ISO 15693. Auf der Platine (Elechouse, Adafruit und Nachbauten) wählen zwei Schalter den Anschluss: **I2C**, **SPI** oder **seriell (UART)**. Der gleiche Anschluss muss bei **PN532 Anschluss** stehen.

| Anschluss | Schalter (SEL0 / SEL1) | Verdrahtung |
| --- | --- | --- |
| **I2C** (Standard) | 1 / 0 | SDA an Pin 3 (GPIO 2), SCL an Pin 5 (GPIO 3) |
| **SPI** | 0 / 1 | wie beim RC522: SCK, MOSI, MISO und SS an CE0 (Pin 24) |
| **Seriell (UART)** | 0 / 0 | TX der Platine an Pin 10 (RXD), RX der Platine an Pin 8 (TXD) |

Versorgung: 3,3 V oder 5 V, je nach Platine (die Beschriftung prüfen), und Masse. Die Schalterstellung ist auf Platinen verschieden: Im Zweifel steht sie auf der Platine oder im Datenblatt des Händlers. Verdrahte bei ausgeschalteter Box.

## I2C

![Verdrahtung des PN532 über I2C](wiring-pn532-i2c.svg)

| PN532 | Raspberry Pi | Pin der Stiftleiste |
| --- | --- | --- |
| VCC | 3,3 V (oder 5 V, je nach Platine) | 1 (oder 2) |
| GND | Masse | 6 |
| SDA | GPIO 2 (I2C SDA) | 3 |
| SCL | GPIO 3 (I2C SCL) | 5 |

I2C schaltest du in der App ein: Auf der Unterseite **NFC-Reader** hat die Karte **Anschlüsse** den Block **I2C**. Ist er **Ausgeschaltet**, tippst du rechts neben dem **Zustand** auf **I2C einschalten**; das trägt `dtparam=i2c_arm=on` in die `config.txt` und das Modul `i2c-dev` in `/etc/modules` ein. Danach die Box **neu starten**. Dann gibt es `/dev/i2c-1`.

## SPI

![Verdrahtung des PN532 über SPI](wiring-pn532-spi.svg)

| PN532 | Raspberry Pi | Pin der Stiftleiste |
| --- | --- | --- |
| VCC | 3,3 V (oder 5 V, je nach Platine) | 1 (oder 2) |
| GND | Masse | 6 |
| SCK | GPIO 11 (SPI SCLK) | 23 |
| MISO | GPIO 9 (SPI MISO) | 21 |
| MOSI | GPIO 10 (SPI MOSI) | 19 |
| SS | GPIO 8 (SPI CE0) | 24 |

SPI wird wie beim PN5180 eingeschaltet (siehe [PN5180 anschließen](nfc-pn5180.md), Abschnitt **SPI einschalten**: der Block **SPI** der Karte **Anschlüsse** auf der Seite **NFC-Reader**).

## Seriell (UART)

![Verdrahtung des PN532 über die serielle Schnittstelle](wiring-pn532-uart.svg)

| PN532 | Raspberry Pi | Pin der Stiftleiste |
| --- | --- | --- |
| VCC | 3,3 V (oder 5 V, je nach Platine) | 1 (oder 2) |
| GND | Masse | 6 |
| TX | GPIO 15 (RXD) | 10 |
| RX | GPIO 14 (TXD) | 8 |

TX und RX werden **gekreuzt**: Das Senden (TX) der Platine geht an den Empfang (RXD) des Pi. Seriell schaltest du in der App ein: Der Block **Seriell (UART)** der Karte **Anschlüsse** auf der Unterseite **NFC-Reader** zeigt den **Zustand** und die **System-Konsole**. **Seriell einschalten** trägt `enable_uart=1` in die `config.txt` ein und schaltet die Konsole auf der Schnittstelle ab (die Konsole des Systems würde die Schnittstelle belegen). Ist der Anschluss schon an, aber die **System-Konsole** steht auf **An, blockiert den Port für den PN532**, schaltet **Konsole abschalten** sie ab. Danach die Box **neu starten**. Von Hand geht es in `dietpi-config` unter **Advanced Options › Serial/UART**. Als **Serielle Schnittstelle** wählst du `/dev/serial0`; auf dem Pi 5 ist `/dev/ttyAMA0` die Schnittstelle an Pin 8 und 10. Auf einem Pi 3 und 4 hängt an `/dev/ttyAMA0` das **Bluetooth** der Box – dort nicht `/dev/ttyAMA0` wählen.

## Einstellen

Auf der Unterseite **NFC-Reader** bei **Typ** den **PN532** wählen (siehe [Leser hinzufügen](nfc-leser.md)), dann bei **PN532 Anschluss** I2C, SPI oder seriell und bei seriell die **Serielle Schnittstelle**. Bei SPI zusätzlich **NSS an** (CE0 oder CE1).
