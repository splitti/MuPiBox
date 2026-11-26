# NFC: röstmeddelanden

Undersidan **Talfunktion** (**Inställningar › NFC-tillägg › Talfunktion**) bestämmer vad boxen **säger med sin röst** när något är i vägen eller saknas. Ett barn som lägger på en tagg och inte hör något vet annars inte vad det beror på.

Varje utrop har ett **reglage** och en **text**. Texten kan du ändra; den sägs som du skriver den (upp till 300 tecken). Lämnar du den tom eller oförändrad säger boxen standardtexten **på det språk den talar** (**Inställningar › Ljud › Talfunktion**, **Boxen talar**). För språk utan egen standardtext (till exempel arabiska) är det engelska.

Utropen kommer från **boxens röst**, som du ställer in under **Inställningar › Ljud › Talfunktion**. Är där **Ljudlös** vald förblir även NFC tyst. Spelas just musik sänks den under tiden.

## Utropen

| Kort | Utrop | När |
| --- | --- | --- |
| **Wi-Fi** | **Ingen anslutning till Wi-Fi-routern** | En tagg startar ett media som behöver internet, och boxen är inte ansluten till något Wi-Fi. |
| **Wi-Fi** | **Wi-Fi-anslutningsproblem eller synkroniseringsfel** | Boxen sitter på routern men kommer inte ut på internet. |
| **Wi-Fi** | **Wi-Fi-signal finns, men för svag** | Signalen är svagare än -75 dBm. Mediet startar ändå. |
| **Innehåll** | **Fördröjning eller avbrott vid laddning av innehåll** | En taggs media startar inte: efter 10 sekunder, vid Spotify efter 35. |
| **Innehåll** | **NAS tillfälligt inte tillgänglig** | En tagg med ett media från NAS startar inte, och NAS svarar inte. |
| **Innehåll** | **Spotify tillfälligt inte tillgängligt** | En tagg med ett Spotify-media startar inte, och Spotify svarar inte. |
| **Taggar och batteri** | **NFC-taggen är inte tilldelad än** | En tagg läggs på som ännu inte har något media. |
| **Taggar och batteri** | **Anslut för laddning** | Av sig självt när batteriet når **10 %** och boxen inte laddas. |

Standardtexterna (tyska):

| Utrop | Text |
| --- | --- |
| Ingen anslutning till Wi-Fi-routern | Ich habe keine Verbindung zum WLAN-Router. |
| Wi-Fi-anslutningsproblem eller synkroniseringsfel | Es gibt ein Problem mit der WLAN-Verbindung oder bei der Synchronisation. |
| Wi-Fi-signal finns, men för svag | Das WLAN-Signal ist da, aber zu schwach. Bitte stell mich näher an den Router. |
| Fördröjning eller avbrott vid laddning av innehåll | Das Laden der Inhalte dauert zu lange oder wurde abgebrochen. Versuch es gleich noch einmal. |
| NAS tillfälligt inte tillgänglig | Das NAS ist vorübergehend nicht erreichbar. |
| Spotify tillfälligt inte tillgängligt | Spotify ist vorübergehend nicht erreichbar. |
| NFC-taggen är inte tilldelad än | Dieser NFC-Tag wurde noch nicht zugeordnet. |
| Anslut för laddning | Bitte stecke mich zum Laden an. |

Är boxens språk svenska säger boxen motsvarande texter på svenska.

## Hur ofta, och när inte

- Samma utrop kommer **högst vartannat minut**, så att ett fel som blir kvar inte får boxen att prata oavbrutet. Två olika utrop pratar inte i munnen på varandra.
- **Undantag: NFC-taggen är inte tilldelad än.** Det utropet kommer **vid varje påläggning**, även om du lägger på taggen igen direkt. Bara medan meningen fortfarande sägs hoppas en ny påläggning över.
- Ett album från **SD-kortet** behöver inget nät: För dess media kommer inget Wi-Fi-utrop.
- **Fördröjning eller avbrott** kommer inte när boxen själv spärrar mediet (speltiden för i dag är slut, det är vilotid), och inte när taggen redan är borttagen igen och **När den tas bort** pausar eller stoppar.
- Utropet **Anslut för laddning** kommer **en gång**. Först när batteriet åter har varit över 15 % eller boxen har laddats kommer det igen vid nästa 10 %. Det kräver en MuPiBox-HAT med batteri; utan batteri (nätdrift) finns det inte.
- Wi-Fi kontrollerar boxen på filen som den själv skriver med några sekunders mellanrum (nätets namn, adress, internet ja eller nej, signalstyrka). En box på LAN-kabel räknas som ansluten.

## Tillbaka till standardtexterna

Radera ett utrops text och spara: Boxen tar åter standardtexten. Ett utrops reglage stänger av det helt.

Vidare: [NFC-tillägg](nfc.md), [Tilldelade taggar](nfc-zugeordnete-tags.md).
