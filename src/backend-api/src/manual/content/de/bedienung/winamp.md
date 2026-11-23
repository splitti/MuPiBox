# Das Winamp-Theme

Das Theme **Winamp** zeichnet den Player wie das klassische Winamp 2: mit Hauptfenster, Equalizer und Playlist, im Aussehen eines **Winamp-Skins** (`.wsz`). Du wählst es wie jedes Theme unter **Einstellungen › Aussehen › Theme** ([Cover und Themes](cover-und-themes.md)).

## Skins

Ein Skin kommt mit dem Theme mit, damit sofort etwas zu sehen ist. Solange **Winamp** das Theme ist, steht unter der Theme-Auswahl die Karte **Winamp-Skin**:

| Aktion | Wirkung |
| --- | --- |
| **Skin hochladen (.wsz)** | lädt einen Skin vom Handy oder PC auf die Box |
| **Tipp auf einen Skin der Liste** | wählt ihn aus; das Display zeigt ihn sofort |
| **Entfernen** | löscht einen Skin aus der Liste |

Alle hochgeladenen Skins bleiben in der Liste, auch wenn zwischendurch ein anderes Theme gewählt wird. Skins zum Herunterladen gibt es im **Winamp Skin Museum** (skins.webamp.org); die Karte verlinkt es.

> [!NOTE]
> Ist kein Skin vorhanden, sagt das Display das und nennt den Weg in der App.

## Die Fenster

Auf einem **breiten Display** (1920 × 480) steht das **Hauptfenster** immer auf der linken Hälfte. Rechts ist die Bibliothek zu sehen, also die gewohnten Seiten der Box, oder darüber der **Equalizer** oder die **Playlist**.

Auf einem **kleineren Display** (zum Beispiel 800 × 480) ist immer nur ein Fenster zu sehen: der Player, der Equalizer oder die Playlist. Die Kopfzeile der Box bleibt darüber stehen. Ist die Bibliothek offen, bringt ein kleiner runder Knopf unten links den Player zurück.

## Das Hauptfenster

Das Hauptfenster zeigt die Spielzeit, den Titel als Laufschrift, Bitrate und Abtastrate, Mono oder Stereo und die Balken des Analysers. Der Analyser ist Dekoration: Er bewegt sich, solange etwas spielt, misst aber nicht den Ton.

| Bedienelement | Wirkung |
| --- | --- |
| **Fünf Tasten** unten links | vorheriger Titel, Play, Pause, Stopp, nächster Titel |
| **Positionsleiste** | springt im Titel |
| **Lautstärke** und **Balance** | die beiden Schieber über der Positionsleiste |
| **Auswurf** | öffnet die Bibliothek. Mit der Erweiterung [USB-CD-Laufwerk](../erweiterungen/cd-laufwerk.md) und einem Laufwerk öffnet er dessen Schublade |
| **SHUFFLE** | Zufallswiedergabe, für Alben der Bibliothek, des NAS und für Spotify-Musik |
| **REPEAT** | Wiederholen |
| **EQ** und **PL** | öffnen und schließen Equalizer und Playlist |
| **Logo** links in der Titelleiste | ein kleines Menü: Bibliothek, Playlist, Equalizer, Titel-Info; darunter steht der Name des Skins |

Die Beschriftungen der Fenster und ihrer Menüs sind englisch, wie im Original.

## Der Equalizer

Der Equalizer hat einen Vorverstärker und **zehn Bänder**, jeweils von −12 bis +12 dB.

| Bedienelement | Wirkung |
| --- | --- |
| **ON** | schaltet den Equalizer ein und aus |
| **PRESETS** | Voreinstellungen laden, die eigene Einstellung speichern, eine löschen und eine als Standard festlegen. Die Voreinstellungen von Winamp sind dabei |
| **AUTO** | lädt beim Start eines Albums die Voreinstellung, die für dieses Album gespeichert wurde |

Die eigenen Voreinstellungen merkt sich die Box. Auf **Spotify** wirkt der Equalizer nicht; das Fenster sagt es dann.

## Die Playlist

Das Playlist-Fenster zeigt die Titel dessen, was gerade spielt. Ein Tipp auf einen Titel spielt ihn. Sind Titel ausgewählt, wählt ein Tipp stattdessen weitere aus oder ab.

Bei Alben der **Bibliothek** und des **NAS** bearbeiten die Knöpfe unten die **Warteschlange** der Box:

| Knopf | Wirkung |
| --- | --- |
| **ADD** | einen Ordner der Bibliothek durchblättern und dazunehmen (ADD DIR) |
| **REM** | die ausgewählten Titel herausnehmen (REM SEL), alle bis auf die ausgewählten (CROP) oder alle (REM ALL) |
| **SEL** | alle Titel auswählen, keinen oder die Auswahl umkehren. Einen einzelnen Titel wählst du, indem du ihn gedrückt hältst |
| **MISC** | die Datei-Info eines Titels (FILE INFO) und das Sortieren: nach Titel, Dateiname oder Pfad, umgekehrt oder zufällig |
| **LIST OPTS** | die Liste speichern (SAVE LIST), eine gespeicherte laden (LOAD LIST) oder eine neue beginnen (NEW LIST) |

Das ändert nur die Warteschlange: Auf der Box und auf dem NAS wird keine Datei gelöscht oder verschoben. Bei Spotify, TIDAL und einer CD lässt sich die Liste nicht bearbeiten.

## Wenn etwas anders aussieht als erwartet

- **Der Skin sieht unvollständig aus**: Manche Skins bringen nicht alle Bilder mit. Die Box zeichnet dann einfache Ersatzteile, zum Beispiel für den Knopf der Positionsleiste.
- **„Das ist kein Winamp-Skin (.wsz)"** beim Hochladen: Die Datei ist kein klassischer Skin für Winamp 2. Moderne Skins (`.wal`) gehen nicht.
