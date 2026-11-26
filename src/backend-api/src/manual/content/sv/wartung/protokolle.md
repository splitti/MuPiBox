# Loggar och status

## Lådans status

**Inställningar › System › Lådans status** visar med en blick om allt är i ordning: **Lagringsutrymme**, **Temperatur**, **Strömförsörjning**, **SD-kort**, **Arbetsminne**, **Lådans tjänster**, **Internet**, **NAS**, **Spotify-inloggning**, **Certifikat (HTTPS)** och **Sparade podcastavsnitt**. Stämmer något inte står det vad som ska göras. **Kontrollera igen** kontrollerar en gång till.

Liknande står på sidan **Om boxen**: **Version**, **Värdnamn**, **Enhet** (Pi-modellen), **System** (operativsystem och arkitektur), **Har körts sedan**, **Starten tog** (tiden tills boxen var helt uppstartad), **CPU-belastning**, **Temperatur**, **Arbetsminne** och platsen på **SD-kortet**. Under visar en **historik** över de senaste 1, 6 eller 24 timmarna hur värdena har utvecklats. Mätningen sker en gång i minuten, bara i boxens arbetsminne. Efter en omstart börjar historiken om.

## Loggar

**Inställningar › System › Loggar** visar boxens loggfiler och status för dess tjänster.

1. Välj under **Logg eller tjänst** en post: en **logg** eller under **Tjänster (status)** en tjänst. Loggarna är serverns (`server-out.log`, `server-error.log`), spelarens (`spotify-control-out.log`, `spotify-control-error.log`), den automatiska avstängningens (`idle_shutdown.log`) och avstängningsknappens (`shutdown_control.log`).
2. Med **Sök** filtrerar du på ett begrepp.
3. **Uppdatera** laddar om, **Följer med** visar nya rader löpande (**Stoppa** stoppar det), **Ladda ner** sparar den valda posten.

### Felsökning

Med **Utförlig spelarlogg** skriver spelaren mycket mer i sin logg (`spotify-control`). Spelaren startar om för det. Slå bara på det om du jagar ett problem, och därefter av igen, för det fyller loggarna.

## Sammanfattning för en återkoppling

För en kort återkoppling på [Discord](https://discord.gg/4EjCgpCbbe), till exempel efter en uppdatering, tryck under **Inställningar › System › Om boxen › Support** på **Kopiera för Discord**. Appen lägger en sammanfattning av boxen i urklippet och visar det: version och de senaste uppdateringarna (och om den senaste blev klar), Pi-modell och arbetsminne, system, enhet med ledigt utrymme, displaymodell och rotation, MuPiHAT med batterinivå, ljudkort och spelare, vilka tjänster som är på, Wi-Fi-band och signal samt temperatur och drifttid. Klistra in det på Discord och skriv under vad som hände. Det är alltid på tyska och byggt likadant för alla boxar, så att hjälparna snabbt kan läsa det.

Sammanfattningen innehåller inget som avslöjar din box, ditt hem eller en person: ingen IP-adress, inget Wi-Fi-namn, inget boxnamn, inga konton och inget ur biblioteket. Går kopieringen inte (vissa webbläsare tillåter det inte över `http://`) är texten markerad, och du kopierar den själv.

## Supportinfo för hjälp

Kärvar något och du blir tillfrågad om mer, tryck under **Inställningar › System › Om boxen › Support** på **Ladda ner supportinfo**. Zip-filen innehåller biblioteket (`data.json`), inställningarna utan lösenord, token och konton, displayens och nätverkets tillstånd, versionerna och **loggarna** från server och spelare (även de äldre) samt webbläsarens felsökningslogg om **Chrome-felsökning** är på – av varje logg de senaste 5 MB. Titta igenom den kort före delning: Loggar kan innehålla namn ur ditt bibliotek.

## Loggarna skonar SD-kortet

Som standard hamnar serverns och spelarens loggar på minneskortet. Den som vill skona det slår under **Systemalternativ** på **PM2-loggar i RAM**. Loggarna går då förlorade vid omstart ([System- och expertinställningar](system.md)).
