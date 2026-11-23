# USB-CD-Laufwerk

Die Erweiterung **USB-CD-Laufwerk** spielt **Audio-CDs** von einem CD-Laufwerk, das per USB an der Box hängt, mit Titelnamen und Cover aus dem Internet.

## Was du brauchst

- ein externes CD- oder DVD-Laufwerk mit USB-Anschluss. Manche Laufwerke brauchen mehr Strom, als ein USB-Anschluss des Raspberry Pi liefert: Nimm dann ein Laufwerk mit eigener Stromversorgung oder einen USB-Hub mit Netzteil
- die Erweiterung, [installiert](installieren.md) unter **Einstellungen › System › Erweiterungen**

Bei der Installation richtet die Box den Zugriff auf das Laufwerk ein (eine Zugriffsregel und die Gruppe `cdrom`). Die App zeigt das vorher an.

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

## Wenn die CD nicht erscheint

- Dreht das Laufwerk an? Wenn nicht, bekommt es vielleicht zu wenig Strom (siehe oben).
- Der Reiter **CD** erscheint nur bei reinen **Audio-CDs**, nicht bei Daten-CDs mit MP3-Dateien und nicht bei gemischten CDs (Audio und Daten). Solche Dateien kopierst du in die Bibliothek ([Eigene Hörspiele und Musik](../inhalte/lokale-medien.md)).
- Ist die Erweiterung unter **Einstellungen › System › Erweiterungen** eingeschaltet?
