# GPIO-belägging

**GPIO-stiften** är anslutningarna på stiftlisten på Raspberry Pi. MuPiBox-tillbehör använder dem enligt **BCM-numren** (GPIO 26 är inte stift 26 på listen, utan anslutningen med beteckningen ”GPIO26”).

:::gpio-map

> [!NOTE]
> Beläggningen för **MuPiHAT** kommer från kortets officiella pinout. De åtta stiften på tilläggslisten **J5** (GPIO 5, 6, 8, 9, 10, 11, 12, 25) är fria att använda; de är markerade streckade och utlöser ingen överlappning. MuPiHAT har OnOff-SHIM redan ombord och upptar därför samma två stift som den (4 och 17). Båda tillsammans går inte.

## Stift som boxen använder

| Tillbehör | Funktion | GPIO (BCM) | Går att ställa in |
| --- | --- | --- | --- |
| {rotary-a} Vridratt | A (CLK) | 26 | ja, **Inställningar › Ljud › Vridratt och knapp** |
| {rotary-b} Vridratt | B (DT) | 24 | ja, **Inställningar › Ljud › Vridratt och knapp** |
| {rotary-button} Vridratt | Knapp | 10 | ja, **Inställningar › Ljud › Vridratt och knapp** |
| {poweroff} OnOff SHIM (även MuPiHAT) | Signal för avstängning (`gpio-poweroff`) | 4 | i konfigurationen (`shim.poweroffPin`) |
| {trigger} OnOff SHIM (även MuPiHAT) | Knapp (trigger) | 17 | i konfigurationen (`shim.triggerPin`) |
| {cut} Strömavbrott (sätter boxen, inte SHIM; med MuPiHAT inte satt) | Signal vid avstängning | 27 | i konfigurationen (`shim.cutPin`) |
| {led} Drift-LED (egen LED, inte del av SHIM) | Status-LED | 13 | ja, **Inställningar › Batteri & ström › På/av-brytare och LED** |
| {fan} Fläkt | PWM-signal | 12 | ja, **Inställningar › Batteri & ström › Fläkt** |

På din box visar den här tabellen **bara de stift som används där med de aktuella inställningarna**: En avstängd fläkt eller vridratt visas inte, och ett ändrat stift visar sitt nya nummer. Där sidan inte kan fråga boxen (till exempel på GitHub) står stiften som de är inskrivna efter installationen.

> [!WARNING]
> Två enheter får **inte** dela ett stift. Välj för LED och fläkt stift som inte står upptagna ovan. Appen varnar om du för ett tillbehör väljer ett stift som ett annat aktiverat tillbehör redan använder.

## Stift för egna knappar

Med tillägget [Buttons & GPIO Input](../erweiterungen/buttons.md) ansluter du egna knappar till lediga GPIO-stift. Vilka stift som är lediga på din box visar tilläggets eget val: Upptagna stift går inte att välja där, och listan nämner vem som håller dem. Även andra [tillägg](../erweiterungen/index.md) kan uppta stift; boxen kontrollerar det före installationen. [NFC-tillägget](../erweiterungen/nfc.md) upptar SPI-anslutningen (GPIO 8, 9, 10 och 11) och två stift som du väljer i tillägget; i kortet ovan går det att välja som tillbehör.

## Var står stiftinställningen mer?

Stiftet för avstängning står på **två** ställen, och båda måste stämma överens:

1. i boxens konfiguration: `shim.poweroffPin`,
2. i `/boot/config.txt`: som parameter `gpiopin=…` för overlayn `gpio-poweroff`.

Mer om det och vad som händer vid en dubbel rad: [Boxen hänger sig vid avstängning](../fehlerbehebung/haengt-beim-ausschalten.md).

> [!NOTE]
> Har du i stället för OnOff SHIM eller MuPiHAT skrivit in en egen knapp med overlayn `gpio-shutdown` utelämnar installation och uppdatering `gpio-poweroff`. Med båda tillsammans startar Pi inte längre via knappen. En rad som en tidigare uppdatering redan har skrivit in tar du bort en gång själv.
