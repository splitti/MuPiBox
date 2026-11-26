# Fler fall

## Wi-Fi-symbolen saknas fastän boxen är ansluten

Statusvisningen på displayen läser boxens online-läge ur en fil som en liten tjänst (`mupi_check_internet`) sköter. I äldre versioner kunde det läget fastna på ”offline” fastän boxen var på nätet. Nyare versioner stämmer av det med det verkliga läget.

- Starta om boxen ([Starta om och stäng av](../wartung/neustart.md)).
- Kontrollera om boxen verkligen är online, till exempel om Spotify eller en podd laddas.
- Förblir det så, installera en [uppdatering](../wartung/updates.md).

## Displayen är mörk

- Displayen stängs av av sig själv efter den inställda tiden. Ett tryck väcker den ([Display](../hardware/display.md)).
- Förblir den mörk, kontrollera **Display av efter** och ljusstyrkan.
- Visar displayen en **gammal sida** efter en uppdatering? Starta bara om visningen: **Inställningar › System › Starta om & stäng av › Display & tjänster › Starta om display**.

## Omslag saknas

- Ser du ett **färgat kort med mappnamnet** har boxen inte hittat någon bild. Det är avsikten. Ladda upp ett omslag eller slå på **Sök omslag online** ([Omslag](../inhalte/cover.md)).
- Ett **felaktigt** omslag kasserar du under **Bibliotek › Omslag** i kortet **Hittade omslag** med **Kassera**. Albumet återgår då till bilden för mappen ovanför.

## Ett nytt album dyker inte upp

Egna filer dyker upp av sig själva när de är fullständigt kopierade. Vid en **NAS** hjälper **Uppdatera index** ([NAS](../inhalte/nas.md)). Ligger filerna i fel mapp passar kategorin inte.

## Boxen är långsam eller visningen hackar

- **Underspänning**: en för svag nätadapter eller kabel är den vanligaste orsaken ([System- och expertinställningar](../wartung/system.md)).
- **Temperatur**: visar **Lådans status** höga värden hjälper en [fläkt](../hardware/luefter.md) eller ett bättre hölje.
- **USB-minne i fel port**: Körs boxen från ett USB-minne eller en SSD hör det hemma i en blå USB 3.0-port. I den svarta USB 2.0-porten är det många gånger långsammare, framför allt när arbetsminnet blir knappt. **Om boxen** visar då en anmärkning.
- **Minneskortet fullt**: Det lediga utrymmet står under **Om boxen**. Städa eller flytta media till [NAS](../inhalte/nas.md).

## En uppdatering misslyckades

Misslyckas redan nedladdningen eller uppackningen av den nya versionen blir den tidigare installationen kvar. En fullständig väg tillbaka till det gamla läget finns annars inte. Vad som hände visar sidan **Uppdateringar** under **Utskrift**.

Inställningar, bibliotek och omslag sparade boxen före uppdateringen: i `/home/dietpi/mupibox-backups/before-update-….zip`. Körs boxen därefter inte normalt, återställ den [säkerhetskopia](../wartung/backup.md) som du tog i förväg. Hjälper inte det, fråga i communityn eller rapportera felet på GitHub ([splitti/MuPiBox](https://github.com/splitti/MuPiBox/issues)), helst med **supportinfo** ([Loggar och status](../wartung/protokolle.md)).

## Boxen hör inte av sig på Telegram

Kontrollera att **Bot aktiv** är på, att **Bot-token** stämmer och att din chatt står under **Tillåtna chattar** ([Telegram](../netzwerk/telegram.md)).
