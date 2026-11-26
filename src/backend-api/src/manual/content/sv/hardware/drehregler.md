# Vridratt och knapp

En **vridratt med knapp** (en rotationsgivare i stil med KY-040) gör volymen (eller hoppet mellan spår) lätt att nå för barnhänder. Den slås på i appen under **Inställningar › Ljud › Vridratt och knapp**.

> [!NOTE]
> Är tillägget [Buttons & GPIO Input](../erweiterungen/buttons.md) påslaget står den här inställningen i stället under **Inställningar › Buttons & GPIO Input**, som kortet **Vridratt**. Med tillägget går det dessutom att ansluta valfria fler knappar.

## Anslutning

| Vridrattens anslutning | Raspberry Pi:s GPIO-stift |
| --- | --- |
| A (CLK) | **26** (standard) |
| B (DT) | **24** (standard) |
| Knapp | **10** (standard; knappen kopplar mot GND) |

De tre stiften är standard efter installationen. Du kan ändra dem i inställningarna (se nedan), till exempel om ett stift redan behövs till något annat. Vrider ratten åt fel håll, byt anslutningarna A och B (eller byt funktionerna under stiften).

## Inställningar

| Inställning | Verkan |
| --- | --- |
| **Namn** (högst upp i kortet) | en egen beteckning för vridratten, till exempel ”Kök”; utan namn står där ”Vridratt” (den första) eller ”Vridratt 2” osv. Som vid knapparna |
| **Vridratt** | slår på ratten (efter installationen är den av) |
| **GPIO-stift A (CLK)**, **GPIO-stift B (DT)**, **GPIO-stift knapp** | stiften som ratten är ansluten till (se ”Ändra stiften”). Varje stift får också vara **Inget stift** |
| **Vrid åt höger** (under stift A), **Vrid åt vänster** (under stift B) | vad ett steg åt det hållet gör: **Högre**, **Lägre**, **Nästa spår**, **Föregående spår** eller **Av**. Standardinställningen är höger högre och vänster lägre |
| **Steg per hak** | hur många procent varje hak ändrar volymen, 1 till 10 (standard 5); visas bara så länge ett håll är **Högre** eller **Lägre** |
| **Knappens funktion (GPIO …)** | **Av**, **Spela/Paus**, **Nästa spår**, **Spårval (tryck växlar)**, **Spola framåt** eller **Visa boxens IP-adress som QR-kod** |

**Maximum** för volymen (**Ljud › Volym › Maximum (hörselskydd)**) gäller även för ratten: den vrider aldrig högre än tillåtet ([Ljud och volym](sound.md)). Valet av knappens beteende och stegstorleken verkar direkt. Att slå på och av ratten startar om dess tjänst.

## Ändra stiften

I de tre listorna står först **Inget stift** (anslutningen saknas: utan stift A eller B vrider ratten inte, utan stift för knappen finns ingen knapp; funktionen under stiftet försvinner då). Därefter står **bara stift som passar vridratten och är lediga**: alla stift på stiftlisten som inget annat använder. Inte erbjudna är boxens egna stift (på/av-knapp, LED, fläkt, MuPiHAT), stift som startkonfigurationen upptar (till exempel I²C, SPI eller ljudkortet), stift som tillägg använder och stift som ett program just håller. Ett stift som en av de tre anslutningarna redan har står inte längre till val i de andra två listorna. Det aktuella stiftet blir alltid kvar i sin lista.

En ändring gäller direkt: körs ratten startar boxen om dess tjänst med de nya stiften. Koppla om ratten först (helst med avstängd box) eller slå av den en stund. Att slå på kontrollerar stiften en gång till; är något nu upptaget förblir ratten av och appen nämner vem som håller stiftet. LED och fläkt erbjuder inte stiften för en påslagen ratt.

## Knappen

Knappens stift tar ratten bara så länge knappen har en funktion; med **Av** förblir det ledigt för annat. Väljer du senare en funktion kontrollerar appen om stiftet fortfarande är ledigt. Ett stift på SPI- eller I²C-anslutningen (till exempel GPIO 10 vid en NFC-läsare) tar ratten aldrig: knappen förblir då utan verkan, själva ratten fortsätter köra.

