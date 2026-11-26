# Vad är MuPiBox?

MuPiBox är en hemmabyggd musik- och ljudbokspelare baserad på en Raspberry Pi. Barnet styr den via en pekskärm: tryck på ett omslag, så spelas det. Föräldrarna ställer in boxen i webbläsaren, utan att barnet kan ändra något.

## Vad boxen kan spela

- **Egna filer**: ljudböcker och musik som ligger på boxens minneskort ([Egna ljudböcker och egen musik](../inhalte/lokale-medien.md)).
- **Spotify**: album, spellistor, artister, poddar och ljudböcker, även automatiskt från spellistor ([Spotify](../inhalte/spotify.md)).
- **Poddar och radio**: poddar via sin RSS-adress, radiokanaler via sin strömadress ([Poddar och radio](../inhalte/podcasts-und-radio.md)).
- **Filer från NAS**: media som ligger på en nätverksdisk i hemnätet ([NAS](../inhalte/nas.md)).

På displayen är innehållet sorterat i kategorier: Ljudböcker, Musik, NAS samt Radio och poddar. Kategorier du inte använder kan döljas ([Startsidan](../bedienung/startseite.md)).

## Vad föräldrar kan ställa in

- hur länge och när barnet får lyssna: [Speltid och vilotider](../spielzeit/index.md),
- hur högt boxen som mest låter (hörselskydd): [Ljud och volym](../hardware/sound.md),
- hur boxen ser ut: teman, startbilder och texter ([Omslag och teman](../bedienung/cover-und-themes.md)),
- hur den hör av sig: Telegram-meddelanden, Home Assistant och MQTT ([Telegram](../netzwerk/telegram.md), [Home Assistant](../netzwerk/home-assistant.md), [MQTT](../netzwerk/mqtt.md)).

## Vad boxen sköter själv

Boxen kan stänga av sig själv efter en inställbar tid utan uppspelning, och displayen släcks efter 10 minuter utan användning. Båda tiderna går att ställa in ([Display](../hardware/display.md), [Batteri, MuPiHAT och strömbrytare](../hardware/strom.md)).

> [!NOTE]
> MuPiBox är ett gemensamt projekt. Programvaran bygger på DietPi, Chromium, mpv och fler öppen källkod-komponenter. Egna filer, NAS, poddar och radio spelar spelaren med mpv (mplayer bara som reserv när mpv saknas). Spotify spelas i displayens webbläsare via Spotifys Web Playback SDK. Listan över komponenter finns under **Inställningar › System › Juridisk information**.
