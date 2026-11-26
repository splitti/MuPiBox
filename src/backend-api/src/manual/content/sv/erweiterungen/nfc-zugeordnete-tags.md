# NFC: tilldelade taggar

Undersidan **Tilldelade taggar** (**Inställningar › NFC-tillägg › Tilldelade taggar**) visar alla taggar som har ett media. Nya taggar kommer till från biblioteket (se [Koppla en tagg till ett album](nfc-tag-zuordnen.md)); den här sidan hanterar dem.

![Sidan Tilldelade taggar](nfc-tags-page.png)

## Rutorna

Varje tagg är en ruta. På mobilen (upp till 575 pixlars bredd) står en ruta i varje rad, från 576 pixlar två, från 1000 pixlar tre bredvid varandra.

![Tre rutor bredvid varandra](nfc-tags-page-wide.png)

En ruta visar uppifrån och ned:

| Uppgift | Betydelse |
| --- | --- |
| **Titel** | mediet som taggen startar |
| **Bild** | mediets omslag eller en egen bild (se [Ändra taggens bild](nfc-bild.md)) |
| **Text** | typen (SD-kort, NAS, Spotify, radio, podd, TIDAL, Jellyfin eller Audible), taggens nummer (UID, till exempel `04:A1:B2:C3:D4:E5:F6`; vid en USB-läsare kortnumret, som läsaren skriver det) och **Flex-tagg** om taggen är flex-taggen |
| **Knappar** | fem symboler, se nedan |

De nyaste taggarna står överst.

## De fem knapparna

Från vänster till höger:

| Symbol | Verkan |
| --- | --- |
| Bild | **Byt bild**: välj en egen bild för taggen, eller lämna i samma fönster med **Använd mediets omslag** den egna bilden igen, se [Ändra taggens bild](nfc-bild.md) |
| Spela | **Spela album**: startar taggens media, som om du hade lagt på taggen |
| Pilar | **Ändra tagg**: taggen får ett annat album, se nedan |
| Display | **OLED-bild**: en egen bild för OLED-displayen som visas när den här taggen spelas i stället för förloppsfältet och tiden, exakt 128 × 50 punkter, 1 bit, se [OLED-display](oled.md). Har taggen redan en visar ett fönster den först, som den ser ut på displayen, och frågar om du vill **ändra** eller **ta bort** den. Knappen finns bara med OLED-tillägget |
| Papperskorg | **Ta bort**: tar taggen ur listan, efter en kontrollfråga. En borttagen tagg räknas vid nästa påläggning åter som ny och spelar ingenting |

En tagg som du lägger på men som inte har något media står inte i listan. Den spelar ingenting.

## Spelaren längst ned

Längst ned på sidan står, alltid synlig, en liten spelare. Den visar vad boxen spelar just nu och styr det:

- **Tillbaka**, **Spela/Paus** och **Framåt**,
- omslaget och titeln,
- tiden och ett fält som visar hur långt mediet har kommit,
- **volymen** (med boxens hörselskydd).

Trycker du vid en ruta på **Spela album** visar spelaren efter en, två sekunder det nya mediet. Spelas redan något ersätts det. Spelaren visar också vad en pålagd tagg eller ett tryck på displayen startar.

## Ändra tagg

Med **Ändra tagg** får taggen ett annat album utan att du behöver lägga på den:

1. Tryck på rutan på **Ändra tagg**. Appen byter till **biblioteket**; längst ned står ett meddelande (med **Avbryt**).
2. Öppna där albumet, kanalen eller podden som taggen framöver ska starta.
3. Under knappen **NFC-tagg** står nu **Tilldela taggen till detta album**. Tryck på den.

Appen går tillbaka till **Tilldelade taggar**; rutan visar det nya mediet. En egen bild på taggen försvinner då (taggen visar det nya mediets omslag), flex-taggen förblir flex-taggen.

![Biblioteket väntar på det nya albumet](nfc-change-library.png)

![Albumet med knappen ”Tilldela taggen till detta album”](nfc-change-sheet.png)

## När den tas bort

