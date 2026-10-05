# NAS

Ein **NAS** ist ein Netzwerkspeicher im Heimnetz, zum Beispiel eine Fritz!Box mit Speicher oder ein Synology-Gerät. Hörspiele und Musik, die dort liegen, kann die Box abspielen, ohne dass sie auf der Speicherkarte Platz brauchen.

Die Einrichtung findest du unter **Bibliothek › NAS**.

## Anmeldung

Die Box meldet sich per **WebDAV** beim NAS an. Auf dem NAS muss dafür ein WebDAV-Server laufen (bei Synology zum Beispiel Port 5005, für HTTPS 5006).

| Feld | Bedeutung |
| --- | --- |
| **Server (Adresse:Port)** | Adresse des NAS mit dem WebDAV-Port, zum Beispiel `192.168.1.10:5005` |
| **HTTPS** | verschlüsselt verbinden |
| **Benutzer** und **Passwort** | die Zugangsdaten für das NAS |
| **Anmeldung merken** | ohne diesen Schalter vergisst die Box das Passwort beim nächsten Neustart, der NAS-Reiter ist dann leer; gespeichert wird es verschlüsselt |

**Anmelden** verbindet die Box mit dem NAS. Danach zeigt die Seite Server, Benutzer und Status. **Andere Anmeldung** wechselt zu einem anderen NAS oder Konto, **Abmelden** trennt die Verbindung.

## Ordner auswählen

Nach der Anmeldung zeigt die Box die Ordner des NAS als Baum. Für jeden Ordner legst du fest:

- **Anzeigen**: erscheint auf der Box. Du wählst dabei, wo: im Reiter NAS oder in Hörspiele, Musik oder Radio & Podcasts, neben den Inhalten von Speicherkarte und Spotify.
- **Ausblenden**: bleibt verborgen, auch alles darunter.
- **Laden**: wird auf die Speicherkarte kopiert, damit er auch ohne NAS spielt.

Praktisch dafür:

- Das Suchfeld **Ordner auf dem ganzen NAS suchen** findet Ordner auch tief im Baum. Dafür braucht die Box einen Suchindex; **Index aktualisieren** liest die Ordner neu ein, wenn sich auf dem NAS etwas geändert hat.
- **Nur die Auswahl zeigen** listet nur die Ordner, die du angezeigt, ausgeblendet oder zum Laden markiert hast.
- **Alle anzeigen**, **Keine anzeigen**, **Alle laden** und **Keine laden** markieren schnell.

Mit **Auswahl speichern** übernimmst du die Wahl. **Ausgewählte herunterladen** kopiert die Ordner, die zum Laden markiert sind, auf die Speicherkarte; ein Balken zeigt den Fortschritt, **Download abbrechen** hält an. **Cover neu laden** holt die Cover erneut.

> [!NOTE]
> Vor dem Herunterladen prüft die Box, ob alles auf die Speicherkarte passt. Bricht ein Download ab, starte **Ausgewählte herunterladen** noch einmal: Dateien, die schon vollständig auf der Box sind, werden übersprungen. Ein Ordner spielt erst dann ohne NAS, wenn er ganz geladen ist.

## Profile

Ein **Profil** merkt sich die Ordner-Auswahl (Anzeigen, Ausblenden, Laden) für ein NAS und Konto, nicht das Passwort. **Auswahl als Profil speichern** legt ein neues an, zum Beispiel für jedes Kind eines. Mit **Laden** neben einem Profil wechselst du zu dessen Auswahl, **Löschen** entfernt es. Das Profil „Standard“ bleibt immer.

Auf dem Display erscheinen die angezeigten Ordner im Reiter **NAS** oder in der Kategorie, die du gewählt hast. Den Reiter NAS kannst du bei Bedarf ausblenden ([Die Startseite](../bedienung/startseite.md)).
