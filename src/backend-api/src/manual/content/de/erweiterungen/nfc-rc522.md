# NFC: RC522 anschließen

Der **RC522** (MFRC522) ist die kleine blaue Platine. Er liest **ISO 14443 A**, kein ISO 15693. Er arbeitet mit **3,3 V**, **nie an 5 V**. Er hängt am **SPI-Anschluss** des Raspberry Pi; SPI muss eingeschaltet sein (siehe [PN5180 anschließen](nfc-pn5180.md), Abschnitt **SPI einschalten**: der Block **SPI** der Karte **Anschlüsse** auf der Seite **NFC-Reader**).

## Verdrahtung

Verdrahte bei ausgeschalteter Box.

![Verdrahtung des RC522 am Raspberry Pi](wiring-rc522.svg)

| RC522 | Raspberry Pi | Pin der Stiftleiste |
| --- | --- | --- |
| 3.3V | 3,3 V | 1 |
| GND | Masse | 6 |
| SCK | GPIO 11 (SPI SCLK) | 23 |
| MOSI | GPIO 10 (SPI MOSI) | 19 |
| MISO | GPIO 9 (SPI MISO) | 21 |
| SDA (= NSS) | GPIO 8 (SPI CE0) | 24 |
| RST | ein freier Pin, zum Beispiel GPIO 25 | 22 |
| IRQ | frei lassen | – |

Der **RST-Pin** ist freiwillig: Ohne Pin setzt die Erweiterung den Chip über seinen Software-Reset zurück.

Kurze Leitungen helfen (bis etwa 15 cm). Die Pinbeschriftung der Platinen unterscheidet sich: Prüfe sie auf deiner. Die ganze Leiste zeigt der Anhang [GPIO-Belegung](../anhang/gpio.md).

## Einstellen

Auf der Unterseite **NFC-Reader** bei **Typ** den **RC522** wählen (siehe [Leser hinzufügen](nfc-leser.md)):

| Einstellung | Wirkung |
| --- | --- |
| **NSS an** | **CE0** (Pin 24, Standard) oder **CE1** (Pin 26), je nachdem, wo SDA hängt |
| **GPIO-Pin RST** | der Pin, an dem RST hängt; darf frei bleiben |

Der RC522 hat keine Wahl der Tag-Art und keine Pins BUSY; die Seite zeigt sie beim RC522 nicht. Der **Zustand** zeigt **Bereit** und beim **Chip** die Version des RC522.
