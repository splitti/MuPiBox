# Jellyfin

Har du dina ljudböcker, hörspel och din musik på en **Jellyfin**-server (till exempel på NAS:en eller en dator i hemnätet) spelar boxen dem direkt därifrån. Du väljer album, ljudböcker, artister och spellistor så som Jellyfin ordnar dem – med sina omslag. Jellyfin är fritt och körs hemma hos dig; boxen behöver inget internet för det, bara hemnätet.

## Ansluta

Sidan hittar du under **Inställningar › Tjänster › Jellyfin**. En guide leder genom tre steg:

1. **Server:** **Sök i hemnätet** hittar Jellyfin-servrar som anmäler sig i samma nät; tryck på din. Står servern i ett annat nät (VLAN) skriver du in adressen, t.ex. `http://192.168.1.20:8096`. Utan port tar boxen 8096. Använder din Jellyfin https med ett eget (självsignerat) certifikat visar boxen dess fingeravtryck – jämför det i webbläsaren via hänglåssymbolen och bekräfta det bara om det stämmer.
2. **Logga in:** boxen visar en sexsiffrig **Quick Connect-kod**. Öppna Jellyfin på mobilen eller i webbläsaren, inloggad med kontot vars bibliotek boxen ska spela, och ange koden under **Profil › Quick Connect**. Är Quick Connect avstängt i Jellyfin (Dashboard › Allmänt) loggar du in med **användarnamn och lösenord**. Lösenordet använder boxen bara för inloggningen; det som sparas är bara en åtkomstnyckel (token), krypterad på boxen.
3. **Bibliotek:** välj från vilka bibliotek appen erbjuder innehåll att lägga till. Inget valt betyder: alla som boxen kan spela (musik, böcker, spellistor).

Bäst är att skapa ett eget konto i Jellyfin för boxen, med åtkomst bara till barnens bibliotek.

Därefter visar sidan server, version, konto och bibliotek. I Jellyfin dyker boxen upp under **Enheter** som ”MuPiBox” med boxens namn.

- **Använd Jellyfin** stänger av Jellyfin utan att radera inloggningen. Poster från Jellyfin finns då kvar i biblioteket men visas och spelas inte.
- **Ändra adress** gäller samma server på en ny adress (t.ex. ny IP); inloggningen finns kvar. Är det en annan server loggar du in där på nytt. Poster från den förra Jellyfin spelar då inte längre; radera dem i biblioteket och lägg till dem från den nya servern.
- **Logga ut** avslutar inloggningen även i Jellyfin (enheten försvinner där). Posterna finns kvar i biblioteket och spelar igen efter en ny inloggning.

## Lägga till innehåll

Under **Bibliotek › Lägg till › Från Jellyfin** står de valda biblioteken; ovanför söker du i alla efter namn.

- **Musik:** artister eller album. Tryck på ett **album**, välj kategori och **Lägg till**. En **artist** visar sina album för att läggas till ett och ett; **Lägg till hela artisten** skapar en post för alla hans eller hennes album – även för sådana som senare kommer till i Jellyfin. Boxen och appen visar den som en mapp.
- **Ljudböcker:** en ljudbok av flera filer (en mapp per bok) är en post; dess filer är spåren. Ligger flera böcker i en mapp skiljer boxen dem åt via filernas albumtagg. En bok i en fil (M4B) är likaså en post. En bok vars filer ligger i undermappar (CD1, CD2 …) visas som en post per undermapp.
- **Spellistor:** dina ljudspellistor från Jellyfin. Som hos Spotify väljer du under **På startsidan** om den får en egen ruta eller står i en mapp.

Vid en hel artist ställer du i **Bibliotek** (tryck på posten) in **ordningen på displayen** och stänger av enskilda album med deras reglage.

Ändras ett album eller en spellista i Jellyfin spelar boxen vid nästa start det nya läget.

## Spela

Ett Jellyfin-album spelar som ett album från minneskortet: med spårlista, framåt och bakåt, spolning, **Fortsätt lyssna**, lyssnad-bockar och dagsgränsen för sin ruta. Från appen startar du det under **Lyssna**. Speltid och vilotider gäller även här.

Boxen spelar filerna i original. Vid stora filer (FLAC) och svagt Wi-Fi hjälper **Konvertera för svagt Wi-Fi** (på sidan **Jellyfin** under **Uppspelning**): Jellyfin konverterar då varje spår till MP3 med 192 kbit. Då fungerar inte spolning, och **Fortsätt lyssna** börjar spåret från början (på rätt ställe i albumet).

## Dela förloppet med Jellyfin

Med **Dela förloppet med Jellyfin** (standard av) håller boxen Jellyfin uppdaterad:

- Den rapporterar vad den spelar och var i spåret den är. Spår som lyssnats till slut sätter Jellyfin som **spelade**.
- Startar du ett album eller en ljudbok på nytt på boxen (inte via **Fortsätt lyssna**) börjar det där kontot i Jellyfin slutade – även om du emellan har lyssnat vidare på mobilen. För ljudböcker är det första kapitlet som ännu inte spelats.
- Är ett album helt spelat i Jellyfin får det på boxen den gröna lyssnad-bocken – senast efter tio minuter.

Jellyfin kommer ihåg ett ställe mitt i ett kapitel för ljudböcker först från 5 minuter och räknar de sista minuterna som spelade (kan ställas in i Jellyfin-dashboarden under Uppspelning › Återuppta).

> [!NOTE]
> Svarar Jellyfin inte (servern av, i viloläge, annat nät) döljer displayen dess poster tills den svarar igen – boxen frågar varje minut. I appens bibliotek finns de kvar. Är boxen utloggad i Jellyfin säger sidan **Jellyfin** det och erbjuder **Logga in igen**.
