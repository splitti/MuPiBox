# NFC-tillägg

Tillägget **NFC-tillägg** ger boxen upp till **tre NFC-läsare**. En läsare läser **UID** på taggar och kort, både när de förs fram och när de tas bort. Varje tagg kan **starta ett album, en ljudboksmapp, en radiokanal eller en podd**; tilldelningen fungerar som hos TeddyCloud: välj media, lägg på taggen, klart.

Efter [installationen](installieren.md) står inställningarna under **Inställningar › NFC-tillägg**. Sidan har fyra undersidor:

- **NFC-läsare** ställer in läsarna: ett kort per läsare med status, typ och inställningar.
- **Tilldelade taggar** visar alla taggar med sitt media.
- **Vridratt** ställer in album-vridratten: efter att en tagg lagts på ett artistomslag väljer den albumen. Den har egna stift.
- **Talfunktion** bestämmer vad boxen säger med sin röst när något är i vägen (inget Wi-Fi, NAS går inte att nå, tagg utan media, batteriet nästan tomt).

## Handboksidorna om NFC-tillägget

| Sida | Innehåll |
| --- | --- |
| [Koppla en tagg till ett album](nfc-tag-zuordnen.md) | steg för steg: välj media, lägg på taggen, flex-tagg |
| [Ändra taggens bild](nfc-bild.md) | mediets omslag eller en egen bild |
| [Tilldelade taggar](nfc-zugeordnete-tags.md) | sidan med alla taggar som rutor (spela, ändra, ta bort) och inställningen vid borttagning |
| [Vridratt](nfc-drehregler.md) | en tagg på ett artistomslag: välj album vid påläggning, bläddra genom albumen med album-vridratten |
| [Röstmeddelanden](nfc-sprachnachrichten.md) | boxens utrop: Wi-Fi, NAS, Spotify, tagg utan media, batteri vid 10 % |
| [Lägga till läsare](nfc-leser.md) | ställa in en läsare, upp till tre samtidigt, statusen |
| [Ansluta PN5180](nfc-pn5180.md) | koppling, SPI, inställningar |
| [Ansluta RC522](nfc-rc522.md) | koppling, SPI, inställningar |
| [Ansluta PN532](nfc-pn532.md) | koppling för I2C, SPI och seriellt |
| [Ansluta USB-läsare](nfc-usb.md) | USB Reader 1 och 2, streckkodsläsare |

## Vilken läsare?

| Läsare | läser | Anslutning | Anmärkning |
| --- | --- | --- | --- |
| **PN5180** | ISO 14443 A och **ISO 15693** (NTAG, MIFARE, ICODE, SLIX) | SPI | läser båda världarna; behöver 5 V och 3,3 V |
| **RC522** | ISO 14443 A | SPI | det lilla blå kortet; bara 3,3 V |
| **PN532** | ISO 14443 A | I2C, SPI eller seriellt | anslutningen väljs med två omkopplare på kortet |
| **USB-läsare** | ISO 14443 A eller streckkoder, beroende på enhet | USB | skriver numret som ett tangentbord; bara påläggningen rapporteras |

## I korthet

1. Anslut läsaren till boxen (se läsarens sida i tabellen ovan) och slå vid SPI på anslutningen.
2. På undersidan **NFC-läsare** väljer du läsaren vid **Typ**. **Status** visar **Redo** när allt stämmer.
3. Öppna ett album i biblioteket, tryck på **NFC-tagg** och lägg på taggen. Från och med då startar taggen albumet.

Tillägget körs som ett program i bakgrunden och startar sig självt igen efter ett fel, först efter några sekunder, sedan långsammare. Meddelanden finns i boxens logg (`pm2 logs server`, rader med `[nfc]`).
