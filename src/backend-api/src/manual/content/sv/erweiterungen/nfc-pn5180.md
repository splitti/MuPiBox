# NFC: ansluta PN5180

**PN5180** (NXP) läser båda världarna: **ISO 14443 A** (NTAG, MIFARE och de flesta kort och klistermärken) och **ISO 15693** (ICODE, SLIX). Det sitter på **SPI-anslutningen** på Raspberry Pi.

## Koppling

Koppla med boxen avstängd. PN5180 behöver **båda** matningarna: **5 V** för antennens sändsteg och **3,3 V** för logiken. Signalerna är 3,3 V, nivåväxlare behövs inte.

![Koppling av PN5180 på Raspberry Pi](wiring-pn5180.svg)

| PN5180 | Raspberry Pi | Stift på stiftlisten |
| --- | --- | --- |
| 5V | 5 V | 2 |
| 3.3V | 3,3 V | 1 |
| GND | Jord | 6 |
| SCK | GPIO 11 (SPI SCLK) | 23 |
| MOSI | GPIO 10 (SPI MOSI) | 19 |
| MISO | GPIO 9 (SPI MISO) | 21 |
| NSS | GPIO 8 (SPI CE0) | 24 |
| BUSY | GPIO 25 (förslag) | 22 |
| RST | GPIO 23 (förslag) | 16 |
| IRQ, GPIO, AUX, REQ | lämna fria | – |

Stiften **SCK, MOSI, MISO och NSS** är fasta på SPI-anslutningen. **BUSY och RST** väljer du själv i inställningarna; GPIO 25 och GPIO 23 är lediga på de flesta boxar, och valet spärrar stift som redan är upptagna. PN5180 meddelar via BUSY när det är redo, utan BUSY går det inte. IRQ-anslutningen behövs inte, tillägget frågar av chippet.

Korta ledningar hjälper (upp till ungefär 15 cm), helst med en extra jordledning. Stiftmärkningen på korten skiljer sig åt: kontrollera märkningen på ditt, särskilt vid 5V och 3.3V. Hela listen visar bilagan [GPIO-belägging](../anhang/gpio.md).

## Slå på SPI

SPI-anslutningen är av på en nyinstallerad box. Enklast slår du på den i appen: På undersidan **NFC-läsare** har kortet **Anslutningar**, direkt under sidans text, blocket **SPI**. Är **SPI** **Avstängd** trycker du till höger om **Status** på **Slå på SPI** och bekräftar; är det **Påslagen** står där **Stäng av SPI**. Efter påslagningen **startar du om** boxen: Då visar **Status** **Påslagen** och **Enhet** `/dev/spidev0.0`.

För hand går det också:

- i `dietpi-config` under **Advanced Options › SPI state**, eller
- skriv in raden `dtparam=spi=on` i `config.txt` (`/boot/firmware/config.txt`; äldre system: `/boot/config.txt`).

Även då ska du **starta om** boxen.

## Ställa in

På undersidan **NFC-läsare** väljer du **PN5180** vid **Typ** (se [Lägga till läsare](nfc-leser.md)):

| Inställning | Verkan |
| --- | --- |
| **NSS på** | **CE0** (stift 24, standard) eller **CE1** (stift 26), beroende på var NSS sitter |
| **GPIO-pin BUSY** | stiftet som BUSY sitter på (förslag GPIO 25) |
| **GPIO-pin RST** | stiftet som RST sitter på (förslag GPIO 23) |
| **Identifiera** | **Båda** (standard), bara **ISO 14443 A** eller bara **ISO 15693** |

Därefter visar **Status** **Redo** och **Firmware PN5180 4.0** (versionsnumret kommer från chippet). Svarar det inte står orsaken under **Obs** (se tabellen på sidan [Lägga till läsare](nfc-leser.md)).
