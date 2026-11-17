# NFC: PN5180 anschließen

Der **PN5180** (NXP) liest beide Welten: **ISO 14443 A** (NTAG, MIFARE und die meisten Karten und Sticker) und **ISO 15693** (ICODE, SLIX). Er hängt am **SPI-Anschluss** des Raspberry Pi.

## Verdrahtung

Verdrahte bei ausgeschalteter Box. Der PN5180 braucht **beide** Versorgungen: **5 V** für die Sendestufe der Antenne und **3,3 V** für die Logik. Die Signale sind 3,3 V, ein Pegelwandler ist nicht nötig.

![Verdrahtung des PN5180 am Raspberry Pi](wiring-pn5180.svg)

| PN5180 | Raspberry Pi | Pin der Stiftleiste |
| --- | --- | --- |
| 5V | 5 V | 2 |
| 3.3V | 3,3 V | 1 |
| GND | Masse | 6 |
| SCK | GPIO 11 (SPI SCLK) | 23 |
| MOSI | GPIO 10 (SPI MOSI) | 19 |
| MISO | GPIO 9 (SPI MISO) | 21 |
| NSS | GPIO 8 (SPI CE0) | 24 |
| BUSY | GPIO 25 (Vorschlag) | 22 |
| RST | GPIO 23 (Vorschlag) | 16 |
| IRQ, GPIO, AUX, REQ | frei lassen | – |

Die Pins **SCK, MOSI, MISO und NSS** hat der SPI-Anschluss fest. **BUSY und RST** wählst du in den Einstellungen selbst; GPIO 25 und GPIO 23 sind auf den meisten Boxen frei, die Auswahl sperrt Pins, die schon belegt sind. Der PN5180 meldet über BUSY, wann er bereit ist, ohne BUSY geht es nicht. Der IRQ-Anschluss wird nicht gebraucht, die Erweiterung fragt den Chip ab.

Kurze Leitungen helfen (bis etwa 15 cm), am besten mit einer zusätzlichen Masseleitung. Die Pinbeschriftung der Platinen unterscheidet sich: Prüfe die Beschriftung auf deiner, besonders bei 5V und 3.3V. Die ganze Leiste zeigt der Anhang [GPIO-Belegung](../anhang/gpio.md).

## SPI einschalten

Der SPI-Anschluss ist bei einer frischen Box aus. Am einfachsten schaltest du ihn in der App ein: Auf der Unterseite **NFC-Reader** hat die Karte **Anschlüsse**, direkt unter dem Text der Seite, den Block **SPI**. Ist **SPI** **Ausgeschaltet**, tippst du rechts neben dem **Zustand** auf **SPI einschalten** und bestätigst; ist es **Eingeschaltet**, steht dort **SPI ausschalten**. Nach dem Einschalten die Box **neu starten**: Dann zeigt der **Zustand** **Eingeschaltet** und das **Gerät** `/dev/spidev0.0`.

Von Hand geht es auch:

- in `dietpi-config` unter **Advanced Options › SPI state**, oder
- die Zeile `dtparam=spi=on` in die `config.txt` eintragen (`/boot/firmware/config.txt`; ältere Systeme: `/boot/config.txt`).

Auch dann die Box **neu starten**.

## Einstellen

Auf der Unterseite **NFC-Reader** bei **Typ** den **PN5180** wählen (siehe [Leser hinzufügen](nfc-leser.md)):

| Einstellung | Wirkung |
| --- | --- |
| **NSS an** | **CE0** (Pin 24, Standard) oder **CE1** (Pin 26), je nachdem, wo NSS hängt |
| **GPIO-Pin BUSY** | der Pin, an dem BUSY hängt (Vorschlag GPIO 25) |
| **GPIO-Pin RST** | der Pin, an dem RST hängt (Vorschlag GPIO 23) |
| **Erkennen** | **Beide** (Standard), nur **ISO 14443 A** oder nur **ISO 15693** |

Danach zeigt der **Zustand** **Bereit** und **Firmware PN5180 4.0** (die Versionsnummer kommt vom Chip). Antwortet er nicht, steht der Grund unter **Hinweis** (siehe die Tabelle auf der Seite [Leser hinzufügen](nfc-leser.md)).