Under listan står inställningen **När den tas bort**: **Pausa** (standard), **Stoppa** eller **Fortsätt spela**. Bara en tagg som har ett media utlöser det, och bara så länge det den startade fortfarande pågår: Har barnet under tiden valt något annat på displayen fortsätter det.

Med **Pausa** fortsätter en ljudbok där den var om samma tagg läggs på igen inom en halvtimme. Vid en annan tagg startar dess media som vid ett tryck på rutan. Läggs en tagg på igen medan dess media fortfarande spelas (vid USB-läsaren vid varje framhållning) spelar det bara vidare och börjar inte om. Läggs en tagg med **Pausa** eller **Stoppa** bara kort på och tas bort igen innan uppspelningen börjar startar ingenting.

En **USB-läsare** rapporterar bara påläggningen, aldrig borttagningen. För den verkar **När den tas bort** inte; uppspelningen går bara vidare.

## Var tilldelningarna finns

Tilldelningarna finns i `tags.json` i tilläggets datamapp (`~/.mupibox/data/extensions/data/nfc/`) och bevaras vid uppdateringar. Dessutom skriver tillägget dem vid varje ändring i en egen fil, **`tag-assignments.json`**, i samma mapp (se nedan). Vid starten går boxen via **displayen** (så räknas rutornas tider, speltid och ”Fortsätt” som vid ett tryck); utan körande display startar alltså en tagg ingenting.

## Säkerhetskopia, export och import

Vilken tagg som startar vilket media går inte förlorat om en fil går sönder:

- Tilldelningen står i en fil för sig, **`tag-assignments.json`**, i tilläggets datamapp. Den skrivs om vid varje ändring. Versionen innan blir kvar som `tag-assignments.json.bak`, dessutom en kopia per dag (versionen före dagens första ändring) i mappen `backup/`, i sju dagar.
- Filen ingår i **boxens säkerhetskopia** (**Inställningar › System › Säkerhetskopia**) och kommer tillbaka vid återställning. Vid nästa start av tillägget tar det över tilldelningen ur filen om den skiljer sig från den som är noterad. Är `tags.json` förlorad eller skadad hämtar det tilldelningen likaså ur filen (eller dess kopia).
- Under listan står bredvid varandra knapparna **Exportera taggar** och **Importera taggar**. Med **Exportera taggar** sparar du listan över taggar med deras media som en **tabell** (`mupibox-nfc-tags-ÅÅÅÅ-MM-DD.csv`) på enheten där du har öppnat appen; Excel (och LibreOffice) öppnar den med ett dubbelklick. Med **Importera taggar** väljer du en sådan tabell (även från en annan box eller skriven av dig). Nya taggar läggs till; en tagg som boxen redan känner får mediet ur tabellen. Det som inte står i tabellen förblir oförändrat. Rader som inte går att spela hoppas över. I stället för tabellen tar importen också en JSON-fil.

### Tabellen

En rad per tagg, kolumnerna (åtskilda med semikolon):

| Kolumn | Innehåll |
| --- | --- |
| **UID** | taggens nummer, till exempel `04:A1:B2:C3` |
| **Titel**, **Artist**, **Kategori** | som i biblioteket |
| **Typ** | `library` (bibliotek/SD-kort), `nas`, `spotify`, `radio`, `rss` (podd) eller `tidal` |
| **Adress** | mappen (`library`), sökvägen på NAS, Spotify-ID:t, adressen till kanalen eller podden |
| **Flex-tagg** | `ja` vid flex-taggen |
| **Bild**, **Omslag** | taggens bilder |
| **Media (tekniskt)** | hela mediet; står det något här gäller det, och kolumnerna före är bara till för läsning |

En tabell för hand går också: Kolumnerna **UID**, **Typ**, **Titel** och **Adress** räcker (lämna kolumnen **Media (tekniskt)** tom eller utelämna den). Kolumnnamnen får också vara engelska (`uid`, `type`, `title`, `address`), och i stället för semikolon går komma eller tabb.

Tabellen innehåller bara taggar som har ett media, inte när och hur ofta de lades på. Medierna hittas via sin sökväg eller adress: På en annan box fungerar taggarna alltså bara om samma album ligger där under samma sökväg eller om det är kanaler, poddar och Spotify-poster.
