# Wi-Fi och LAN

**Inställningar › Nätverk › Wi-Fi** och **Inställningar › Nätverk › LAN**. Ett Wi-Fi går också att ställa in på displayen, se [Inställningar på displayen](../bedienung/eltern-zugang.md).

## Wi-Fi

### Anslutning och sparade nätverk

Sidan **Wi-Fi** visar den aktuella **anslutningen** (med IP-adress, under **Detaljer** även signal, gateway, DNS och MAC) och de **sparade nätverken**. Boxen känner till hur många nätverk som helst och ansluter till det den hittar.

Vid varje sparat nätverk finns **Adress** (fast IP-adress, se nedan), **Lösenord** (det nya lösenordet om routern har fått ett) och **Ta bort**.

> [!NOTE]
> Det **anslutna** nätverket går inte att ta bort, annars skulle boxen vara offline.

### Lägga till nätverk

1. Tryck under **Lägg till nätverk** på **Sök nätverk inom räckhåll**.
2. Välj ditt nätverk i listan.
3. Ange **lösenordet** (8 till 63 tecken, ett öppet nätverk behöver inget) och tryck på **Lägg till**.

Ett nätverk som inte visar sitt namn anger du under **Ange dolt nätverk**: **Nätverksnamn (SSID)** och **Lösenord** (tomt vid ett öppet nätverk), därefter **Lägg till**.

Boxen provar ett nytt nätverk direkt. Lyckas det blir den kvar där och har då oftast en annan adress. Lyckas det inte, till exempel på grund av ett skrivfel, går den tillbaka till det tidigare nätverket och det nya står bland de sparade nätverken med **Ingen anslutning – kontrollera lösenordet**. Via **Lösenord** anger du det då rätt. Under försöket kan appen kort förlora anslutningen. Ett nätverk som boxen inte hittar förblir sparat. Den ansluter till det så snart det är inom räckhåll.

WPA2 och WPA3 känner boxen igen själv. Via Raspberry Pis inbyggda Wi-Fi (Pi 3B+, 4 och 5) använder den ett nätverk som erbjuder båda med WPA2: Det här Wi-Fi-chippet växlar med WPA2 utan avbrott mellan flera accesspunkter (mesh, repeater), med WPA3 kan det inte det. I ett rent WPA3-nätverk söker boxen därför med det inte oavbrutet efter en bättre accesspunkt. Förblir signalen svag bygger den upp anslutningen en gång på nytt (några sekunder). En USB-Wi-Fi-sticka använder WPA3 även i blandat läge, så länge det inbyggda Wi-Fi är av. Är det på läser båda samma sparade nätverk, och boxen sparar dem så att de passar det inbyggda Wi-Fi. Ett nätverk som den inte ser just nu (till exempel ett dolt) lägger den in för båda. För WPA3 ligger lösenordet i klartext i boxens Wi-Fi-konfiguration, som bara boxens administratör (root) kan läsa. WPA3 kräver det så. Är ett nätverk redan sparat ersätts dess post i stället för att dubbleras. Nätverket som boxen är ansluten till just nu förblir oförändrat, så att ett skrivfel inte tar den offline.

### Fast IP-adress

För varje sparat nätverk går det via **Adress** att ange en **fast IP-adress** (**Hämta adress**: **DHCP** eller **Statisk**), de andra förblir på DHCP. I nätverket där boxen är just nu kontrollerar du värdena i förväg med **Testa**, utan att anslutningen bryts. Når boxen med den fasta adressen inte sin router tar den åter DHCP och behåller värdena för att rättas.

### Wi-Fi-övervakare

| Inställning | Verkan |
| --- | --- |
| **Wi-Fi-övervakare (DietPi-WiFi-Monitor)** | bygger upp anslutningen på nytt om den bryts (efter en nyinstallation på). Sitter en kabel i eller finns inget nätverk inom räckhåll ingriper den inte hela tiden |
| **Sök bästa anslutning** | växlar vid flera sparade nätverk till det starkaste |
| **Starta om Wi-Fi** | startar om Wi-Fi |

### Adress och DHCP

**DHCP-timeout** ser till att boxen vid starten väntar högst 10 sekunder på en IP-adress. Det gäller för Wi-Fi och LAN. **Hämta ny adress** förnyar bara Wi-Fi:s adress.

### Wi-Fi-hårdvara

Det inbyggda Wi-Fi går att stänga av (**Inbyggt Wi-Fi på**). Att slå på det igen går också på displayen: tryck på Wi-Fi-sidan överst på Wi-Fi-symbolen. Var det redan av vid starten är det tillbaka efter en omstart – displayen erbjuder den. För en **USB-Wi-Fi-sticka** väljer du **USB-Wi-Fi-drivrutin** (RTL88X2BU eller RTL8821AU) och trycker på **Installera drivrutin**. Drivrutinen byggs på boxen, det tar några minuter. Därefter startar du om boxen. Är drivrutinen installerad ställer du in **Strömsparläge för USB-adaptern** (**Av**, **Minimalt** eller **Maximalt**). **Av** gör anslutningen stabilare hos vissa adaptrar.

På Debian 13 (Trixie) går de här två drivrutinerna ännu inte att bygga, valet saknas där. En sticka vars drivrutin ingår i systemet fungerar även utan dem. På Trixie är det inbyggda Wi-Fi det bättre valet: Äldre Realtek-stickor kan få avbrott där.

## LAN (kabel)

Sidan **LAN** hör till kabelanslutningen:

- **LAN på** slår på eller av den. Med kabel har LAN företräde framför Wi-Fi,
- **Anslutning** visar om en kabel är ansluten, och den aktuella IP-adressen, under **Detaljer** även gateway, DNS och MAC,
- **Hämta adress**: **DHCP** eller **Statisk**,
- vid **Statisk** anger du **IP-adress** och **Nätmask**. **Router (valfritt)** och **DNS-server (valfritt)** får du lämna tomma. Utan router stannar internet på Wi-Fi. Det är praktiskt när en dator är ansluten direkt till boxen,
- **Spara** tar över värdena, **Starta om LAN** startar om anslutningen,
- **Hämta ny adress** förnyar bara kabelns adress.

## Boxen har en ny adress

Efter ett byte av nätverk eller anslutning har boxen oftast en annan IP-adress. Öppna då appen via `mupibox.local` eller den nya adressen ([Öppna appen och logga in](../erste-schritte/app-oeffnen.md)). Sidan **Wi-Fi** visar adressen, om den finns även IPv6-adressen.
