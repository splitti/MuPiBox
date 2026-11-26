# NFC: lägga till läsare

Läsarna ställer du in på undersidan **NFC-läsare** (**Inställningar › NFC-tillägg › NFC-läsare**). Upp till **tre läsare** arbetar bredvid varandra, till exempel en PN5180 på SPI-anslutningen och en USB-läsare.

## Den första läsaren

Sidan börjar med ett kort som förklarar sidan. Under det följer kortet **Anslutningar** (se nedan) och kortet **Läsare 1**. **Läsare 1** har:

- kortet **Status**: om läsaren körs (se nedan),
- **Typ**: **Ingen läsare** (standard), **PN5180**, **RC522**, **PN532**, **USB Reader 1** eller **USB Reader 2**,
- därunder bara de inställningar som hör till den här typen.

![Sidan NFC-läsare med Läsare 1](nfc-reader-page.png)

Anslut läsaren (se läsarnas sidor nedan), välj **Typ** och ställ in det som typen kräver. Varje ändring verkar direkt, en omstart av boxen behövs inte (utom när du först måste slå på SPI, I2C eller den seriella porten).

| Inställning | Verkan |
| --- | --- |
| **Typ** | läsaren som arbetar på den här platsen |
| **NSS på** | chipvalet som NSS sitter på: **CE0** (stift 24, standard) eller **CE1** (stift 26) |
| **GPIO-pin BUSY**, **GPIO-pin RST** | stiften för de två ledningarna; två olika |
| **Identifiera** | bara PN5180: **Båda** (standard), bara **ISO 14443 A** eller bara **ISO 15693** |
| **PN532-anslutning**, **Seriellt gränssnitt** | bara PN532: I2C (standard), SPI eller seriellt, och vid seriellt gränssnittet |

## Slå på och av SPI, I2C och seriellt

Boxens anslutningar som läsarna pratar över är av på en nyinstallerad box. Kortet **Anslutningar** under sidans text har ett block för **SPI**, **I2C** och **Seriell (UART)**. Varje block visar på raden **Status** om anslutningen är på, och **till höger om det** en knapp: Är anslutningen **Påslagen** heter knappen **Stäng av SPI** (**Stäng av I2C**, **Stäng av seriell**), är den **Avstängd** heter den **Slå på SPI** (**Slå på I2C**, **Slå på seriell**). Efter en kontrollfråga ändrar boxen raden i konfigurationen; därefter **startar du om** boxen. En USB-läsare behöver ingen av dessa anslutningar.

| Block | Vem som behöver det | Påslagning skriver in | Avstängning skriver in | Enheten |
| --- | --- | --- | --- | --- |
| **SPI** | PN5180, RC522 och en PN532 på SPI | `dtparam=spi=on` i `config.txt` | `dtparam=spi=off` | `/dev/spidev0.0` |
| **I2C** | en PN532 på I2C | `dtparam=i2c_arm=on` i `config.txt` och `i2c-dev` i `/etc/modules` | `dtparam=i2c_arm=off` | `/dev/i2c-1` |
| **Seriell (UART)** | en PN532 på den seriella anslutningen | `enable_uart=1` i `config.txt`, och konsolen på porten stängs av | `enable_uart=0` | `/dev/serial0` |

**Status** säger **Påslagen**, **Avstängd** eller, så länge boxen inte har startats om efter en ändring, **Påslaget, boxen måste startas om** och **Avstängt, boxen måste startas om**. Raden **Enhet** nämner enhetsfilen, om det finns en. Blocket **Seriell (UART)** har dessutom raden **Systemkonsol**. Det är systemets textåtkomst (inloggning via kabel), som som standard körs på den seriella porten. Står där **På, blockerar porten för PN532** använder systemet själv porten, och en PN532 fungerar inte. Knappen **Stäng av konsolen** vid den raden stänger av konsolen. Stäng inte av I2C om något annat behöver det, till exempel en MuPiHAT. Detaljerna står på läsarnas sidor, till exempel [Ansluta PN5180](nfc-pn5180.md) och [Ansluta PN532](nfc-pn532.md).

## Lägga till en läsare till

Med knappen **+ Läsare** under det sista kortet kommer **Läsare 2** till, därefter **Läsare 3**. Varje läsare står i ett **eget kort** med egen **status** och egen **typ**.

![Sidan NFC-läsare med Läsare 1 och Läsare 2](nfc-reader-page-2.png)

1. Tryck på **+ Läsare**. Det nya kortet visas och står först på **Ingen läsare**.
2. Anslut den nya läsaren och välj vid **Typ**.
3. Kortets **Status** visar **Redo** så snart läsaren körs.

