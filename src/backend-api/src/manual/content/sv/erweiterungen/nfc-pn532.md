# NFC: ansluta PN532

**PN532** läser **ISO 14443 A**, inte ISO 15693. På kortet (Elechouse, Adafruit och kopior) väljer två omkopplare anslutningen: **I2C**, **SPI** eller **seriellt (UART)**. Samma anslutning måste stå vid **PN532-anslutning**.

| Anslutning | Omkopplare (SEL0 / SEL1) | Koppling |
| --- | --- | --- |
| **I2C** (standard) | 1 / 0 | SDA till stift 3 (GPIO 2), SCL till stift 5 (GPIO 3) |
| **SPI** | 0 / 1 | som vid RC522: SCK, MOSI, MISO och SS till CE0 (stift 24) |
| **Seriellt (UART)** | 0 / 0 | kortets TX till stift 10 (RXD), kortets RX till stift 8 (TXD) |

Matning: 3,3 V eller 5 V, beroende på kortet (kontrollera märkningen), och jord. Omkopplarnas lägen skiljer sig mellan korten: vid tvekan står de på kortet eller i återförsäljarens datablad. Koppla med boxen avstängd.

## I2C

![Koppling av PN532 via I2C](wiring-pn532-i2c.svg)

| PN532 | Raspberry Pi | Stift på stiftlisten |
| --- | --- | --- |
| VCC | 3,3 V (eller 5 V, beroende på kortet) | 1 (eller 2) |
| GND | Jord | 6 |
| SDA | GPIO 2 (I2C SDA) | 3 |
| SCL | GPIO 3 (I2C SCL) | 5 |

I2C slår du på i appen: På undersidan **NFC-läsare** har kortet **Anslutningar** blocket **I2C**. Är det **Avstängd** trycker du till höger om **Status** på **Slå på I2C**; det skriver in `dtparam=i2c_arm=on` i `config.txt` och modulen `i2c-dev` i `/etc/modules`. Därefter **startar du om** boxen. Då finns `/dev/i2c-1`.

## SPI

![Koppling av PN532 via SPI](wiring-pn532-spi.svg)

| PN532 | Raspberry Pi | Stift på stiftlisten |
| --- | --- | --- |
| VCC | 3,3 V (eller 5 V, beroende på kortet) | 1 (eller 2) |
| GND | Jord | 6 |
| SCK | GPIO 11 (SPI SCLK) | 23 |
| MISO | GPIO 9 (SPI MISO) | 21 |
| MOSI | GPIO 10 (SPI MOSI) | 19 |
| SS | GPIO 8 (SPI CE0) | 24 |

SPI slås på som vid PN5180 (se [Ansluta PN5180](nfc-pn5180.md), avsnittet **Slå på SPI**: blocket **SPI** på kortet **Anslutningar** på sidan **NFC-läsare**).

## Seriellt (UART)

![Koppling av PN532 via den seriella porten](wiring-pn532-uart.svg)

| PN532 | Raspberry Pi | Stift på stiftlisten |
| --- | --- | --- |
| VCC | 3,3 V (eller 5 V, beroende på kortet) | 1 (eller 2) |
| GND | Jord | 6 |
| TX | GPIO 15 (RXD) | 10 |
| RX | GPIO 14 (TXD) | 8 |

TX och RX **korsas**: Kortets sändning (TX) går till Pi:ns mottagning (RXD). Seriellt slår du på i appen: Blocket **Seriell (UART)** på kortet **Anslutningar** på undersidan **NFC-läsare** visar **Status** och **Systemkonsol**. **Slå på seriell** skriver in `enable_uart=1` i `config.txt` och stänger av konsolen på porten (systemkonsolen skulle annars uppta porten). Är anslutningen redan på men **Systemkonsol** står på **På, blockerar porten för PN532** stänger **Stäng av konsolen** av den. Därefter **startar du om** boxen. För hand går det i `dietpi-config` under **Advanced Options › Serial/UART**. Som **Seriellt gränssnitt** väljer du `/dev/serial0`; på Pi 5 är `/dev/ttyAMA0` porten på stift 8 och 10. På en Pi 3 och 4 sitter boxens **Bluetooth** på `/dev/ttyAMA0` – välj där inte `/dev/ttyAMA0`.

## Ställa in

På undersidan **NFC-läsare** väljer du **PN532** vid **Typ** (se [Lägga till läsare](nfc-leser.md)), därefter vid **PN532-anslutning** I2C, SPI eller seriellt och vid seriellt den **seriella porten**. Vid SPI dessutom **NSS på** (CE0 eller CE1).
