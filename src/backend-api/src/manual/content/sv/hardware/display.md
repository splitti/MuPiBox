# Display

**Inställningar › Display & manövrering › Display**

## Displaymodell

En display på flatkabel (DSI) anger inte vad den är. Därför väljer du här vilken som är ansluten. På en box som redan visar en bild är den passande modellen förvald.

| Modell | Anmärkning |
| --- | --- |
| **Officiell 7″ (1:a generationen)** | 800 × 480, även för en display på HDMI-anslutningen eller helt utan display – så körs de hittillsvarande boxarna |
| **Touch Display 2** | från Raspberry Pi, välj storlek 5″, 7″ eller 10″ – testad på en MuPiBox (7″) |
| **Waveshare 5″ DSI** / **Waveshare 4,3″ DSI** | båda 800 × 480 |
| **Waveshare DSI 7″ till 12,3″** | välj den exakta modellen, den står på baksidan eller förpackningen. ”DSI LCD” och ”DSI-TOUCH” är olika konstruktioner, även vid samma storlek |
| **EDATEC DSI 7″ eller 10″** | välj storlek |
| **Egen inställning** | Appen rör inte `config.txt` – för displayer som du har ställt in själv |

Med **Använd och starta om** visar appen först vad som ändras och startar efter **Byt** om boxen med den nya modellen. Ett fönster i appen väntar ut omstarten – du behöver inte ladda om något – och frågar sedan av sig själv, liksom displayen: **Ser du en bild?** Öppnar du appen under testet (även på en annan enhet) kommer den här frågan genast. Trycker du på displayen på **Behåll** eller i appen på **Ja, behåll** blir modellen kvar. Kommer inget svar inom **3 minuter** – till exempel för att displayen förblir mörk – ställer boxen tillbaka den tidigare displayen och startar om en gång till. Med **Nej, tillbaka** går det direkt. De 3 minuterna börjar från det ögonblick då appen når boxen efter omstarten – vid svagt Wi-Fi kan det ta en stund. Senast 6 minuter efter start går boxen ändå tillbaka, även om appen kommer först senare. Då blir mindre än 3 minuter kvar. Öppnar ingen appen väntar boxen de 6 minuterna.

