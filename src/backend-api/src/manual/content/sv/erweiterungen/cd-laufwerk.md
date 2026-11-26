# USB-CD-enhet

Tillägget **USB-CD-enhet** spelar **ljud-cd-skivor** från en cd-enhet som är ansluten till boxen via USB, med spårnamn och omslag från internet.

## Det här behöver du

- en extern cd- eller dvd-enhet med USB-anslutning. Vissa enheter behöver mer ström än en USB-port på Raspberry Pi ger: ta då en enhet med egen strömförsörjning eller en USB-hubb med nätadapter
- tillägget, [installerat](installieren.md) under **Inställningar › System › Tillägg**

Vid installationen ställer boxen in åtkomsten till enheten (en åtkomstregel och gruppen `cdrom`) och hämtar programmen för ripning. Appen visar det i förväg. Därefter står inställningarna på en sida **Inställningar › USB-CD-enhet**, med korten **Titlar och omslag**, **Format och kvalitet** och **Rippa cd**.

## Spela en cd

Ligger en ljud-cd i enheten visar displayen fliken **CD** överst. Ett tryck på den öppnar cd:n i spelaren, med första spåret.

Cd:n beter sig som ett eget album: spårlista, nästa och föregående spår, framåt- och bakåtspolning, slumpuppspelning och upprepning fungerar som vanligt ([Spelaren](../bedienung/player.md)). Under **Fortsätt** visas en cd inte.

I temat med Winamp-spelaren öppnar **utmatningsknappen** enhetens låda och stänger den igen.

## Spårnamn och omslag

| Inställning | Verkan |
| --- | --- |
| **Sök titlar och omslag på nätet** | boxen söker efter spårens namn och efter omslaget. Av: spåren heter då ”Track 1”, ”Track 2” … |
| **Discogs-token** | en åtkomstnyckel för Discogs (se nedan). Utan den frågar boxen bara MusicBrainz |

Boxen frågar först **Discogs**, därefter **MusicBrainz**:

- **Discogs** låter bara inloggade söka och hittar en cd via den **streckkod** som vissa cd-skivor har. Token skapar du på discogs.com under **Settings › Developers › Generate new token** och anger i tilläggets inställningar.
- **MusicBrainz** kräver ingen inloggning och känner igen en cd på dess **innehållsförteckning** (antal och längd på spåren).

För båda behöver boxen internet. Utan internet spelar cd:n ändå, bara utan namn och omslag.

## Rippa en cd

Boxen kan också **kopiera en ljud-cd till biblioteket**: spåren ligger därefter som filer i boxens mediemapp och spelas även utan cd ([Egna ljudböcker och egen musik](../inhalte/lokale-medien.md)).

1. Lägg i cd:n. Under **Inställningar › USB-CD-enhet** ställer du in **Format** och **Kvalitet** på kortet **Format och kvalitet**.
2. Kortet **Rippa cd** visar, så snart cd:n är igenkänd (några sekunder), formuläret med album, albumartist, genre, år, **omslag** (pennan under väljer ett annat) och namnet på varje spår med medverkande artist. Det internet vet om cd:n är redan ifyllt; med **Uppdatera albuminformation online** frågar boxen en gång till.
3. Vid **Spara i** väljer du **Ljudböcker**, **Musik** eller **Övrigt**. **Artistens mapp** visar medan du skriver de befintliga mapparna i den kategorin; ett nytt namn skapar en ny mapp. Likadant **Albumets mapp**. Under står om mappen redan finns eller skapas nu.
4. Tryck på **Rippa**. Förloppet visar kortet **Format och kvalitet**: för varje spår hur långt det har kommit. Där avbryter **Avbryt** också ripningen; de redan färdiga spåren blir kvar i mappen, bara det påbörjade faller bort.

| Format | Bra för |
| --- | --- |
| **MP3**, **AAC** | alla enheter; kvaliteten (128 till 320 kbit/s) avgör storleken |
| **WMA** | gamla spelare; utan omslag i filen |
| **FLAC**, **ALAC** | utan kvalitetsförlust, ungefär tre gånger så mycket plats |

Filerna heter ”01 Titel.mp3” och bär titel, artist, album, genre, år och spårnummer; omslaget finns i filen och ligger som `cover.jpg` i albummappen. Under ripningen spelar cd:n inte och enheten går inte att öppna. Finns det redan en fil med samma namn i albummappen rippar boxen inte: välj då en annan mapp (till exempel ”Album CD 2”). Ripningen tar några minuter och lite plats på minneskortet; vid installationen hämtar boxen programmen `cdparanoia` och `ffmpeg` för det.

## Om cd:n inte dyker upp

- Snurrar enheten? Om inte får den kanske för lite ström (se ovan).
- Fliken **CD** visas bara för rena **ljud-cd-skivor**, inte för data-cd med MP3-filer och inte för blandade cd (ljud och data). Sådana filer kopierar du till biblioteket ([Egna ljudböcker och egen musik](../inhalte/lokale-medien.md)).
- Är tillägget påslaget under **Inställningar › System › Tillägg**?
