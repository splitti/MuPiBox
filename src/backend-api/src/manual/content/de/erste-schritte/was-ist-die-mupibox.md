# Was ist die MuPiBox?

Die MuPiBox ist ein selbst gebauter Musik- und Hörspielplayer auf Basis eines Raspberry Pi. Das Kind bedient sie über einen Touch-Bildschirm: Cover antippen, es spielt. Eltern richten die Box im Browser ein, ohne dass das Kind etwas verstellen kann.

## Was die Box abspielen kann

- **Eigene Dateien**: Hörspiele und Musik, die auf der Speicherkarte der Box liegen ([Eigene Hörspiele und Musik](../inhalte/lokale-medien.md)).
- **Spotify**: Alben, Playlists, Künstler, Podcasts und Hörbücher, auch automatisch aus Playlists ([Spotify](../inhalte/spotify.md)).
- **Podcasts und Radio**: Podcasts über ihre RSS-Adresse, Radiosender über ihre Stream-Adresse ([Podcasts und Radio](../inhalte/podcasts-und-radio.md)).
- **Dateien vom NAS**: Medien, die im Heimnetz auf einem Netzwerkspeicher liegen ([NAS](../inhalte/nas.md)).

Auf dem Display sind die Inhalte in Kategorien sortiert: Hörspiele, Musik, NAS sowie Radio und Podcasts. Nicht gebrauchte Kategorien lassen sich ausblenden ([Die Startseite](../bedienung/startseite.md)).

## Was Eltern einstellen können

- wie lange und wann das Kind hören darf: [Spielzeit und Ruhezeiten](../spielzeit/index.md),
- wie laut die Box höchstens wird (Hörschutz): [Sound und Lautstärke](../hardware/sound.md),
- wie die Box aussieht: Themes, Startbilder und Texte ([Cover und Themes](../bedienung/cover-und-themes.md)),
- wie sie sich meldet: Telegram-Nachrichten und Home Assistant ([Telegram](../netzwerk/telegram.md), [MQTT und Home Assistant](../netzwerk/mqtt.md)).

## Was sich selbst um die Box kümmert

Die Box kann sich nach einer einstellbaren Zeit ohne Wiedergabe von selbst ausschalten, und das Display geht nach 10 Minuten ohne Bedienung aus. Beide Zeiten sind einstellbar ([Display](../hardware/display.md), [Akku, MuPiHAT und Ausschalter](../hardware/strom.md)).

> [!NOTE]
> Die MuPiBox ist ein Gemeinschaftsprojekt. Die Software baut auf DietPi, Chromium, mpv und weiteren Open-Source-Bausteinen auf. Eigene Dateien, NAS, Podcasts und Radio spielt der Player mit mpv (mplayer nur als Rückfall, wenn mpv fehlt). Spotify spielt im Browser des Displays über das Web Playback SDK von Spotify. Die Liste der Bausteine steht unter **Einstellungen › System › Rechtliches**.