**Touch Display 2** är byggd för stående format. Väljer du den här startar boxen den genast liggande (**90°**, bild och beröring). Står den upp och ner i ditt hölje, välj under [Vridning](#vridning) **270°**.

> [!NOTE]
> Förblir displayen mörk även med rätt modell, kontrollera strömförsörjningen: de flesta DSI-displayer får sina 5 V inte via flatkabeln utan via en egen kabel (på MuPiHAT till **J2**, överst 5V, under den GND). Utom den officiella 7″ använder alla modeller drivrutinerna från Raspberry Pi-kärnan.

## Ljusstyrka och display av

| Inställning | Område |
| --- | --- |
| **Ljusstyrka** | 5 till 100 % |
| **Display av efter** | 0 till 120 minuter i steg, **0 = aldrig** (efter installationen 10 minuter) |

Båda gäller direkt. Går din display inte att dämpa är reglaget **Ljusstyrka** låst.

Displayen slocknar efter den inställda tiden utan manövrering, själva boxen fortsätter köra. Ett tryck på skärmen väcker den igen.

## Mörkare på kvällen

Med **Mörkare på kvällen** blir displayen mörkare på kvällen och på morgonen normalt ljus igen:

- **Anpassa efter solnedgången**: displayen blir mörkare så fort solen går ned, och på morgonen vid soluppgången normalt ljus igen. Fälten **Från** och **Till** försvinner då. För det talar du om för boxen var den står (**Välj plats**): sök plats, ta **den här enhetens position** (bara om webbappen är öppnad via en säker adress, alltså `https://`) eller **Ange koordinater** (latitud och longitud, ungefär 52.52 och 13.40 för Berlin). Boxen räknar ut solnedgången själv och visar dig dagens; den behöver inget internet för det. Bara för platssökningen går det skrivna ortnamnet till Open-Meteo, inget annat. Går solen inte upp eller ned en dag (midnattssol eller polarnatt), och så länge ingen plats är vald, gäller **Från** och **Till**; fälten dyker då upp igen.
- **Från** och **Till**: klockslagen,
- **Ljusstyrka på kvällen**: 5 till 100 %, aldrig ljusare än den normala ljusstyrkan,
- **Dämpa mjukt över**: direkt eller över 15, 30 eller 60 minuter,
- **Även under vilotider**: mörkare även under en vilotid som ligger utanför klockslagen.

## Vridning

Står displayen upp och ner eller på tvären vrider du bilden. Vad du ser för det beror på displaymodellen:

- **Officiell 7″ (1:a generationen):** För en **display på HDMI-anslutningen** väljer du 90°, 180°, 270°, spegla horisontellt eller vertikalt. För en **display på flatkabel (DSI/LCD)** finns (hopfällt) **LCD-vridning** och **Display-LCD-vridning**, var och en av eller 180°. Vridningen gäller efter en omstart av boxen.
- **Alla andra modeller:** rutorna **0°**, **90°**, **180°** och **270°** samt **Spegla ↔** (vänster–höger) och **Spegla ↕** (upp–ned) – vridet eller speglat, inte båda. Bild och beröring vrids respektive speglas tillsammans, vid vridning även start-, underhålls- och avstängningsbilden (speglat förblir de här bilderna som de är). Visningen startar om en kort stund, boxen inte. **Liggande** markerar de lägen där MuPiBox står rätt – många av de här displayerna är byggda för stående format (till exempel Touch Display 2), då är det 90° eller 270°, beroende på hur displayen är inbyggd. Touch Display 2 ställer boxen redan på 90° när du väljer modellen och vid en installation med den här displayen.

## Upplösning

För alla modeller utom den officiella 7″ tar boxen upplösningen från displayen själv (efter vridningen) – avsnittet **Upplösning** visas då inte.

Standard är **800 × 480** pixlar (storleken på de vanliga 7-tums pekdisplayerna). Under **Storlek** väljer du en av de vanliga storlekarna eller **Egen …** och skriver sedan in **Bredd** och **Höjd**. Med **Använd upplösningen** startar displayen om direkt.

Är upplösningen större än 800 × 480 förstorar boxen gränssnittet så att det passar: uppbyggnad och teman förblir desamma, text, symboler och omslag ritas i full skärpa. På Raspberry Pi Touch Display 2 (1280 × 720) är det 1,5 gånger. Ställ därför här in displayens verkliga upplösning. Bakgrundsbilder för temat ”custom” passar bäst i exakt den storleken ([Omslag och teman](../bedienung/cover-und-themes.md)).

## Display live

Under **Inställningar › Display & manövrering › Display live** ser du displayens aktuella bild (den uppdateras var 5:e sekund så länge sidan är öppen) och kan **fjärrstyra** displayen i webbläsaren. Är displayen av står där ”Displayen är av” med den senaste bilden och dess klockslag: en avstängd display levererar bara en svart bild. Det gäller även för Telegram (titeln kommer då utan bild, **/screen** meddelar ”Display av”), MQTT (den senaste bilden blir kvar) och Home Assistant. Fjärrstyrningen kräver VNC ([Delningar och fjärrstyrning](../netzwerk/freigaben.md)).

## Webbläsarinställningar

Displayen är en webbläsare i helskärmsläge (Chromium). Dess inställningar, till exempel GPU-stöd och cache, hittar du under **Inställningar › System › Webbläsare (Chromium)** ([System- och expertinställningar](../wartung/system.md)).

## Helt utan display

En box utan bildskärm, till exempel bara med NFC-taggar och knappar, startar med reglaget **Kör utan DSI-display** under **Inställningar › Display** utan kiosk och Chromium. Mer om det under [Utan DSI-display](../erweiterungen/ohne-dsi-display.md).
