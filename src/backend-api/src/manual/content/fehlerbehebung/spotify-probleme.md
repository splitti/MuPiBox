# Spotify spielt nicht

## Grundlagen

- Die Box braucht für Spotify **Internet** und ein **Spotify-Premium-Konto**.
- Die Verbindung zu Spotify steht unter **Bibliothek › Spotify**. Dort muss der Status **Verbunden** zeigen.

## Verbindung neu einrichten

Zeigt die Seite nichts oder einen Fehler, führe den **Einrichtungs-Assistenten** noch einmal durch ([Spotify](../inhalte/spotify.md)):

1. **Spotify-App** auf developer.spotify.com prüfen: **Client ID** und **Client Secret** müssen mit denen in der App übereinstimmen.
2. Die **Redirect-URI**, die die Box in Schritt 2 anzeigt, muss in der Spotify-App genau so eingetragen sein. Spotify nimmt dafür eine Adresse mit `https://` über den Port der Box. Die App zeigt unter **Warum zwei Adressen?**, welche Adresse für deine Box gilt.
3. **Mit Spotify verbinden** und die Verbindung testen.

Hilft das nicht, setzt **Spotify-Zugang zurücksetzen** (**Bibliothek › Spotify**) die Zugangsdaten des Players zurück. Richte ihn danach neu ein.

## Playlists tauchen nicht auf

Smart-Sync nimmt nur Playlists, deren Name mit dem **Playlist-Präfix** beginnt. Prüfe unter **Bibliothek › Spotify › Sync-Einstellungen**, ob der automatische Sync an ist, und starte mit **Jetzt synchronisieren**. Playlists, die schon von Hand auf der Box sind, meldet die Seite als **Konflikte**.

## Spotify blockiert Anfragen

Spotify begrenzt, wie oft eine App Fragen stellen darf. Wird das überschritten, antwortet Spotify eine Zeit lang nicht, bis die Sperre abgelaufen ist. Das kann bei sehr vielen Playlists und Änderungen kurz hintereinander passieren. Warte in dem Fall etwas ab und starte erst dann einen neuen Sync.

## Nur eine Box, ein Gerät

Spielt Spotify gleichzeitig auf einem anderen Gerät mit demselben Konto, kann die Wiedergabe dort stoppen. Beende die Wiedergabe auf dem anderen Gerät und starte sie auf der Box neu.
