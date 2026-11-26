# Fotboll

Tillägget **Fotboll** visar på displayen hur **dina klubbar** har spelat och när de spelar igen, matcherna i **den aktuella omgången** och **tabellen**. Det ställer inte in något på boxen; resultaten hämtar boxen på internet från **OpenLigaDB** eller, med en egen nyckel, från **football-data.org**.

Det finns inga spel, ingen reklam, inga länkar ut på internet och inga spelarbilder, bara klubbmärken, namn och siffror.

## Ställa in

1. Installera tillägget under **Inställningar › System › Tillägg** ([Installera och hantera](installieren.md)).
2. Öppna detaljerna på dess kort och välj **Liga**: dess omgång och tabell står på displayen.
3. Sök under **Mina klubbar** efter en klubb. Ett tryck på **＋ Namn** följer den. Upp till fem klubbar går bra, även landslag som **Tyskland**.

Displayen visar då fliken **Fotboll** (en boll) överst. Ett tryck på den öppnar sidan med tre knappar:

| Vy | Innehåll |
| --- | --- |
| **Min klubb** / **Mina klubbar** | för varje klubb märket, tabellplaceringen, senaste match med resultat och nästa med dag och klockslag; pågår en match står resultatet stort ovanför. Flera klubbar står under varandra |
| **Omgång** | alla matcher i den aktuella omgången; med pilarna eller med svepning kommer du till omgången före och efter. Dina klubbar är markerade |
| **Tabell** | placering, matcher, målskillnad och poäng; vid öppnandet står din klubb i mitten. Ett färgat streck markerar platserna för uppflyttning eller Champions League (grönt), kvalspel (orange) och nedflyttning (rött). Spelar dina klubbar i olika ligor står det över tabellen knappar för varje liga, till exempel **1. Bundesliga** och **LaLiga**; svepning växlar likadant |

Vid **DFB-Pokal** visar tabellen dina klubbars ligor. Utan klubb finns inte vyn **Min klubb**.

En klubbs matcher kommer från **alla tävlingar** som källan känner till: för Bayern alltså Bundesliga, DFB-Pokal och Champions League, för Tyskland landskamper och turneringar. Tabellplaceringen visar boxen ur tabellen för den liga där klubben spelar. Tabellerna för andra ligor hämtar den bara när sidan är öppen, högst varje timme; en liga från football-data.org kräver nyckeln. Cuper och landslag har ingen egen tabell; Champions League visar sin ligafas om du väljer den som tävling.

## Inställningar

| Inställning | Verkan |
| --- | --- |
| **Källa** | **OpenLigaDB** (gratis, utan inloggning, framför allt tyska ligor) eller **football-data.org** (med nyckel, se nedan) |
| **Liga** | 1. Bundesliga, 2. Bundesliga, 3. Liga, DFB-Pokal eller Bundesliga för damer |
| **Tävling** och **API-nyckel** | bara vid football-data.org, se nedan |
| **Mina klubbar** | dina klubbar står som namn ovanför sökfältet; **✕** vid ett namn slutar följa det. För att följa söker du på namnet och trycker på **＋**. Vid fem klubbar hittar sökningen först något igen när du har tagit bort en |
| **Vy vid öppnandet** | vad fliken visar först |
| **Resultat i sidhuvudet** | medan en match med någon av dina klubbar pågår står de två klubbmärkena och ställningen överst på displayen, vid flera matcher bredvid varandra; ett tryck på dem öppnar sidan (standard: på) |
| **Annonsera mål** | gör någon av dina klubbar mål säger boxen det med sin röst, till exempel ”Mål för Bremen! 2–1.”; musiken sänks då men stoppas inte (standard: av) |
| **Visa klubbmärken** | visa klubbarnas märken; avstängt står överallt en cirkel med förkortningen, och boxen hämtar inga märken. Gäller för hela boxen (standard: på) |
| **Förfrågan** | om den senaste förfrågan lyckades, och när den var |

