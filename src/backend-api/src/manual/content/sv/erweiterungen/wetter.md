# Väder

Tillägget **Väder** visar vädret på en ort som **mätare** på displayen: temperatur, luftfuktighet, vindstyrka, vindriktning, lufttryck och regnmängd. Det ställer inte in något på boxen; värdena hämtar boxen från internet.

## Ställa in

1. Installera tillägget under **Inställningar › System › Tillägg** ([Installera och hantera](installieren.md)).
2. Öppna detaljerna på dess kort och sök under **Ort** efter namnet på din ort. Tryck på en träff.

Är en ort vald visar displayen fliken **Väder** överst. Ett tryck på den öppnar mätarna: alltid två bredvid varandra, och med svepning kommer du till nästa. Tillbaka-knappen i titellisten stänger dem igen.

## Inställningar

| Inställning | Verkan |
| --- | --- |
| **Väderserver** | **Open-Meteo** levererar mätvärden för de senaste 24 timmarna och vindbyar. Hos **MET Norway (yr.no)** är det värden från vädermodellen; regnet är där prognosen för de närmaste 24 timmarna |
| **Ort** | sök på namnet och tryck på en träff |
| **Uppdatera var …** och **Enhet** | hur ofta den öppna väderbilden hämtar nya värden, i sekunder eller minuter (minst var 10:e sekund, standard var 10:e minut) |
| **Temperatur** | °C eller °F |
| **Regn** | mm eller tum |
| **Lufttryck** | hPa, inHg, mb eller kPa |
| **Vindstyrka** | km/h, m/s, mph eller knop |
| **Mätarnas ordning** | ta tag i en mätare vid handtaget och flytta den till en annan plats |

> [!NOTE]
> Väderservrarna levererar nya värden bara ungefär varje timme, och boxen frågar dem högst en gång i minuten. Ett mycket kort intervall gör alltså inte visningen noggrannare.

Båda väderservrarna är gratis och kräver ingen inloggning. Boxen frågar dem med koordinaterna för den valda orten.

## Om inget väder visas

- Är en **ort** vald? Utan ort finns inte fliken **Väder**.
- Ortssökningen och värdena behöver internet.
- Är tillägget påslaget under **Inställningar › System › Tillägg**?
