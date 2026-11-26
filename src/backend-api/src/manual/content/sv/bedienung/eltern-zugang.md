# Inställningar på displayen

Ett par saker går att ställa in direkt på displayen, utan mobil. De är tänkta för föräldrar och därför inte synliga öppet.

## Öppna inställningarna

Håll **statusfältet** uppe till höger på displayen (symbolerna för Wi-Fi, batteri och liknande) nedtryckt. Hålltiden går att ställa in från 1 till 10 sekunder under **Inställningar › Display & manövrering › Manövrering på displayen › Hålltider › Hålltid för inställningsåtkomst**. Under 3 sekunder kommer barn lätt in.

Inställningarna på displayen öppnas med fyra rutor. De är märkta på boxens språk (**Inställningar › System › Språk**; utan val engelska):

| Ruta | Verkan |
| --- | --- |
| **Nätverk** | ställa in Wi-Fi och LAN (se nedan) |
| **Bluetooth** | parkoppla hörlurar och högtalare ([Bluetooth](../hardware/bluetooth.md)) |
| **Starta om / Stäng av** | starta om eller stänga av boxen |
| **Föräldraapp** | visar QR-koden för appen |

Högst upp står boxens värdnamn och IP-adress.

![Inställningarna på displayen](display-settings.png)

## Under en vilotid eller efter dagsgränsen

Även på spärrbilden (”Vilotid”, ”Det räcker med musik för idag”) står statusfältet med Wi-Fi och batteri uppe till höger, och **klockan** uppe till vänster. Håll statusfältet nedtryckt som vanligt: spärrbilden viker undan och inställningarna öppnas. Så kommer du åt Wi-Fi och QR-koden för appen även i spärrat läge.

**Spärren gäller då fortfarande**: boxen spelar ingenting så länge vilotiden pågår eller gränsen är nådd. Nere står en anmärkning om det. Går du tillbaka till startsidan, eller rör du inte displayen på 2 minuter, är spärrbilden tillbaka. Spärren kan du bara häva i appen eller via Telegram ([Snabbåtgärder](../spielzeit/schlaftimer.md)).

![Spärrbilden med klocka, Wi-Fi och batteri](display-locked.png)

Står det under klockan **”Tiden är inte synkroniserad”** har boxen inte hämtat klockslaget från nätet sedan den slogs på. Raspberry Pi har ingen egen klocka: utan nät går den vidare med tiden från förra avstängningen, och en vilotid eller gräns från då kan fortfarande gälla. På resande fot hjälper mobilens hotspot:

1. Slå på hotspot på mobilen.
2. Håll statusfältet nedtryckt på displayen och anslut boxen under **Nätverk** till hotspoten.
3. Boxen hämtar klockslaget. Gäller spärren inte längre efteråt försvinner den av sig själv.
4. Gäller den fortfarande, tryck på **Föräldraapp**, skanna QR-koden (mobilen är ju i samma nät) och tryck i appen på **Häv spärr**.

## QR-koden för föräldrar

Tryck på **Föräldraapp**. En **QR-kod** visas. Skanna den med mobilen: du är då inloggad i [appen](../erste-schritte/app-oeffnen.md), även utan lösenord. Texten bredvid QR-koden ändrar du under **Inställningar › Utseende › Texter på displayen**.

## Nätverksinställningar

Rutan **Nätverk** öppnar nätverksinställningarna (de är hittills märkta på engelska). Finns det en LAN-anslutning väljer du högst upp mellan **WiFi** och **LAN** (LAN-inställningarna finns även när ingen kabel sitter i).

### Wi-Fi

- Högst upp står det nuvarande nätet med boxens IP-adress. **Renew address** hämtar en ny IP-adress, bara för den här anslutningen.
- Listan visar sparade och hittade nät. **Scan** söker på nytt, **Add network** lägger till ett nät för hand, till exempel ett dolt.
- Vid ett nät som inte är sparat än står **Connect**. Det frågar efter lösenordet och sparar nätet.
- Sparade nät har tre knappar: **Address** ställer in en **fast IP-adress** för det här nätet (de andra förblir på DHCP; är boxen just nu i det här nätet kontrollerar **Test** adressen före sparandet), **Change** ändrar lösenordet, **Delete** raderar nätet.

Samma inställningar, med mer utrymme, finns i appen: [Wi-Fi och LAN](../netzwerk/wlan-und-lan.md).

> [!NOTE]
> Byter du Wi-Fi stannar boxen i det nuvarande nätet tills det nya går att nå. Är den efteråt i ett annat nät har den en annan IP-adress. Öppna då appen via den nya adressen eller via `mupibox.local`.

## Symboler i statusfältet

Statusfältet visar med en blick om boxen är på Wi-Fi och hur fullt batteriet är (med MuPiHAT, se [Batteri, MuPiHAT och strömbrytare](../hardware/strom.md)). Saknas Wi-Fi-symbolen fast boxen är ansluten hjälper [Fler fall](../fehlerbehebung/weitere-faelle.md).
