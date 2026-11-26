# Poddar och radio

Båda hamnar i kategorin **Radio & poddar** (eller en annan om du väljer det när du lägger till).

## Poddar

Det finns tre sätt att lägga till en podd:

- **Sök poddar** (**Bibliotek › Sök poddar**): skriv ett sökord, välj podden bland träffarna.
- **Klistra in länk** med typen **Podcast (RSS)**: du anger poddens RSS-adress.
- **Spotify**: poddar som finns hos Spotify går att lägga till som allt Spotify-innehåll ([Spotify](spotify.md)).

När den öppnas visar boxen **avsnittslistan**, nyaste avsnitt först.

### Vilka avsnitt på boxen

När du lägger till och redigerar väljer du under **Vilka avsnitt på boxen**: alla, de nyaste eller de första (äldsta) N avsnitten, eller ett **eget område**. Det egna området räknar efter datum från det nyaste avsnittet: **0 är det nyaste**, 0 till 9 är alltså de tio nyaste. Kommer ett nytt avsnitt till följer området med. Förhandsvisningen under visar vilka avsnitt som kommer till boxen. Ett område som sparades före version 5.0.12 räknar fortfarande från det äldsta och står som **Område som förut** i valet tills du väljer något annat.

### Lyssnarstatus och nya avsnitt

Boxen kommer ihåg för varje avsnitt var det slutade och kan markera nya avsnitt. En prick på podden och på avsnittet visar nyheter. Vid påbörjade avsnitt visar ett fält hur långt man har lyssnat, vid avsnitt som lyssnats till slut en bock. Alla regler står under [Fortsätt och ”Körs just nu”](../bedienung/fortsetzen.md).

> [!NOTE]
> Kan boxen inte läsa en poddes flöde säger appen varför, i stället för att bara visa ”Inga avsnitt hittades”: servern hittades inte, nås bara via IPv6 (boxen har inget IPv6), går inte att nå och liknande.

## Radio

Radiokanaler kommer till boxen som **strömadress**:

- **Sök radiokanaler** (**Bibliotek › Sök radiokanaler**): skriv ett sökord, välj kanalen.
- **Klistra in länk** med typen **Radioström**: du anger strömmens adress. Det får också vara en `.m3u`- eller `.pls`-fil: boxen läser strömadressen därur. Som **titel** anger du kanalens namn som visas på displayen.

För radio visar spelaren indikeringen **Live** i stället för ett förloppsfält. En radiokanal stannar vid speltidsgränsen direkt, även om ”Spela färdigt spåret” är inställt ([Dagsgränser](../spielzeit/tageslimits.md)).

> [!TIP]
> En kanals logotyp kan du ange som **omslag**: skriv in bildens adress när du lägger till eller ladda upp den ([Omslag](cover.md)).
