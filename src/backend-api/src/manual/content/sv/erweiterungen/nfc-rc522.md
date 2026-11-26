# NFC: ansluta RC522

**RC522** (MFRC522) är det lilla blå kortet. Det läser **ISO 14443 A**, inte ISO 15693. Det arbetar med **3,3 V**, **aldrig med 5 V**. Det sitter på **SPI-anslutningen** på Raspberry Pi; SPI måste vara påslaget (se [Ansluta PN5180](nfc-pn5180.md), avsnittet **Slå på SPI**: blocket **SPI** på kortet **Anslutningar** på sidan **NFC-läsare**).

## Koppling

Koppla med boxen avstängd.

![Koppling av RC522 på Raspberry Pi](wiring-rc522.svg)

| RC522 | Raspberry Pi | Stift på stiftlisten |
| --- | --- | --- |
| 3.3V | 3,3 V | 1 |
| GND | Jord | 6 |
| SCK | GPIO 11 (SPI SCLK) | 23 |
| MOSI | GPIO 10 (SPI MOSI) | 19 |
| MISO | GPIO 9 (SPI MISO) | 21 |
| SDA (= NSS) | GPIO 8 (SPI CE0) | 24 |
| RST | ett ledigt stift, till exempel GPIO 25 | 22 |
| IRQ | lämna fri | – |

**RST-stiftet** är frivilligt: Utan stift återställer tillägget chippet via dess mjukvaruåterställning.

Korta ledningar hjälper (upp till ungefär 15 cm). Stiftmärkningen på korten skiljer sig åt: kontrollera den på ditt. Hela listen visar bilagan [GPIO-belägging](../anhang/gpio.md).

## Ställa in

På undersidan **NFC-läsare** väljer du **RC522** vid **Typ** (se [Lägga till läsare](nfc-leser.md)):

| Inställning | Verkan |
| --- | --- |
| **NSS på** | **CE0** (stift 24, standard) eller **CE1** (stift 26), beroende på var SDA sitter |
| **GPIO-pin RST** | stiftet som RST sitter på; får vara fritt |

RC522 har inget val av tagg-typ och inga BUSY-stift; sidan visar dem inte för RC522. **Status** visar **Redo** och vid **Chip** versionen av RC522.
