# NFC: vridratt

En tagg kan inte bara starta ett album, utan ett **helt artistomslag**: alla album av en artist i biblioteket, en **mapp på SD-kortet** eller en **mapp på NAS**. Taggen spelar då **ett** album av dem, och med **album-vridratten** (KY-040) bläddrar du genom de andra.

NFC-tilläggets vridratt är **bara till för valet av album**. Den har **egna stift** och är en annan vridratt än den för volym och spår (se [Vridratt och knapp](../hardware/drehregler.md)). Du kan ansluta båda samtidigt.

## Koppla en tagg till ett artistomslag

1. Öppna i biblioteket **artisten** (eller mappen), inte ett enskilt album. Den måste ha minst två album.
2. Tryck på **NFC-tagg** och lägg på taggen (precis som vid ett album, se [Koppla en tagg till ett album](nfc-tag-zuordnen.md)).

Taggen bär artistomslagets namn. Vid första påläggningen spelar det **första albumet** i listan (sorterat efter namn).

## Vilket album som spelar vid påläggning

På sidan **Tilldelade taggar** ([Tilldelade taggar](nfc-zugeordnete-tags.md)) har rutan för en sådan tagg en **urvalslista**: **Album när taggen läggs på**. Välj där det album som taggen ska spela när den läggs på. Listan visar alla album i artistomslaget; det som inte längre finns på boxen saknas.

## Välja ett annat album med vridratten

Vridratten väljer bara bland **albumen i det artistomslag vars tagg ligger på just nu** (eller senast lades på). Efter att en sådan tagg lagts på gäller en stund:

| Du | Boxen |
| --- | --- |
| **vrider åt höger** | går till **nästa** album i listan (efter det sista kommer det första) |
| **vrider åt vänster** | går till **föregående** album |
| **trycker på knappen** | **spelar** albumet som vridratten står på |

Vridratten **ändrar ingenting** på taggen: Vid nästa påläggning spelar åter albumet ur urvalslistan.

Ett tryck **innan** du har vridit väljer ingenting. Efter ett val blir vridratten kvar på det album som nu spelar: Du kan genast vrida vidare och välja ett annat album. Vrider ingen tar valet slut efter den inställda tiden. Varje vridning och varje val startar om tiden. Utan pålagd tagg gör album-vridratten ingenting.

## OLED-display

Är [OLED-displayen](oled.md) ansluten visar den vid vridning **i informationen** artisten (eller mappen) och under den **namnet** på det album som vridratten står på just nu, med dess plats i listan (”< 2/12 >”). Långa namn rullar. Statusfältet och raden längst ned med tiden blir kvar, de visar vad som fortfarande spelas. Ett tryck på knappen spelar albumet, och displayen visar åter **spelarens normala visning**. Vrider du men väljer inget går displayen av sig själv tillbaka till föregående visning (spelaren) efter **10 sekunder** utan vridning. Ett tryck väljer då ingenting förrän du vrider igen.

## Anslutning och inställningar

**Inställningar › NFC-tillägg › Vridratt**:

| Inställning | Verkan |
| --- | --- |
| **GPIO-stift A (CLK)**, **GPIO-stift B (DT)** | vridrattens två stift |
| **GPIO-stift knapp** | knappens stift (kopplad mot jord): Ett tryck spelar det valda albumet |
| **Aktiv efter pålägg (sekunder)** | Ett reglage från **0 till 120 sekunder** (standard 20): så länge efter påläggningen, efter varje vridning och efter varje val väljer vridratten album. **0** betyder **alltid aktiv**: Vridratten väljer album tills du lägger på en annan tagg. |

Listorna visar **bara lediga stift**: inga som boxen själv, startkonfigurationen, en NFC-läsare, ett annat tillägg eller en annan vridratt använder. Utan alla **tre** stiften finns inte album-vridratten. **Ett hak är ett album**, och **knappen bekräftar** albumet som vridratten står på. Vrider ratten åt fel håll, byt anslutningarna A och B.

## Det här behövs

- Tre **lediga GPIO-stift** för den här vridratten. Stift på SPI-anslutningen (GPIO 9, 10, 11, även 7 och 8) tillhör NFC-läsarna.
- Artistomslaget har **minst två** album. Med bara ett finns inget att välja.

## Om det inte fungerar

- Vridratten gör ingenting: Kontrollera kopplingen (A och B inte omkastade, jord och stift rätt). Annars: Tiden efter påläggningen är slut (lägg på taggen igen), ett av de tre stiften saknas, eller artistomslaget har bara ett album.
- Knappen väljer ingenting: Du måste först **vrida**.
- Volym eller spår ska också ha en vridratt: Det är en annan, under **Inställningar › Ljud › Vridratt och knapp**.
- Urvalslistan saknas i rutan: Boxen kunde inte läsa albumen (NAS går inte att nå, mappen är borta). Den kommer tillbaka när albumen går att läsa.
