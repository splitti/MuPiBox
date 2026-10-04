# Spotify

Die Box spielt Spotify über ihren eigenen Player ab. Du brauchst dafür ein Spotify-Konto und eine eigene **Spotify-App** auf developer.spotify.com. Das klingt aufwendiger, als es ist: Ein Assistent führt dich in fünf Schritten.

> [!IMPORTANT]
> Zum Abspielen von Spotify braucht die Box ein Spotify-Premium-Konto. Das ist eine Vorgabe von Spotify, nicht der Box.

## Einrichten

**Bibliothek › Spotify › Einrichtungs-Assistent**:

| Schritt | Was du tust |
| --- | --- |
| 1 | Auf developer.spotify.com anmelden und **Create app** wählen |
| 2 | Die angezeigten Werte in die Spotify-App kopieren (die Felder lassen sich mit einem Knopf kopieren) |
| 3 | **Client ID** und **Client Secret** aus der Spotify-App kopieren. Sie stehen dort unter **Settings**; das Secret zeigt **View client secret**. Dann **Speichern + weiter** |
| 4 | **Mit Spotify verbinden** und die Verbindung testen |
| 5 | **Playlist-Präfix** festlegen (siehe unten) und **Fertig** |

Die Zugangsdaten des Players kannst du später unter **Bibliothek › Spotify › Zugang des Players** ansehen und ändern. **Spotify-Zugang zurücksetzen** löscht sie wieder.

## Inhalte hinzufügen

### Auf Spotify suchen

**Bibliothek › Auf Spotify suchen**: Gib einen Suchbegriff ein, wähle, ob in **Alle**, **Künstler**, **Alben** oder **Titel** gesucht wird, und wähle die Kategorie, in die das Ergebnis soll. Aus den Treffern fügst du Alben, Künstler oder Titel mit einem Tipp hinzu.

### Link einfügen

**Bibliothek › Link einfügen** nimmt direkt eine Spotify-Adresse: Album, Playlist, Interpret, Podcast oder Hörbuch. Als **Typ** wählst du **Spotify-Link**. Weitere Felder:

| Feld | Bedeutung |
| --- | --- |
| **Interpret / Name** (optional) | eigener Name für den Eintrag |
| **Kategorie** | Hörbuch, Hörspiel, Musik oder Radio & Podcasts |
| **Cover** und **Interpret-Cover** (optional) | Bild-Adressen, wenn Spotifys Bild nicht passt |
| **Sortierung** | Standard (Podcasts: neueste Folge zuerst, sonst alphabetisch), A–Z, Z–A, älteste oder neueste zuerst |
| **Zufällig abspielen** | die Titel in zufälliger Reihenfolge |
| **Nur einen Teil der Folgen** | z. B. nur Folge 1 bis 20 einer Serie, gezählt in der Reihenfolge von Spotify |

Als Typ gibt es außerdem **Spotify-Suche**: Statt eines einzelnen Albums speicherst du eine Suche als Eintrag. Die Box zeigt dann alle Treffer als Sammlung. Du formulierst sie mit den Suchfiltern von Spotify, zum Beispiel:

```
artist:"LEGO Ninjago" AND album:"Folge"
```

Der **Name der Sammlung** (Feld „Interpret / Name“) ist die Überschrift der Sammlung auf dem Display. Mit einem zweiten Eintrag `artist:"LEGO Ninjago" AND album:"Band"` entstehen so aus einem Künstler zwei getrennte Sammlungen.

## Smart-Sync: Playlists automatisch auf die Box

Mit **Smart-Sync** landen Spotify-Playlists, deren Name mit dem **Playlist-Präfix** beginnt, automatisch auf der Box. Beispiel: Heißt der Präfix „MuPiBox-Hörspiele“, dann erscheinen alle Playlists, die so anfangen, ohne weiteres Zutun.

Unter **Bibliothek › Spotify › Sync-Einstellungen** stellst du ein:

- den **Playlist-Präfix** (vorbelegt mit dem Namen der Box),
- das **Sync-Intervall**: wie oft die Box bei Spotify nach Änderungen schaut, 5 bis 60 Minuten,
- ob der **automatische Sync** an ist. Ist er aus, bleibt **Jetzt synchronisieren** manuell möglich.

Die Seite **Spotify** zeigt die **gefundenen Playlists** und **Konflikte**: Inhalte, die schon von Hand auf der Box sind.

## Wenn etwas nicht klappt

[Spotify spielt nicht](../fehlerbehebung/spotify-probleme.md).
