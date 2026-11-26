# Buttons & GPIO Input

Med tillägget **Buttons & GPIO Input** styr **riktiga knappar** boxen: spela/paus, nästa spår, högre, lägre med mera. Varje knapp sitter på ett GPIO-stift på Raspberry Pi som du väljer själv.

Efter [installationen](installieren.md) står inställningarna på en egen sida: **Inställningar › Buttons & GPIO Input**. Där står då också kortet **Vridratt** ([Vridratt och knapp](../hardware/drehregler.md)), som annars finns under **Inställningar › Ljud**.

## Anslutning

En knapp förbinder sitt **GPIO-stift med GND** (jord). Mer behövs inte: inget motstånd, ingen matning. Boxen slår själv på stiftets interna pull-up.

| Knappens anslutning | Raspberry Pi |
| --- | --- |
| Kontakt 1 | ett ledigt GPIO-stift (valt i appen) |
| Kontakt 2 | GND (till exempel stift 6, 9, 14, 20, 25, 30, 34 eller 39 på stiftlisten) |

Valet i appen nämner varje stift med sitt **GPIO-nummer** och **numret på stiftlisten**, till exempel ”GPIO 5 (stift 29)”. Hela listen visar bilagan [GPIO-belägging](../anhang/gpio.md).

> [!WARNING]
> Anslut en knapp bara mellan ett GPIO-stift och GND, aldrig till 3,3 V eller 5 V. Koppla med boxen avstängd.

## Lägga till knappar

I början står på sidan bara **Knapp 1**. Med **+ Knapp** längst ned till höger kommer en till (upp till sex), med **+ Dubbelknapp** en dubbelknapp (upp till två). Papperskorgen till höger om namnet tar bort en tillagd knapp igen; dess stift är därefter lediga.

| Inställning | Verkan |
| --- | --- |
| **Namn** (fältet med ”Knapp 1”) | ett eget namn för knappen, till exempel ”Högre”. Utan namn heter den ”Knapp 1”, ”Knapp 2” … |
| **GPIO-stift** | stiftet som knappen sitter på. **Inget stift** stänger av knappen. De övriga inställningarna visas så snart ett stift är valt |
| **Kort tryck** | åtgärden för ett kort tryck |
| **Långt tryck** | åtgärden för ett långt tryck, eller **Ingen åtgärd** |
| **Hålltid** | från när ett tryck räknas som långt: 0,5 till 3 sekunder (standard 1 sekund) |
| **Upprepa vid hållning** | åtgärden upprepas så länge knappen hålls nedtryckt (fyra gånger per sekund), till exempel för volymen |

Varje ändring sparas direkt och gäller direkt. Ingen omstart behövs.

### Upptagna stift

Stift som redan är tilldelade går inte att välja. Listan nämner **vem** som håller stiftet: boxen själv (på/av-knapp, LED, fläkt, påslagen vridratt, MuPiHAT), startkonfigurationen (till exempel ljudkortet), ett annat tillägg eller en annan knapp på den här sidan.

De tre stiften för **vridratten** (standard 26, 24 och 10, kan ändras i dess inställningar) är lediga så länge vridratten är avstängd; listan visar dem då med anteckningen ”Vridratt (avstängd)”. Har en knapp ett av dessa stift går vridratten inte att slå på förrän stiftet är ledigt igen. Omvänt tar LED och fläkt inget stift som en knapp har.

## Kort och långt tryck

En knapp kan ha två åtgärder (”Dual Action”):

- **Utan lång åtgärd** verkar den korta **direkt vid trycket**.
- **Med lång åtgärd** verkar den korta **vid släppet** och den långa **så snart hålltiden är nådd**. För den långa åtgärden behöver du alltså inte släppa.

Exempel: kort = **Föregående spår**, lång = **Börja om från början**. Ett kort tryck hoppar ett spår bakåt; den som håller knappen en sekund startar albumet eller spellistan från början.

Med **Upprepa vid hållning** upprepas den långa åtgärden så länge knappen hålls nedtryckt. Har knappen ingen lång åtgärd upprepas den korta så snart den har hållits hålltiden. Så blir en knapp med **Högre** en knapp som ställer högre och högre när den hålls nedtryckt.

## Dubbelknapp

En **dubbelknapp** är två knappar (A och B) med tillsammans **sex åtgärder**: var och en för sig och båda tillsammans, i varje fall kort eller långt.

| Tryck | Exempel |
| --- | --- |
| **A kort** | Föregående spår |
| **B kort** | Nästa spår |
| **A och B kort** | Spela/Paus |
| **A långt** | Lägre |
| **B långt** | Högre |
| **A och B långt** | Byt utgång |

De korta åtgärderna verkar vid släppet, de långa så snart hålltiden är nådd. ”Båda tillsammans” betyder: den andra knappen trycks medan den första fortfarande hålls. **Upprepa vid hållning** gäller bara för A eller B ensam, aldrig för båda tillsammans.

En dubbelknapp behöver **båda** stiften. Så länge bara ett är valt läser boxen inte av den.

## Åtgärderna

| Åtgärd | Verkan |
| --- | --- |
| **Spela/Paus** | stoppar uppspelningen eller tar upp den igen |
| **Nästa spår** / **Föregående spår** | hoppar ett spår framåt eller bakåt |
| **Börja om från början** | startar albumet eller spellistan om från första spåret |
| **Högre** / **Lägre** | ändrar volymen med steget som är valt till höger bredvid: 1, 2, 3, 5 eller 10 % |
| **30 sekunder framåt** / **30 sekunder bakåt** | spolar i spåret |
| **Slumpuppspelning på/av** | växlar blandningen |
| **Upprepa alla/ett/av** | växlar vid varje tryck: först **alla** (albumet eller spellistan börjar om från början i slutet), sedan **ett** (spåret spelas om och om igen), sedan **av** (ingen upprepning). Med nästa album börjar uppspelningen åter utan upprepning |
| **Byt utgång** | växlar till nästa utgång: boxens ljudkort och parkopplade Bluetooth-enheter i tur och ordning |
| **Visa boxens IP-adress som QR-kod** | visar i tio sekunder en QR-kod med boxens IP-adress på [OLED-displayen](oled.md) (inget annat). Mobilen skannar den och öppnar boxen i webbläsaren; utan tillägget händer ingenting |
| **Växla OLED-visning (Full / Mix / Kompakt)** | växlar vid varje tryck visningen under uppspelning på [OLED-displayen](oled.md) till nästa: först **Full**, sedan **Mix**, sedan **Kompakt**, sedan åter **Full**. Bytet gäller tills OLED-inställningarna sparas nästa gång; utan tillägget händer ingenting |
| **Stopp** | avslutar uppspelningen |
| **Stäng av boxen** | stänger av boxen |
| **Ingen åtgärd** | trycket gör ingenting |

**Volymsteget** visas bara bredvid **Högre** och **Lägre** och gäller för just den åtgärden. Så kan ett kort tryck ställa fint (1 %) och ett långt grovt (10 %). **Maximum** för volymen ([Ljud och volym](../hardware/sound.md)) gäller även för knapparna.

## Om en knapp inte reagerar

- Är ett **GPIO-stift** valt och en annan åtgärd än **Ingen åtgärd**? En knapp utan åtgärd läses inte av.
- Förbinder knappen verkligen det valda stiftet med **GND**? Appen visar numret på stiftlisten inom parentes.
- Vid en **dubbelknapp** måste båda stiften vara valda och olika.
- Är tillägget påslaget under **Inställningar › System › Tillägg**?
- Spelas just inget gör **Nästa spår**, **Föregående spår** och **Börja om från början** ingenting.
