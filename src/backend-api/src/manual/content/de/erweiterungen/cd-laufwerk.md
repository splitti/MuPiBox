# USB-CD-Laufwerk

Die Erweiterung **USB-CD-Laufwerk** spielt **Audio-CDs** von einem CD-Laufwerk, das per USB an der Box hängt, mit Titelnamen und Cover aus dem Internet.

## Was du brauchst

- ein externes CD- oder DVD-Laufwerk mit USB-Anschluss. Manche Laufwerke brauchen mehr Strom, als ein USB-Anschluss des Raspberry Pi liefert: Nimm dann ein Laufwerk mit eigener Stromversorgung oder einen USB-Hub mit Netzteil
- die Erweiterung, [installiert](installieren.md) unter **Einstellungen › System › Erweiterungen**

Bei der Installation richtet die Box den Zugriff auf das Laufwerk ein (eine Zugriffsregel und die Gruppe `cdrom`) und holt die Programme zum Rippen. Die App zeigt das vorher an. Danach stehen die Einstellungen auf einer Seite **Einstellungen › USB-CD-Laufwerk**, mit einer Karte **Titel und Cover** und einer Karte **CD rippen**.

## Eine CD abspielen

Liegt eine Audio-CD im Laufwerk, zeigt das Display oben den Reiter **CD**. Ein Tipp darauf öffnet die CD im Player, mit dem ersten Titel.

Die CD verhält sich wie ein eigenes Album: Titelliste, nächster und vorheriger Titel, Vor- und Zurückspulen, Zufallswiedergabe und Wiederholen funktionieren wie gewohnt ([Der Player](../bedienung/player.md)). Unter **Fortsetzen** erscheint eine CD nicht.

Im Theme mit dem Winamp-Player öffnet der **Auswurf-Knopf** die Schublade des Laufwerks und schließt sie wieder.

## Titelnamen und Cover

| Einstellung | Wirkung |
| --- | --- |
| **Titel und Cover im Internet suchen** | die Box sucht nach den Namen der Titel und nach dem Cover. Aus: Die Titel heißen dann „Track 1", „Track 2" … |
| **Discogs-Token** | ein Zugangsschlüssel für Discogs (siehe unten). Ohne ihn fragt die Box nur MusicBrainz |

Die Box fragt zuerst **Discogs**, danach **MusicBrainz**:

- **Discogs** lässt nur Angemeldete suchen und findet eine CD über den **Strichcode**, den manche CDs mitbringen. Den Token erzeugst du auf discogs.com unter **Settings › Developers › Generate new token** und trägst ihn in den Einstellungen der Erweiterung ein.
- **MusicBrainz** braucht keine Anmeldung und erkennt eine CD an ihrem **Inhaltsverzeichnis** (Anzahl und Länge der Titel).

Für beides braucht die Box Internet. Ohne Internet spielt die CD trotzdem, nur ohne Namen und Cover.

## Eine CD rippen

Die Box kann eine Audio-CD auch **in die Bibliothek kopieren**: Die Titel liegen danach als Dateien im Medien-Ordner der Box und spielen auch ohne CD ([Eigene Hörspiele und Musik](../inhalte/lokale-medien.md)).

1. CD einlegen. Unter **Einstellungen › USB-CD-Laufwerk** stellst du auf der Karte **CD rippen** das **Format** und die **Qualität** ein.
2. **CD rippen …** antippen. Die Box zeigt einen Dialog mit Album, Albuminterpret, Genre, Jahr, **Cover** (der Stift darunter wählt ein anderes) und dem Namen jedes Titels samt beteiligtem Interpreten. Was das Internet zur CD weiß, ist schon eingetragen; mit **Albuminformationen online aktualisieren** fragt die Box noch einmal nach.
3. Bei **Speichern in** wählst du **Hörspiele**, **Musik** oder **Sonstiges**. Der **Ordner des Interpreten** zeigt beim Tippen die vorhandenen Ordner dieser Kategorie; ein neuer Name legt einen neuen Ordner an. Ebenso der **Ordner des Albums**. Darunter steht, ob der Ordner schon da ist oder neu angelegt wird.
4. **Rippen** antippen. Den Fortschritt zeigt die Karte **CD rippen**, dort bricht **Abbrechen** das Rippen auch ab: Was bis dahin gerippt war, löscht die Box wieder.

| Format | Gut für |
| --- | --- |
| **MP3**, **AAC** | jedes Gerät; die Qualität (128 bis 320 kbit/s) bestimmt die Größe |
| **WMA** | alte Player; ohne Cover in der Datei |
| **FLAC**, **ALAC** | ohne Qualitätsverlust, etwa das Dreifache an Platz |

Die Dateien heißen „01 Titel.mp3“ und tragen Titel, Interpret, Album, Genre, Jahr und Titelnummer; das Cover steckt in der Datei und liegt als `cover.jpg` im Albumordner. Während des Rippens spielt die CD nicht und das Laufwerk lässt sich nicht öffnen. Gibt es im Albumordner schon eine Datei mit demselben Namen, rippt die Box nicht: Wähle dann einen anderen Ordner (zum Beispiel „Album CD 2“). Das Rippen braucht ein paar Minuten und etwas Platz auf der Speicherkarte; bei der Installation holt die Box dafür die Programme `cdparanoia` und `ffmpeg`.

## Wenn die CD nicht erscheint

- Dreht das Laufwerk an? Wenn nicht, bekommt es vielleicht zu wenig Strom (siehe oben).
- Der Reiter **CD** erscheint nur bei reinen **Audio-CDs**, nicht bei Daten-CDs mit MP3-Dateien und nicht bei gemischten CDs (Audio und Daten). Solche Dateien kopierst du in die Bibliothek ([Eigene Hörspiele und Musik](../inhalte/lokale-medien.md)).
- Ist die Erweiterung unter **Einstellungen › System › Erweiterungen** eingeschaltet?