Papperskorgssymbolen överst i kortet för **Läsare 2** eller **Läsare 3** tar bort läsaren igen; dess stift är därefter lediga och den körs inte längre. När alla tre läsare finns försvinner knappen **+ Läsare**.

## Läsarna får inte komma i vägen för varandra

Varje läsare behöver sin **egen anslutning**:

- En **SPI-enhet** (**CE0** eller **CE1**) hör till en läsare, även om det är en annan typ: PN5180 och RC522 på CE0 samtidigt går inte, en RC522 på CE1 bredvid går.
- **PN532** på **I2C** upptar I2C-bussen, på **SPI** en SPI-enhet, på den **seriella** anslutningen det valda gränssnittet.
- **USB Reader 1** och **USB Reader 2** är två olika enheter och kommer inte i vägen för varandra. Två läsare med samma typ (två gånger **USB Reader 1**) vill ha samma enhet.
- **Stift** (BUSY, RST) går bara att tilldela en gång; valet spärrar upptagna stift.

En läsare som skulle bråka med en tidigare läsare om samma anslutning startar inte och meddelar **Den här läsaren behöver samma anslutning som en annan** (se **Status**). Den tidigare läsaren fortsätter köra.

En tagg räknas lika vid varje läsare: Vilket media den startar beror bara på dess nummer. Samma kort har dock ett annat nummer vid en USB-läsare än vid en PN5180: Taggar är **inte** utbytbara mellan läsartyperna.

## Ansluta läsarna

| Läsare | Sida |
| --- | --- |
| **PN5180** | [Ansluta PN5180](nfc-pn5180.md) |
| **RC522** | [Ansluta RC522](nfc-rc522.md) |
| **PN532** | [Ansluta PN532](nfc-pn532.md) |
| **USB Reader 1**, **USB Reader 2** | [Ansluta USB-läsare](nfc-usb.md) |

## Status

Kortet **Status** för varje läsare visar hur långt den har kommit och uppdaterar sig själv:

| Visning | Betydelse |
| --- | --- |
| **Läsare: Av** | ingen läsare vald |
| **Redo**, **Firmware PN5180 4.0** | chippet svarar; versionsnumret kommer från chippet självt. Koppling och SPI stämmer |
| **Enhet** | vid en USB-läsare: dess namn (till exempel ”Tera 5100 dongle”) |
| **Tagg i fältet** | en tagg ligger just nu på läsaren (inte vid USB-läsare) |
| **Senaste tagg** | UID (till exempel `04:A1:B2:C3:D4:E5:F6`) och taggens typ |

Är läsaren inte redo står under **Obs** vad som ska kontrolleras:

| Obs | Vad du gör |
| --- | --- |
| Välj pinnarna BUSY och RST | ställ in två olika stift |
| Den här läsaren behöver samma anslutning som en annan | välj en annan SPI-enhet, ett annat gränssnitt eller vid USB-läsare olika typer (**USB Reader 1** och **USB Reader 2**) |
| SPI är av: slå på det i kortet Anslutningar och starta om | tryck i kortet **Anslutningar** vid **SPI** på knappen **Slå på SPI** och starta om boxen (se [Ansluta PN5180](nfc-pn5180.md)) |
| I2C är av: slå på det i kortet Anslutningar och starta om | tryck i kortet **Anslutningar** vid **I2C** på knappen **Slå på I2C** och starta om boxen (se [Ansluta PN532](nfc-pn532.md)) |
| Den seriella porten saknas: slå på seriell i kortet Anslutningar och starta om | tryck i kortet **Anslutningar** vid **Seriell (UART)** på knappen **Slå på seriell** och starta om boxen (se [Ansluta PN532](nfc-pn532.md)) |
| Ingen åtkomst till SPI-bussen | installera tillägget om, det lägger till åtkomstregeln för `/dev/spidev` |
| Paketen python3-spidev och python3-lgpio saknas | installera tillägget om (det laddar ner paketen) |
| Pinnarna BUSY och RST går inte att använda | ett annat program har stiftet; välj ett annat |
| BUSY reagerar inte: kontrollera BUSY, RST och strömförsörjningen | kontrollera BUSY och RST och båda matningarna (5 V och 3,3 V) |
| Läsaren svarar inte: kontrollera MISO, MOSI, SCK, NSS och strömförsörjningen | kontrollera ledningarna och jorden, och om läsaren har båda matningarna |
| Ingen USB-läsare hittades: anslut den eller välj en annan USB-läsare i menyn Typ | sätt i läsaren, eller välj vid **Typ** den andra USB Reader |
