# Spelaren

Ett tryck på ett album eller ett spår öppnar spelaren och startar uppspelningen.

![Spelaren: titel, förlopp, volym, hopp och spolning](display-player.png)

## Reglagen

| Reglage | Verkan |
| --- | --- |
| Spela / Paus | starta eller pausa uppspelningen |
| Föregående / nästa spår | hoppa till spåret före eller efter |
| Spola bakåt / framåt | tryck: 30 sekunder bakåt eller framåt i spåret. **Håll nedtryckt**: spolar med dubbel hastighet tills du släpper |
| Blanda | spela spåren i slumpmässig ordning; bara för Spotify i kategorierna Musik och Radio & poddar |
| Högre / lägre | ändra volymen, begränsad av det maximum som föräldrarna har bestämt |
| Volym högst upp | visar volymen i procent; med en parkopplad Bluetooth-enhet väljer du bredvid var musiken spelas (se nedan) |
| Tillbakaknapp uppe till vänster | lämna spelaren (se nedan) |

Beroende på typen av innehåll finns inte alla reglage. För en radiokanal står **Live** i stället för förloppsfältet, och knapparna för att hoppa och spola saknas.

## Spårlistan

**Spårlistan** visar alla spår i albumet eller spellistan. Den öppnas på två sätt:

- Tryck på knappen under omslaget. Den visar spårnumret, till exempel ”3 / 19”.
- Eller håll omslaget nedtryckt tills listan öppnas. Hur länge ställer du in under **Inställningar › Display & manövrering › Manövrering på displayen › Hålltider › Hålltid för spårlistan** (0,5 till 5 sekunder).

Tryck på ett spår för att spela det. Knappen under omslaget till vänster stänger listan igen. Radiokanaler och poddar via RSS har ingen spårlista.

![Spårlistan med det spår som spelas](display-tracklist.png)

## Box eller hörlurar

Är en Bluetooth-enhet parkopplad visar sidhuvudet bredvid volymen ett fält med symbolen för den utgång som musiken just nu spelas över: högtalare (boxen), Bluetooth eller hörlurar (3,5 mm-utgången). Spelas den inte över högtalaren är fältet färgat. En grön prick betyder: Bluetooth-enheten är ansluten men spelar inte. Spelas musiken över Bluetooth och enheten rapporterar sin batterinivå visas ett litet batteri uppe till höger: grönt, gult från 20 %, rött från 10 %. En röd prick betyder: den hittades inte (avstängd eller utom räckhåll), boxen säger det under sidhuvudet. Finns det exakt två utgångar växlar ett tryck direkt till den andra. Vid fler utgångar öppnar ett tryck fönstret **Lyssna med**, där barnet väljer. Håller du fältet nedtryckt en stund öppnas **Lyssna med** alltid, även vid två utgångar – där ser du alla utgångar och hörlurarnas batterinivå.

Har boxen **flera ljudutgångar** (till exempel 3,5 mm-utgången bredvid en I²S-förstärkare, HDMI eller en USB-ljudadapter) står var och en som egen ruta i fönstret **Lyssna med**: **Högtalare** (boxens ljudkort, till exempel förstärkaren), **3.5 mm** (med en hörlurssymbol), **HDMI** eller **USB**, under dem det namn som systemet ger dem. Fönstret öppnas då även utan parkopplad Bluetooth-enhet. Boxen kommer ihåg valet även efter en omstart. 3,5 mm-utgången bredvid ett eget ljudkort slår du på under **Inställningar › Ljud › Ljudkort › Hörlursuttag** ([Ljud och volym](../hardware/sound.md)). Med bara en ljudutgång förblir allt som förut.

Utan parkopplad enhet visar sidhuvudet bara volymen. Valet går att stänga av på displayen under **Inställningar › Display & manövrering › Manövrering på displayen › Hörlurar › Välj box eller hörlurar på displayen**. Spelas musiken då över Bluetooth eller hörlurar visar sidhuvudet ändå symbolen och batterinivån, bara att växla går inte på displayen. I appen går det alltid att växla ([Bluetooth](../hardware/bluetooth.md)).

## Vad händer när man lämnar spelaren?

Som standard fortsätter musiken när barnet lämnar spelaren med tillbakaknappen. Högst upp i sidhuvudet visar då **Körs just nu** vad som spelas, med en stoppknapp. Det ställer du in under **Inställningar › Ljud › Volym › Tillbaka i spelaren**: **Minimera** (musiken fortsätter) eller **Avsluta** (musiken stannar). Mer om detta: [Fortsätt och ”Körs just nu”](fortsetzen.md).

## Poddar

För poddar kommer boxen ihåg stället där ett avsnitt slutade och markerar nya avsnitt med en prick. Ett fält visar påbörjade avsnitt, en bock avsnitt som är lyssnade till slut. Det ställer du in under **Manövrering på displayen › Fortsätt lyssna** och **› Poddar** ([Poddar och radio](../inhalte/podcasts-und-radio.md)).

En podd har i spelaren också en **spårlista**: den visar avsnitten så som rutan visar dem – ditt **urval av avsnitt** (till exempel ”de 5 nyaste”) och postens **sortering** gäller, utan egen sortering står det nyaste överst. Utan internet står där bara avsnitten på SD-kortet. Knappen under omslaget anger avsnittets plats (”3 / 120”); för mycket långa poddar visar listan de 300 avsnitten runt det som spelas. Tryck på ett avsnitt för att spela det. Precis som för ett album gäller: **Nästa spår** går ett avsnitt nedåt i listan (utan egen sortering till det **äldre**), **Föregående spår** ett uppåt. Det gäller på displayen på samma sätt som med boxens knappar (knappar, vridratt, NFC); vrider du vridratten snabbt flera steg hoppar den lika många avsnitt. Längst upp och längst ner i listan fortsätter avsnittet bara att spela. Avsnitt utanför ditt urval når man inte på det här sättet. Boxen hittar avsnitten i de podd-flöden som den redan har hämtat; en podd vars flöde den aldrig har hämtat har ingen lista och hoppar inte.

## När speltiden är slut

Är dagsgränsen nådd eller pågår en vilotid visar displayen ett meddelande till barnet i stället för spelaren. Texten kan du ändra under **Inställningar › Utseende › Texter på displayen** ([Speltid och vilotider](../spielzeit/index.md)).