| Funktion | Ett tryck |
| --- | --- |
| **Spela/Paus** | pausar uppspelningen eller startar den igen |
| **Nästa spår** | hoppar till nästa spår |
| **Spårval (tryck växlar)** | växlar vridratten mellan **volym** och **spårval** (se nedan) |
| **Spola framåt** | hoppar 30 sekunder framåt |
| **Visa boxens IP-adress som QR-kod** | visar i tio sekunder en **QR-kod** med boxens IP-adress på [OLED-displayen](../erweiterungen/oled.md) (inget annat) |
| **Av** | gör ingenting |

### Spårval med vridratten

Är **Spårval (tryck växlar)** valt är knappen ett reglage:

1. **Första trycket**: vridratten väljer nu **spår** i stället för volymen. Varje steg åt höger hoppar till **nästa spår**, varje steg åt vänster till **föregående**.
2. **Andra trycket**: ratten ställer åter in **volymen**.

Spårvalet slutar också av sig självt: **10 sekunder** efter sista trycket eller sista vridningen. Varje vridning startar tiden om. Den som vrider vidare förblir alltså i spårvalet. Själva första trycket hoppar ännu inte till nästa spår.

> [!TIP]
> Det är praktiskt för album med många spår: hoppa till ett kapitel i hörspelet utan att titta på displayen, och sedan med ett tryck tillbaka till volymen.

## Fler vridrattar

Under den första vridratten står **Lägg till vridratt**. Varje ytterligare vridratt har ett eget kort med:

| Inställning | Verkan |
| --- | --- |
| **GPIO-stift A (CLK)**, **GPIO-stift B (DT)**, **GPIO-stift knapp** | de tre stiften för den här vridratten (varje får vara **Inget stift**; en ny vridratt kommer till utan stift, du väljer dem efteråt) |
| **Vrid åt höger**, **Vrid åt vänster** | vad ett steg åt det hållet gör: **Högre**, **Lägre**, **Nästa spår**, **Föregående spår** eller **Av** (standard: höger högre, vänster lägre) |
| **Steg per hak** | vid **Högre** och **Lägre**: hur många procent ett steg ändrar |
| **Knappens funktion** | **Av**, **Spela/Paus**, **Nästa spår**, **Spola framåt** eller **Visa boxens IP-adress som QR-kod** |
| **Namn** (högst upp i kortet) | vridrattens beteckning |
| papperskorgssymbol (till höger om namnet) | tar bort vridratten; dess stift är lediga igen |

Så finns det till exempel en vridratt för volymen och en andra bara för spåren (höger **Nästa spår**, vänster **Föregående spår**). Upp till **fyra till** är möjliga så länge tillräckligt många GPIO-stift är lediga. Listorna visar bara stift som inget annat använder, inte heller någon annan vridratt. Att ändra stiften eller ta bort en vridratt gäller direkt: boxen startar om tjänsten.

### Välja album med NFC-tillägget

Att välja **album** efter att en tagg lagts på ett **artistomslag** sköter en egen vridratt med egna stift som du ställer in vid NFC-tillägget (se [NFC: Vridratt](../erweiterungen/nfc-drehregler.md)). Den finns bara för det och stör inte de vridrattar som ställs in här.

## När den inte reagerar

- Är reglaget **Vridratt** påslaget? Tjänsten startar bara då.
- Kontrollera kopplingen av de tre stiften (standard 26, 24 och 10; de valda står i inställningarna och i [GPIO-beläggningen](../anhang/gpio.md)).
- Går ratten inte att slå på och appen nämner ett upptaget GPIO-stift har en knapp i tillägget [Buttons & GPIO Input](../erweiterungen/buttons.md) (eller något annat) ett av de tre stiften. Välj ett ledigt stift.
- En ytterligare vridratt gör ingenting: kontrollera dess stift (för att vrida behöver den stift A **och** stift B) och om funktionerna för vridriktningarna passar. Stift på SPI- eller I²C-anslutningen tar tjänsten aldrig.
- Tjänsten heter `mupi_rotary` (den sköter alla vridrattar på den här sidan).
