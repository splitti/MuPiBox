# OLED-display

Tillägget **OLED-display** visar på en liten OLED-display vad boxen spelar: titel, artist och album, tiden, spårnumret, volymen, Wi-Fi, batteriet i en MuPiHAT, slumpning och upprepning och utgången (högtalare, hörlurar, Bluetooth). När inget spelas visar den en bild: som standard NFC-läsaren som väntar på en tagg. Vid start, vid uppdatering, under vilotiden och vid nedstängning har den egna bilder som går att ändra. Dessutom kan boxen köras **helt utan DSI-display**; det är sedan MuPiBox 5.1 ett reglage i själva boxen (se [Utan DSI-display](ohne-dsi-display.md)).

Chippen **SSD1306**, **SH1106** och **SSD1309** stöds på **I2C-anslutningen** med **128 × 64** eller **128 × 32** pixlar, på **Raspberry Pi 4 och Pi 5**. Visningen behöver inget paket utom `python3-pil`, som tilläggets installation tar med.

Efter [installationen](installieren.md) står inställningarna under **Inställningar › OLED-display**.

## Ansluta

Displayen sitter på I2C-bussen på stiftlisten. Koppla med boxen avstängd:

| OLED | Raspberry Pi | Stift på stiftlisten |
| --- | --- | --- |
| VCC | 3,3 V | 1 |
| GND | Jord | 6 |
| SDA | GPIO 2 (I2C SDA) | 3 |
| SCL | GPIO 3 (I2C SCL) | 5 |

De flesta moduler har adressen **0x3C**; vissa går att ställa på **0x3D** med en lödbrygga. I2C-bussen kan delas med andra enheter, till exempel en PN532 eller en MuPiHAT.

Är I2C fortfarande av visar kortet **Display** blocket **I2C** som **Avstängd**. Tryck till höger om det på **Slå på I2C** och **starta om** sedan boxen.

## Visningen

![Ett album spelas: överst statusfältet, under det titel, artist och album, nederst tid och spårnummer](oled-play.png)

**Statusfältet** överst visar från vänster till höger:

| Symbol | Betydelse |
| --- | --- |
| Antenn med staplar | mottagning av Wi-Fi (utan staplar: ingen anslutning) |
| Skärm med nätverkskontakt | boxen sitter på **LAN-kabel** (symbolen står då i stället för antennen) |
| Siffra med batteri | batteriets laddning (bara med en MuPiHAT) |
| Pilar med **A** eller **1** | **Upprepa**: hela listan (A) eller ett spår (1). Knappen för upprepning i tillägget Buttons & GPIO Input växlar vidare: alla (A), ett (1), av |
| korsade pilar | **Slumpa** är på |
| Siffra och symbol till höger | volym och **utgång**: högtalare, hörlurar eller Bluetooth |

Under står **titel**, **artist** och **album**; en lång rad rullar av sig själv (eller inte: se **För långa texter** nedan). En **stream** (en radiokanal som aldrig tar slut) får inget förloppsfält, även om spelaren rapporterar en längd; en **podd** har det, även över taggens bild (i **Mix**, **Kompakt** och på displayen med 128 × 32 punkter, överst som en tunn linje). Titeln på ett poddavsnitt (och namnet på en radiokanal) står vid behov över **tre rader** och bryts mellan orden; det som inte ryms på den tredje raden rullar där. I stället för ”Track” står i visningen **Full** nere till höger **”Folge: 12/123”**, i **Mix** i mitten av statusfältet bara avsnittets nummer (”12”). Det är avsnittets plats i poddens lista, som boxen visar den (så länge den inte är känd förblir fältet tomt); en podd visar ingen klocka, en radiokanal däremot visar på den platsen **klockan** (”14:35”; i **Kompakt** visar ingen av dem något där). Nere till vänster visar en triangel att boxen spelar (två staplar: pausad), bredvid **tiden** (inte vid en radiostream: hur länge den har gått säger inget), nere till höger **spårnumret** (”Track:3/12”).

![Tiden går baklänges, utgången är Bluetooth](oled-play-bt.png)

När inget spelas visar displayen bilden som är vald under **Visning i vila**: **NFC-läsaren** (en hand med kort: boxen väntar på en tagg), **streckkodsläsaren**, **klockan** med datumet (det är standardinställningen; veckodagen på boxens språk, som du väljer under **Inställningar › System › Språk**; utan val tyska) eller en **egen bild**; efter den inställda tiden slocknar den.

![Klockan i vila](oled-idle.png)

