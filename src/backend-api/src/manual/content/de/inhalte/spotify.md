# Spotify

Spotify spielt auf der Box im Browser des Displays, über das Web Playback SDK von Spotify. Du brauchst dafür ein Spotify-Konto und eine eigene **Spotify-App** auf developer.spotify.com. Das klingt aufwendiger, als es ist: Ein Assistent führt dich in fünf Schritten.

> [!IMPORTANT]
> Zum Abspielen von Spotify braucht die Box ein Spotify-Premium-Konto. Das ist eine Vorgabe von Spotify, nicht der Box.

## Einrichten

**Bibliothek › Spotify › Einrichtungs-Assistent**:

| Schritt | Was du tust |
| --- | --- |
| 1 | Auf developer.spotify.com mit deinem Spotify-Konto anmelden und **Create app** wählen |
| 2 | Die angezeigten Werte in die Spotify-App eintragen (App name, App description, Redirect URI; die Redirect URI lässt sich mit einem Knopf kopieren). Bei den APIs die „Web API“ und das „Web Playback SDK“ ankreuzen |
| 3 | **Client ID** und **Client Secret** aus der Spotify-App eintragen. Sie stehen dort unter **Settings**; das Secret zeigt **View client secret**. Dann **Speichern und weiter** |
| 4 | **Mit Spotify verbinden**: bei Spotify anmelden und zustimmen, danach kommst du in die App zurück. Dann **Weiter** |
| 5 | optional: **Playlist-Präfix** festlegen und **Smart-Sync einschalten**, oder **Ohne Smart-Sync** abschließen (siehe unten) |

Spotify lässt eine Anmeldung 6 Monate gelten. Die Box erinnert 14 und 3 Tage vorher, in der App und per Telegram. **Neu anmelden** steht auf der Seite **Spotify**.

Die Zugangsdaten siehst und änderst du später unter **Bibliothek › Spotify › Zugangsdaten**. Ganz löschen kannst du sie auf der Seite **Spotify** unter **Trennen & zurücksetzen › Zugang zurücksetzen**. Die Inhalte in der Bibliothek bleiben dabei erhalten.

## Inhalte hinzufügen

### Auf Spotify suchen

**Bibliothek › Auf Spotify suchen**: Gib einen Suchbegriff ein, wähle, ob in **Alle**, **Künstler**, **Alben** oder **Titel** gesucht wird, und wähle unter **Hinzufügen als** die Kategorie. Aus den Treffern fügst du mit ＋ hinzu:

- ein **Album**,
- einen **Künstler**: Das legt ein Künstler-Abo an, alle Folgen kommen auf die Box, neue später von selbst ([Inhalte verwalten](verwalten.md)),
- bei einem **Titel** das ganze Album, auf dem er ist.

### Link einfügen

**Bibliothek › Link einfügen** nimmt direkt eine Spotify-Adresse: Album, Playlist, Interpret, Podcast oder Hörbuch. Als **Typ** wählst du **Spotify-Link**. Weitere Felder:

| Feld | Bedeutung |
| --- | --- |
| **Interpret / Name** (optional) | eigener Name für den Eintrag |
| **Kategorie** | Hörbuch/Hörspiel, Musik oder Radio & Podcasts |
| **Cover** und **Interpret-Cover** (optional) | Bild-Adressen, wenn Spotifys Bild nicht passt |
| **Sortierung** | Standard (Podcasts: neueste Folge zuerst, sonst alphabetisch), A–Z, Z–A, älteste oder neueste zuerst |
| **Zufällig abspielen** | die Titel in zufälliger Reihenfolge |
| **Nur einen Teil der Folgen** | z. B. nur Folge 1 bis 20 einer Serie, gezählt in der Reihenfolge von Spotify |

Als Typ gibt es außerdem **Spotify-Suche**: Statt eines einzelnen Albums speicherst du eine Suche als Eintrag. Das Feld heißt dann **Suchbegriff**. Die Box zeigt alle gefundenen Alben (höchstens 100) gesammelt unter einer Kachel. Du formulierst die Suche mit den Suchfiltern von Spotify, zum Beispiel:

```
artist:"Name der Reihe" AND album:"Folge"
```

Das Feld **Name der Kachel** ist Pflicht: So heißt die Kachel auf dem Display. Mit einem zweiten Eintrag, etwa `artist:"Name der Reihe" AND album:"Band"`, entstehen aus einem Künstler zwei getrennte Kacheln.

## Smart-Sync: Playlists automatisch auf die Box

Mit **Smart-Sync** landen Spotify-Playlists, deren Name mit dem **Playlist-Präfix** beginnt, automatisch auf der Box. Beispiel: Heißt der Präfix „MuPiBox“, dann erscheinen alle Playlists, die so anfangen, etwa „MuPiBox Hörspiele“, ohne weiteres Zutun.

Unter **Bibliothek › Spotify › Sync-Einstellungen** stellst du ein:

- den **Playlist-Präfix** (vorbelegt mit dem Namen der Box),
- das **Sync-Intervall**: wie oft die Box bei Spotify nach Änderungen schaut, 5 bis 60 Minuten,
- ob der **Automatische Sync** an ist. Ist er aus, gibt es gar keinen Sync, auch nicht von Hand. Die Inhalte auf der Box bleiben.

Mit **Speichern** übernimmst du die Werte. Läuft Smart-Sync, startet **Jetzt synchronisieren** auf der Seite **Spotify** einen Sync sofort.

Die Seite **Spotify** zeigt außerdem die gefundenen Playlists und **Konflikte**: Inhalte, die schon von Hand auf der Box sind und auch in einer Playlist stehen. **Vom Sync verwalten** übergibt so einen Eintrag an den Sync.

## Wenn etwas nicht klappt

[Spotify spielt nicht](../fehlerbehebung/spotify-probleme.md).
