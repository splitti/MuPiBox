# Spotify spielt nicht

## Grundlagen

- Die Box braucht für Spotify **Internet** und ein **Spotify-Premium-Konto**.
- Die Verbindung zu Spotify steht unter **Bibliothek › Spotify**. Dort muss oben der Status **Angemeldet** stehen. Steht dort **Anmeldung läuft bald ab**, melde dich mit **Neu anmelden** wieder an: Spotify verlangt alle 6 Monate eine neue Anmeldung.

## Verbindung neu einrichten

Zeigt die Seite nichts oder einen Fehler, führe den **Einrichtungs-Assistenten** noch einmal durch ([Spotify](../inhalte/spotify.md)):

1. **Spotify-App** auf developer.spotify.com prüfen: **Client ID** und **Client Secret** müssen mit denen in der App übereinstimmen (**Bibliothek › Spotify › Zugangsdaten**).
2. Die **Redirect URI**, die die App dort zeigt (mit **Kopieren**), muss in deiner Spotify-App unter „Redirect URIs“ genau so eingetragen sein. Sonst lehnt Spotify die Anmeldung ab. Unter **Welche Adresse steht in deiner Spotify-App?** wählst du `/app/spotify-callback` oder, bei Boxen, die vor der App eingerichtet wurden, `/spotify.php`. **Warum zwei Adressen?** erklärt das.
3. **Bei Spotify anmelden**.

Hilft das nicht, löscht **Zugang zurücksetzen** (unter **Trennen & zurücksetzen** auf **Bibliothek › Spotify**) Client ID, Secret und Anmeldung. Richte den Zugang danach neu ein. Die Inhalte in der Bibliothek bleiben erhalten.

## Playlists tauchen nicht auf

Smart-Sync nimmt nur Playlists, deren Name mit dem **Playlist-Präfix** beginnt. Prüfe unter **Bibliothek › Spotify › Sync-Einstellungen**, ob **Automatischer Sync** an ist, und starte mit **Jetzt synchronisieren**. Ist der Sync dort aus, läuft er gar nicht, auch nicht von Hand. Inhalte, die schon von Hand auf der Box sind und auch in einer Playlist stehen, zeigt die Seite als **Konflikte**.

## Spotify blockiert Anfragen

Spotify begrenzt, wie oft eine App Fragen stellen darf. Wird das überschritten, antwortet Spotify eine Zeit lang nicht, bis die Sperre abgelaufen ist. Die Seite zeigt dann **Spotify-Sperre** mit der Uhrzeit, bis wann sie gilt. Das kann bei sehr vielen Playlists und Änderungen kurz hintereinander passieren. Warte in dem Fall ab und starte erst dann einen neuen Sync.

## Nur eine Box, ein Gerät

Spielt Spotify gleichzeitig auf einem anderen Gerät mit demselben Konto, kann die Wiedergabe dort stoppen. Beende die Wiedergabe auf dem anderen Gerät und starte sie auf der Box neu.
