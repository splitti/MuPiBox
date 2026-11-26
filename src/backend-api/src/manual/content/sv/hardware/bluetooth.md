# Bluetooth

Boxen kan spela via Bluetooth på hörlurar eller högtalare. Allt om det står under **Inställningar › Ljud › Bluetooth**.

## Slå på

Reglaget **Bluetooth** slår på eller av Bluetooth för hörlurar och högtalare. Det verkar direkt.

Själva **Bluetooth-chippet** slår du av och på i kortet **Hårdvara** (hopfällt under **Bluetooth-chip och controller**). Är chippet av är Raspberry Pi:s Bluetooth-hårdvara helt avstängd: det kan göra det inbyggda Wi-Fi stabilare (det delar radion med Bluetooth) och sparar lite ström. Chipreglaget gäller först efter en **omstart**. Där står också adressen till boxens Bluetooth-controller.

## Parkoppla en enhet

1. Sätt enheten (hörlurar, högtalare) i **parkopplingsläge**. Oftast håller du för det en knapp nedtryckt länge.
2. Tryck i appen under **Parkoppla ny enhet** på **Sök**. Sökningen tar ungefär 20 till 25 sekunder.
3. Tryck vid enheten på **Parkoppla**. Den dyker därefter upp under **Parkopplade enheter**. Där kan du också **ansluta**, **koppla från** eller **ta bort** den.

Enheter som inte skickar något namn står hopfällda under ”fler enheter utan namn”.

## Anslut automatiskt

**Anslut automatiskt** ansluter en känd enhet av sig själv så fort den är på. Det hjälper om enheter inte ansluter sig själva efter att boxen slagits på.

## Vilken enhet spelar boxen på?

Är en enhet parkopplad väljer du utgången: boxen själv (**Högtalare**) eller Bluetooth-enheten.

- **I appen** på startsidan ovanför volymreglaget (**Utgång**).
- **På displayen** med ett tryck på volymen högst upp i spelaren. Det går bara om under **Inställningar › Display & manövrering › Manövrering på displayen** reglaget **Välj box eller hörlurar på displayen** är på ([Spelaren](../bedienung/player.md)).

Går enheten inte att nå meddelar boxen det, i stället för att bara förbli tyst.

## Hörlurarnas batterinivå

Rapporterar en ansluten hörlur sin batterinivå visar boxen den: på displayen i **Lyssna med** på dess ruta (röd vid 20 % och lägre), i appen bredvid dess namn vid utgången och under **Parkopplade enheter**. Många hörlurar rapporterar den i tiosteg, några inte alls (AirPods till exempel). Då står där helt enkelt ingenting.

## Volym med Bluetooth

För hörlurar finns ett **eget maximum**. Det gäller för Bluetooth-enheter och för hörlursuttaget. Så får hörlurar vara tystare än en högtalare. Du ställer in det i appen under **Inställningar › Ljud › Volym** med **Egen gräns för hörlurar** ([Ljud och volym](sound.md)).
