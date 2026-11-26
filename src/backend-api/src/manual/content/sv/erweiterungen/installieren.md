# Installera och hantera

Sidan **Inställningar › System › Tillägg** visar de installerade tilläggen som kort och efter dem vad katalogen i övrigt erbjuder. Den nås bara med föräldrarnas inloggning.

## Installera från katalogen

1. Öppna **Inställningar › System › Tillägg**. Boxen hämtar katalogen från internet (GitHub).
2. Tryck på **Installera** vid det tillägg du vill ha.
3. Appen visar **vad tillägget ställer in på boxen** (till exempel åtkomsträttigheter för en enhet, en tjänst eller ett paket) och **vad det behöver** (portar, GPIO-stift, tjänster). Bekräfta.

Boxen laddar ner filen, kontrollerar dess kontrollsumma och installerar den. Därefter startar spelare, server och display om en kort stund. **En pågående uppspelning avbryts då**; appen säger det i förväg.

> [!NOTE]
> Går katalogen inte att nå behöver boxen internet. De installerade tilläggen fortsätter ändå att fungera.

## Testet före installationen

Innan något installeras kontrollerar boxen om det tillägget behöver fortfarande är ledigt: portar, GPIO-stift och tjänster. Jämförelsen sker mot boxen själv (på/av-knapp, LED, fläkt, vridratt, MuPiHAT), mot startkonfigurationen (till exempel ljudkortet), mot de andra tilläggen och mot det som körs just nu.

Finns det en överlappning installeras **ingenting**, och appen nämner vem som upptar porten eller stiftet. Samma test körs när du slår på ett avstängt tillägg igen.

## Ett tilläggs inställningar

Via ett tilläggs kort öppnar du dess detaljer med inställningarna. Reglage och val sparas direkt, textfält med **Spara**.

Vissa tillägg har en **egen sida**: den står då under **Inställningar › System** direkt efter **Tillägg**, och kortet leder dit med **Till inställningarna**. Så är det med [Buttons & GPIO Input](buttons.md).

## Slå på och av, ta bort, uppdatera

| Åtgärd | Verkan |
| --- | --- |
| **Reglaget på kortet** | stänger av tillägget eller slår på det igen. Dess inställningar bevaras |
| **Ta bort** | raderar tillägget. Boxen tar bort det den har ställt in för det (åtkomstregler och tjänster; grupper och paket blir kvar eftersom andra kan behöva dem) |
| **Ny version** | erbjuder katalogen en nyare version står det på kortet. Misslyckas en uppdatering återställer boxen den förra versionen |

Även här startar spelare, server och display om en kort stund.

## Egna filer: utvecklarläget

Ett tillägg är en enda fil med ändelsen `.mpx`. Normalt kommer den från katalogen. Den som bygger ett eget eller har en fil från en annan källa slår på **Utvecklarläge** på sidan. Då finns knappen **Ladda upp fil**:

1. Slå på **Utvecklarläge** och bekräfta varningen.
2. **Ladda upp fil** och välj `.mpx`-filen (högst 16 MB).
3. Boxen kontrollerar filen men installerar ännu inget: appen visar namn, version, vad som ställs in och kontrollsumman (SHA-256).
4. Bekräfta med **Installera**.

> [!WARNING]
> Ett tillägg kan göra allt på boxen, även som administratör. Ladda bara upp filer som du själv har byggt eller vars källa du litar på. Slå av utvecklarläget igen efteråt.

Hur man bygger ett tillägg står i riktlinjerna för utvecklare i repositoriet (`extensions/README.md`).

## Efter en uppdatering av MuPiBox

Ett tillägg ligger bland dina data (`~/.mupibox/data/extensions/`), inte i boxens program. En uppdatering av MuPiBox lämnar det i fred, med inställningar och data.

Efter uppdateringen är boxen dock en annan: kanske tar den inte längre emot tilläggets beskrivning, eller ett stift är nu upptaget. Därför **kontrollerar boxen vid varje start** alla påslagna tillägg:

- Beskrivningen (`manifest.json`) finns och godtas, och tillägget är inte gjort för en nyare MuPiBox.
- Filerna den nämner finns.
- Stiften och portarna som den behöver hålls inte av boxen eller ett annat tillägg. Vill två tillägg ha samma sak ger det senast installerade vika.
- Dess program går att starta, och det har inte fått boxen att krascha flera gånger i rad.

Klarar ett tillägg inte kontrollen **stänger boxen av det** och noterar orsaken. Allt annat fortsätter. Nästa gång du öppnar appen visas ett meddelande, och på tilläggets kort under **Inställningar › System › Tillägg** står en gul ruta med orsaken (under den, inom parentes, den tekniska raden som du kan skicka vidare vid ett felmeddelande).

Det här kan du göra:

- **Åtgärda orsaken** (uppdatera MuPiBox eller tillägget, installera om tillägget, frigör det dubbelbelagda stiftet) och tryck sedan på **Försök igen**. Det slår på tillägget igen; boxen kontrollerar då en gång till.
- **Ta bort** tillägget om du inte längre behöver det.

**Är ett stift upptaget?** Beror orsaken på ett stift som du har valt i tilläggets inställningar (till exempel en knapp på ett stift som MuPiBox-HAT nu behöver själv) frågar appen vid **Försök igen** vad som ska hända:

- **Flytta till en ledig pinne**: Boxen letar upp det lägsta lediga stiftet (från GPIO 4, utan den seriella anslutningen GPIO 14 och 15), skriver in det i inställningarna och slår på tillägget. Därefter visar appen från vilket stift till vilket som flyttades. **Anslut enheten (till exempel knappen) till det nya stiftet.**
- **Ta bort anslutningen**: Stiftet sätts till ”inget” och tillägget slås på. Knappen gör då ingenting förrän du väljer ett stift i inställningarna.

Därefter startar boxens tjänster om. Är något annat än ett stift upptaget (en port, en tjänst, ett stift som tillägget själv bestämmer) visar appen bara överlappningen, och du måste själv åtgärda den.

Slår du själv av eller på ett tillägg försvinner meddelandet.

## När något inte fungerar

- **”Något annat pågår just nu”**: Ett tillägg installeras eller tas redan bort. Vänta tills det är klart.
- **Installationen rapporterar en överlappning**: Appen nämner porten eller stiftet och vem som upptar det. Frigör det där (lägg till exempel fläkten på ett annat stift) och försök igen.
- **Ett tillägg saknas i katalogen**: Inte varje tillägg finns i katalogen. En `.mpx`-fil från en annan källa installerar du i utvecklarläget.
