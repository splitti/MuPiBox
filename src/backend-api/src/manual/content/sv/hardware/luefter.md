# Fläkt

En fläkt håller Raspberry Pi sval, till exempel i ett slutet hölje eller vid en Pi 4 eller 5 under belastning. Boxen styr den efter temperaturen: ju varmare processorn är, desto fortare snurrar den.

**Inställningar › Batteri & ström › Fläkt**

| Inställning | Verkan | Efter installationen |
| --- | --- | --- |
| **Fläkt aktiv** | slår på styrningen | av |
| **Fläktstift** | GPIO-stiftet som fläkten är ansluten till | 12 |
| **Fullt varvtal (100 %) från** | temperatur för full effekt | 75 °C |
| **75 % från** | temperatur för 75 % | 65 °C |
| **50 % från** | temperatur för 50 % | 55 °C |
| **25 % från** | temperatur för 25 % | 45 °C |

Temperaturerna går att ställa in mellan 20 och 90 °C. De måste bli lägre från 100 % till 25 %. Med **Spara** tar du över alla värden.

Hur fort fläkten just går (0, 25, 50, 75 eller 100 %) står vid påslagen fläkt högst upp på den här sidan och under **Inställningar › System › Om boxen** bredvid temperaturen.

> [!NOTE]
> Fläkten behöver ett eget GPIO-stift och får inte dela det med andra tillbehör ([GPIO-beläggning](../anhang/gpio.md)). Hur varm boxen just är visar **Inställningar › System › Boxens tillstånd** ([Loggar och status](../wartung/protokolle.md)).
