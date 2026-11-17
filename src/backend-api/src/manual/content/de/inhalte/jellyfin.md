# Jellyfin

Hast du deine Hörspiele, Hörbücher und Musik in einem **Jellyfin**-Server (etwa auf dem NAS oder einem PC im Heimnetz), spielt die Box sie direkt von dort. Du wählst Alben, Hörbücher, Künstler und Playlists so aus, wie Jellyfin sie ordnet – mit ihren Covern. Jellyfin ist frei und läuft bei dir zu Hause; die Box braucht dafür kein Internet, nur das Heimnetz.

## Verbinden

Die Seite findest du unter **Einstellungen › Dienste › Jellyfin**. Ein Assistent führt durch drei Schritte:

1. **Server:** **Im Heimnetz suchen** findet Jellyfin-Server, die sich im selben Netz melden; tippe deinen an. Steht der Server in einem anderen Netz (VLAN), trägst du die Adresse ein, z. B. `http://192.168.1.20:8096`. Ohne Port nimmt die Box 8096. Nutzt dein Jellyfin https mit einem eigenen (selbst signierten) Zertifikat, zeigt die Box seinen Fingerabdruck – vergleiche ihn im Browser über das Schloss-Symbol und bestätige ihn nur, wenn er übereinstimmt.
2. **Anmelden:** Die Box zeigt einen sechsstelligen **Quick-Connect-Code**. Öffne Jellyfin auf dem Handy oder im Browser, angemeldet mit dem Konto, dessen Bibliothek die Box spielen soll, und gib den Code unter **Profil › Quick Connect** ein. Ist Quick Connect in Jellyfin ausgeschaltet (Dashboard › Allgemein), meldest du dich mit **Benutzername und Passwort** an. Das Passwort nutzt die Box nur für die Anmeldung; gespeichert wird nur ein Zugangsschlüssel (Token), verschlüsselt auf der Box.
3. **Bibliotheken:** Wähle, aus welchen Bibliotheken die App Inhalte zum Hinzufügen anbietet. Keine gewählt heißt: alle, die die Box abspielen kann (Musik, Bücher, Playlists).

Am besten legst du in Jellyfin ein eigenes Konto für die Box an, mit Zugriff nur auf die Bibliotheken der Kinder.

Danach zeigt die Seite Server, Version, Konto und Bibliotheken. In Jellyfin erscheint die Box unter **Geräte** als „MuPiBox“ mit dem Namen der Box.

- **Jellyfin verwenden** schaltet Jellyfin aus, ohne die Anmeldung zu löschen. Einträge aus Jellyfin bleiben dann in der Bibliothek, werden aber nicht angezeigt und nicht gespielt.
- **Adresse ändern** gilt für denselben Server unter neuer Adresse (z. B. neue IP); die Anmeldung bleibt. Ist es ein anderer Server, meldest du dich dort neu an. Einträge aus dem Jellyfin von vorher spielen dann nicht mehr; lösche sie in der Bibliothek und füge sie aus dem neuen Server hinzu.
- **Abmelden** beendet die Anmeldung auch in Jellyfin (das Gerät verschwindet dort). Die Einträge bleiben in der Bibliothek und spielen nach einer neuen Anmeldung wieder.

## Inhalte hinzufügen

Unter **Bibliothek › Hinzufügen › Aus Jellyfin** stehen die gewählten Bibliotheken; darüber suchst du in allen nach Namen.

- **Musik:** Künstler oder Alben. Ein **Album** antippen, die Kategorie wählen und **Hinzufügen**. Ein **Künstler** zeigt seine Alben zum einzelnen Hinzufügen; **Ganzen Künstler hinzufügen** legt einen Eintrag für alle seine Alben an – auch für solche, die später in Jellyfin dazukommen. Box und App zeigen ihn als Ordner.
- **Hörbücher:** Ein Hörbuch aus mehreren Dateien (ein Ordner je Buch) ist ein Eintrag; seine Dateien sind die Titel. Liegen mehrere Bücher in einem Ordner, trennt die Box sie über das Album-Tag der Dateien. Ein Buch in einer Datei (M4B) ist ebenfalls ein Eintrag. Ein Buch, dessen Dateien in Unterordnern liegen (CD1, CD2 …), erscheint als ein Eintrag je Unterordner.
- **Playlists:** deine Audio-Playlists aus Jellyfin. Wie bei Spotify wählst du unter **Auf der Startseite**, ob sie eine eigene Kachel bekommt oder in einem Ordner steht.

Bei einem ganzen Künstler stellst du in der **Bibliothek** (Eintrag antippen) die **Reihenfolge am Display** ein und schaltest einzelne Alben mit ihrem Schalter ab.

Ändert sich ein Album oder eine Playlist in Jellyfin, spielt die Box beim nächsten Start den neuen Stand.

## Abspielen

Ein Jellyfin-Album spielt wie ein Album von der Speicherkarte: mit Titelliste, Vor und Zurück, Spulen, **Weiterhören**, Gehört-Haken und dem Tageslimit seiner Kachel. Aus der App startest du es unter **Hören**. Spielzeit und Ruhezeiten gelten auch hier.

Die Box spielt die Dateien im Original. Bei großen Dateien (FLAC) und schwachem WLAN hilft **Für schwaches WLAN umwandeln** (auf der Seite **Jellyfin** unter **Wiedergabe**): Jellyfin wandelt dann jeden Titel in MP3 mit 192 kbit um. Dafür geht Spulen nicht, und **Weiterhören** beginnt den Titel von vorn (an der richtigen Stelle im Album).

## Fortschritt mit Jellyfin teilen

Mit **Fortschritt mit Jellyfin teilen** (Standard aus) hält die Box Jellyfin auf dem Laufenden:

- Sie meldet, was sie spielt und wo sie im Titel ist. Zu Ende gehörte Titel setzt Jellyfin auf **gespielt**.
- Startest du ein Album oder Hörbuch an der Box neu (nicht über **Weiterhören**), beginnt es dort, wo das Konto in Jellyfin aufgehört hat – auch wenn zwischendurch am Handy weitergehört wurde. Bei Hörbüchern ist das das erste noch nicht gespielte Kapitel.
- Ist ein Album in Jellyfin ganz gespielt, bekommt es an der Box den grünen Gehört-Haken – spätestens nach zehn Minuten.

Jellyfin merkt sich bei Hörbüchern eine Stelle mitten im Kapitel erst ab 5 Minuten und wertet die letzten Minuten als gespielt (einstellbar im Jellyfin-Dashboard unter Wiedergabe › Fortsetzen).

> [!NOTE]
> Antwortet Jellyfin nicht (Server aus, im Ruhezustand, anderes Netz), blendet das Display seine Einträge aus, bis es wieder antwortet – die Box fragt jede Minute nach. In der Bibliothek der App bleiben sie. Ist die Box in Jellyfin abgemeldet, sagt die Seite **Jellyfin** das und bietet **Neu anmelden** an.
