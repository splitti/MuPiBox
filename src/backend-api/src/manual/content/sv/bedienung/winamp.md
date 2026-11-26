# Winamp-temat

Temat **Winamp** ritar spelaren som den klassiska Winamp 2: med huvudfönster, equalizer och spellista, i utseendet av ett **Winamp-skal** (`.wsz`). Du väljer det som vilket tema som helst under **Inställningar › Utseende › Tema** ([Omslag och teman](cover-und-themes.md)).

## Skal

Ett skal följer med temat så att det genast finns något att se. Så länge **Winamp** är temat finns under temavalet kortet **Winamp-skal**:

| Åtgärd | Verkan |
| --- | --- |
| **Ladda upp skin (.wsz)** | laddar upp ett skal från mobil eller dator till boxen |
| **Tryck på ett skal i listan** | väljer det; displayen visar det genast |
| **Ta bort** | tar bort ett skal ur listan |

Alla uppladdade skal finns kvar i listan, även om ett annat tema väljs emellanåt. Skal att ladda ned finns på **Winamp Skin Museum** (skins.webamp.org); kortet länkar dit.

> [!NOTE]
> Finns inget skal säger displayen det och nämner vägen i appen.

## Fönstren

På en **bred display** (1920 × 480) står **huvudfönstret** alltid på vänstra hälften. Till höger syns biblioteket, alltså boxens vanliga sidor, eller ovanpå det **equalizern** eller **spellistan**.

På en **mindre display** (till exempel 800 × 480) syns alltid bara ett fönster: spelaren, equalizern eller spellistan. Boxens sidhuvud blir stående ovanför. Är biblioteket öppet tar en liten rund knapp nere till vänster dig tillbaka till spelaren.

## Huvudfönstret

Huvudfönstret visar speltiden, titeln som löpande text, bitrate och samplingsfrekvens, mono eller stereo och analysatorns staplar. Analysatorn är dekoration: den rör sig så länge något spelas men mäter inte ljudet.

| Reglage | Verkan |
| --- | --- |
| **Fem knappar** nere till vänster | föregående spår, spela, paus, stopp, nästa spår |
| **Positionsfält** | hoppar i spåret |
| **Volym** och **balans** | de två skjutreglagen ovanför positionsfältet |
| **Utmatning** | öppnar biblioteket. Med tillägget [USB-cd-enhet](../erweiterungen/cd-laufwerk.md) och en enhet öppnar den enhetens lucka |
| **SHUFFLE** | slumpmässig uppspelning, för album i biblioteket, på NAS och för Spotify-musik |
| **REPEAT** | upprepa |
| **EQ** och **PL** | öppnar och stänger equalizer och spellista |
| **Logotyp** till vänster i titelraden | en liten meny: Bibliotek, Spellista, Equalizer, Spårinfo; under den står skalets namn |

Fönstrens och menyernas etiketter är engelska, som i originalet.

## Equalizern

Equalizern har en förförstärkare och **tio band**, vart och ett från −12 till +12 dB.

| Reglage | Verkan |
| --- | --- |
| **ON** | slår på och av equalizern |
| **PRESETS** | laddar förinställningar, sparar din egen inställning, raderar en och anger en som standard. Winamps förinställningar finns med |
| **AUTO** | laddar när ett album startar den förinställning som sparats för det albumet |

De egna förinställningarna kommer boxen ihåg. På **Spotify** verkar inte equalizern; fönstret säger det då.

## Spellistan

Spellistefönstret visar spåren i det som just spelas. Ett tryck på ett spår spelar det. Är spår markerade markerar ett tryck i stället fler eller avmarkerar.

För album i **biblioteket** och på **NAS** redigerar knapparna nere boxens **kö**:

| Knapp | Verkan |
| --- | --- |
| **ADD** | bläddra i en mapp i biblioteket och lägga till den (ADD DIR) |
| **REM** | ta bort de markerade spåren (REM SEL), alla utom de markerade (CROP) eller alla (REM ALL) |
| **SEL** | markera alla spår, inga eller invertera markeringen. Ett enskilt spår väljer du genom att hålla det nedtryckt |
| **MISC** | ett spårs filinfo (FILE INFO) och sorteringen: efter titel, filnamn eller sökväg, omvänd eller slumpmässig |
| **LIST OPTS** | spara listan (SAVE LIST), ladda en sparad (LOAD LIST) eller börja en ny (NEW LIST) |

Det ändrar bara kön: på boxen och på NAS raderas eller flyttas ingen fil. För Spotify, TIDAL och en cd går listan inte att redigera.

## När något ser annorlunda ut än väntat

- **Skalet ser ofullständigt ut**: vissa skal har inte med alla bilder. Boxen ritar då enkla ersättningsdelar, till exempel för positionsfältets knapp.
- **”Det här är inget Winamp-skal (.wsz)”** vid uppladdning: filen är inte ett klassiskt skal för Winamp 2. Moderna skal (`.wal`) fungerar inte.