En kort bild visas när uppspelningen startar eller pausar och när volymen ändras. Bilden för volymen går att stänga av med **Visa volymanimation**, bilden för start och paus med **Visa spela/paus-animation**. Med **Visa boxens IP-adress som QR-kod** visas i tio sekunder en **QR-kod** med boxens IP-adress och inget annat. Mobilen skannar den och öppnar boxen i webbläsaren. Samma åtgärd går också att ge en knapp, en dubbelknapp eller vridratten ([Buttons & GPIO Input](buttons.md), [Vridratt och knapp](../hardware/drehregler.md)). Har boxen ingen nätverksadress visar visningen i stället **nätverkssidan** med Wi-Fi-namn, adress och version.

![QR-koden med boxens adress](oled-info.png)

Väljer **vridratten** med NFC-tillägget ett album ([NFC: vridratt](nfc-drehregler.md)) står i informationen **namnet** som den står på just nu, med dess plats i listan. Efter valet kommer den normala visningen tillbaka.

## Inställningar

Inställningarna står i kort: **Display** (chip, storlek, adress, rotation), **Visning**, **Ljusstyrka & avstängning** (ljusstyrka, display av efter), **Mörkare på kvällen**, **Bilder** och **Utan DSI-display**.

| Inställning | Verkan |
| --- | --- |
| **Chip** | **SSD1306** (nästan alla 0,96-tumsmoduler), **SH1106** (oftast 1,3 tum) eller **SSD1309**. Visar bilden en förskjutning eller remsor i kanten, välj det andra chippet |
| **Storlek** | **128 × 64** eller **128 × 32** |
| **I2C-adress** | **0x3C** eller **0x3D** |
| **Vrid 180°** | om displayen sitter upp och ned |
| **Visning vid spelning** | **Full** (bilden ovan), **Mix** (spårnumret stort) eller **Kompakt** (tiden stor). En knapp eller dubbelknapp kan med **Växla OLED-visning (Full / Mix / Kompakt)** gå vidare till nästa visning ([Buttons & GPIO Input](buttons.md)); det gäller tills nästa sparning |
| **Visning i vila** (kortet **Bilder**) | vad displayen visar så länge inget spelas: **NFC-läsare**, **Streckkodsläsare**, **Klocka** (standard) eller **Egen bild** |
| **Visa volymanimation** | den korta bilden vid ändring av volymen; avstängt förblir visningen som den är |
| **Visa spela/paus-animation** | den korta bilden med spela eller paus när uppspelningen startar och stoppas; avstängt förblir visningen som den är |
| **Visa podd och radio** | Vid en podd eller radiokanal: **Bild, om en finns** ([taggens bild](#taggens-bild), så länge taggen har startat mediet) eller alltid **Titel och klockslag**: titeln över upp till tre rader, vid en podd med avsnittet (”Folge: 12/123”), vid en radiokanal med **klockan** på samma ställe. Har taggen ingen bild står även vid ”Bild” titeln. Gäller för alla tre visningarna (Full, Mix, Kompakt); album och ljudböcker visar alltid sin taggbild |
| **Visa tid** | **Förfluten** (räknar uppåt från början) eller **Återstående** (räknar med ett minus ned till slutet); vid en kanal eller podd utan känd längd räknar den uppåt. Över en timme fortsätter minuterna räknas (”62:05”) till **99:59**; allt därutöver, förflutet som återstående, står som **”>99:59”** |
| **För långa texter** | **Rulla om och om igen** (standard), **Rulla en gång** (raden rullar en gång hela vägen och står därefter med ”…” på slutet) eller **Rulla inte** (raden kortas med ”…”) |
| **Ljusstyrka** | 1 till 255 |
| **Mörkare på kvällen** | OLED-displayen blir mörkare på kvällen och åter normalt ljus på morgonen. Tiderna är de för ”Mörkare på kvällen” i displayens inställningar (fasta klockslag eller solnedgång till soluppgång, mjuk nedtoning, vilotider); om boxens egen display tonas ned är oberoende av det. Kortet **Mörkare på kvällen** visar också de tiderna: solnedgång, ort, klockslag, nedtoning och vilotider som du ändrar här gäller även för boxens display |
| **Ljusstyrka på kvällen** | 1 till 255, med reglaget eller inskrivet direkt i fältet; aldrig ljusare än den normala ljusstyrkan |
| **Display av efter** | **Aldrig**, 1, 5, 15 minuter eller 1 timme, när inget spelas |
| **Utan DSI-display** | visar bara vad boxen gör; reglaget står under **Inställningar › Display** (se [Utan DSI-display](ohne-dsi-display.md)) |

Knappen **Visa boxens IP-adress som QR-kod** provar QR-koden. En ändring av chip, storlek, adress och rotation startar om displayen; de andra gäller direkt.

Displayen på **128 × 32** visar titel, artist, tid, volym och Wi-Fi i en visning.

## Bilder

Kortet **Bilder** visar displayens bilder och var de visas. Alla är **128 × 64** punkter, vitt på svart.

| Bild | När den visas | Går att ändra |
| --- | --- | --- |
| **Startbild** (MuPiBox-logotypen) | vid uppstart, så snart visningen startar, tills boxen är redo (högst två minuter) | ja |
| **Vila: NFC-läsare** | i vila, när **Visning i vila** står på **NFC-läsare** | nej |
| **Vila: streckkodsläsare** | i vila, när **Visning i vila** står på **Streckkodsläsare** | nej |
| **Vila: egen bild** | i vila, när **Visning i vila** står på **Egen bild** (tills du väljer en blir NFC-läsaren kvar) | ja |
| **Uppdatering** | så länge en uppdatering pågår | ja |
| **Vilotid och gräns** (ett sovande ansikte) | så länge en vilotid pågår eller gränsen är nådd | ja |
| **Nedstängning** (på/av-symbolen) | så snart boxen stängs ned | nej |

Varje bild har en knapp **Visa bild**: Bilden står då **tio sekunder** på displayen, därefter visar den åter det som syntes förut. Så ser du en bild utan att anledningen inträffar.

Vid en bild som går att ändra trycker du på **Byt bild** och väljer en bild från enheten. Boxen tar **bara bilder som är exakt 128 × 64 punkter stora och bara består av rent svart och vitt (1 bit)**; vitt lyser. Appen kontrollerar det direkt vid valet, boxen en gång till. En bild med annan storlek, gråskalor, färger eller genomskinliga ställen **avvisas**, ingenting förminskas eller omvandlas. Gör bilden klar i förväg i ett grafikprogram (storlek 128 × 64, läge ”svartvitt” utan dithering eller med, som du vill). Med **Återställ** kommer originalet tillbaka.

### Taggens bild

Varje NFC-tagg kan få en egen bild som står på displayen så länge **den här taggens media** spelas (ett album, en stream, en podd, vad taggen än startar). Den ersätter förloppsfältet och den stora tiden (i **Full** statusfältet och raderna med titel och artist); de översta 50 punkterna tillhör bilden, statusfältet (Mix) respektive Wi-Fi-symbolen och PAUS (Kompakt) blir kvar. Vid en radiokanal står i **Full** och **Mix** **klockan** där annars spårnumret står; vid en podd avsnittet. Även i **Full** står bilden överst; under den blir raden med spelsymbol och tid kvar. På en display med 128 × 32 punkter visas den inte. Vid en podd eller radiokanal går det med **Visa podd och radio** (Inställningar › OLED-display › Visning) att välja om bilden eller titeln med klockan visas.

Bilden väljer du i **Inställningar › NFC-tillägg › Tilldelade taggar** med knappen **OLED-bild** på taggens ruta (knappen står bara där om OLED-tillägget är installerat), se [Tilldelade taggar](nfc-zugeordnete-tags.md). Boxen tar **bara bilder som är exakt 128 × 50 punkter stora och bara består av rent svart och vitt (1 bit)**; vitt lyser. Allt annat avvisas som vid de andra bilderna. Har taggen redan en bild visar samma fönster den först och frågar om du vill ändra den eller **ta bort** den; tas taggen bort försvinner dess bild med. Bilden kommer bara om taggen har startat mediet: Väljer barnet därefter något annat på displayen är den normala bilden tillbaka. Taggarnas bilder ingår inte i exporten av taggslistan.

Uppdaterings- och nedstängningsbilden ritar boxen själv på displayen, även när servern redan står stilla. Startbilden visas så snart visningen har startat; en bild före det, medan Linux fortfarande startar, är inte möjlig.

## Om displayen förblir mörk

Raden **Display** på kortet säger vad som saknas:

| Meddelande | Vad du gör |
| --- | --- |
| **I2C är av: slå på, starta sedan om** | tryck på **Slå på I2C**, starta om boxen |
| **Ingen åtkomst till I2C-bussen** | starta om boxen en gång (regeln för åtkomsten blir då aktiv) |
| **Svarar inte: kontrollera anslutning och adress** | kontrollera kopplingen, prova **I2C-adressen** och **chippet** |
| **Paketet python3-pil saknas** | installera tillägget om (det hämtar paketet) |

> [!NOTE]
> Programmet för displayen är en egen implementation: Visningen är utformad efter projektet [oled_phoniebox](https://github.com/splitti/oled_phoniebox), men använder ingen kod därifrån. Den skriver direkt på I2C-bussen och behöver varken `luma.oled` eller `RPi.GPIO`; den körs därför likadant på Pi 4 och Pi 5.