> [!NOTE]
> Under **vilotiden** och när boxen är **spärrad** (speltiden slut, föräldrarnas paus) görs ingen annonsering och visas inget resultat i sidhuvudet. Annonseringen kommer högst en gång i minuten och först sedan boxen en gång har sett matchen pågå: ett mål från förut säger den inte efter påslagningen. Displayen väcks inte för det. Hur snabbt annonseringen kommer beror på när källan för in målet. Faller två mål tätt efter varandra kommer det andra en minut senare. Annonseringen behöver boxens **talfunktion** och talar på dess språk. Tar källan tillbaka ett mål och för in det på nytt säger boxen det en gång till.

### Flera användare

Är [flera användare](../bedienung/mehrere-benutzer.md) påslagna har **varje användare sin egen liga, sina egna klubbar och sin egen vy**. Över formuläret står då **Inställningar för** med en knapp för varje användare: så ställer du in ett barns klubbar utan att växla boxen. Fälten som markeras så visar **per användare**. Efter ett byte av användare visar displayen genast dennes klubbar.

## Andra ligor: football-data.org

För Europas stora ligor finns den andra källan **football-data.org**: Premier League, Championship, Bundesliga, LaLiga, Serie A, Ligue 1, Eredivisie, Primeira Liga, Brasileirão, Champions League samt VM och EM.

1. Registrera dig gratis på [football-data.org](https://www.football-data.org) (”Register”). Nyckeln kommer med e-post.
2. Välj football-data.org under **Källa**, ange **API-nyckeln** och tryck på **Spara**. Nyckeln gäller för hela boxen; appen visar den inte längre därefter.
3. Välj **Tävling**. Under **Mina klubbar** hittar du nu dess klubbar.

**Klubbar från båda källorna:** En klubb stannar kvar hos den källa där du följde den. För Bayern, Tyskland och Barcelona följer du Bayern och Tyskland hos OpenLigaDB, ställer en kort stund källan på football-data.org med tävlingen **LaLiga**, följer Barcelona och ställer tillbaka källan. Liga, omgång och tabell kommer då åter från OpenLigaDB, Barcelona fortsatt från football-data.org. Barcelona behöver nyckeln för det.

> [!NOTE]
> Den gratis nivån hos football-data.org levererar resultaten **med fördröjning**. Längst ned på sidan står då **med fördröjning**, och målannonseringen kommer också senare. Boxen håller sig där under gränsen på tio förfrågningar per minut. För en klubb hos football-data.org visar den matcherna tre veckor före och efter (tar football-data.org inte emot så många dagar, tio dagar).

## Hur ofta boxen frågar

Resultaten förs in av OpenLigaDB:s gemenskap, i Bundesliga oftast några minuter efter målet, i andra ligor ibland senare.

- **Dina klubbar:** varje minut medan en spelar (från strax före avspark; hos football-data.org varannan minut), vid öppen sida var tionde minut, annars varje timme.
- **Omgång och tabell för ligan:** vid öppen sida varje minut medan en match pågår, på en matchdag annars var 15:e minut; vid stängd sida högst varje timme.
- **Ingen klubb vald:** Vid stängd sida frågar boxen inte alls.

Svarar källan inte blir den senaste ställningen kvar, och längst ned står **Ingen anslutning till källan – senaste ställning**. Boxen försöker då igen med allt längre mellanrum, upp till 30 minuter; en klubb frågar den igen efter högst fem minuter. Sidhuvudet visar en match bara så länge det senaste svaret är högst tre minuter gammalt.

Längst ned på sidan står varifrån uppgifterna kommer: **Daten: OpenLigaDB (ODbL)** och, vid football-data.org, **Football data provided by the Football-Data.org API**.

**Klubbmärkena** är upphovsrättsligt skyddade. Boxen hämtar dem bara för sin egen display, en gång, och sparar dem; med **Visa klubbmärken** går de att stänga av helt. Displayen frågar aldrig själv en främmande server. Saknas ett märke står där en cirkel med klubbens förkortning.

## Om inget visas

- Är tillägget påslaget under **Inställningar › System › Tillägg**?
- Resultaten och klubbsökningen behöver internet.
- Är **football-data.org** vald som källa men ingen nyckel ännu sparad finns inte fliken, och klubbsökningen hittar ingenting.
- Under sommaruppehållet och mellan cupens omgångar kan omgången vara tom.
- Vid ett landslag står matcher ofta först strax innan hos OpenLigaDB: Då står där **Ingen match planerad**.
