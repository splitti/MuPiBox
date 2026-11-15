# NAS

Ein **NAS** ist ein Netzwerkspeicher im Heimnetz, zum Beispiel eine Fritz!Box mit Speicher oder ein Synology-Gerät. Hörspiele und Musik, die dort liegen, kann die Box abspielen, ohne dass sie auf der Speicherkarte Platz brauchen.

Die Einrichtung findest du unter **Bibliothek › NAS**.

## Anmeldung

Zuerst wählst du, wie die Box dein NAS erreicht:

- **Windows-Freigabe (SMB)**: so, wie ein Windows-PC auf das NAS zugreift. Synology, QNAP, eine FRITZ!Box mit USB-Speicher und ein Windows-PC mit freigegebenem Ordner können das ohne weitere Einrichtung. Für die meisten ist das der einfachste Weg.
- **WebDAV**: auf dem NAS muss dafür ein WebDAV-Server laufen (bei Synology zum Beispiel Port 5005, für HTTPS 5006).

| Feld | Bedeutung |
| --- | --- |
| **Freigabe** (SMB) | die Freigabe wie im Windows-Explorer, zum Beispiel `\\192.168.1.10\Musik`; auch `smb://192.168.1.10/Musik` geht. Steht ein Unterordner dahinter, öffnet die Seite den Ordnerbaum dort |
| **Domäne** (SMB) | meist leer; nur, wenn das NAS zu einer Windows-Domäne gehört |
| **Server (Adresse:Port)** (WebDAV) | Adresse des NAS mit dem WebDAV-Port, zum Beispiel `192.168.1.10:5005` |
| **HTTPS** (WebDAV) | verschlüsselt verbinden |
| **Benutzer** und **Passwort** | die Zugangsdaten für das NAS |
| **Anmeldung merken** | ohne diesen Schalter vergisst die Box das Passwort beim nächsten Neustart, der NAS-Reiter ist dann leer; gespeichert wird es verschlüsselt |

**Anmelden** verbindet die Box mit dem NAS. Danach zeigt die Seite Freigabe oder Server, Benutzer und Status. **Andere Anmeldung** wechselt zu einem anderen NAS oder Konto, **Abmelden** trennt die Verbindung.

> [!TIP]
> Nimm bei SMB die **IP-Adresse** des NAS. Den Windows-Namen eines Geräts (zum Beispiel `\\NAS`) kennt die Box oft nicht; ein Name mit `.local` oder `.fritz.box` geht meist.

Gut zu wissen bei SMB:

- Beim ersten Anmelden richtet die Box SMB ein (das Paket `cifs-utils`). Das dauert ein, zwei Minuten und braucht Internet.
- Die Box nutzt SMB2 und SMB3. Ein NAS, das nur das alte SMB1 kann, meldet die App; schalte dann SMB2 oder SMB3 auf dem NAS ein.
- Im Ordnerbaum ist die Freigabe der oberste Ordner. Ordner, die du vorher über WebDAV vom selben NAS gewählt hast, bleiben gewählt, wenn sie in dieser Freigabe liegen.
- Antwortet das NAS nicht mehr, spielt die Box die geladenen Ordner von der Speicherkarte und versucht es nach einer halben Minute wieder.
- Ein Cover, das du in der App für einen NAS-Ordner wählst, legt die Box auch per SMB in den Ordner, wenn der Benutzer dort schreiben darf.

## Ordner auswählen

Nach der Anmeldung zeigt die Box die Ordner des NAS als Baum. Für jeden Ordner legst du fest:

- **Anzeigen**: erscheint auf der Box. Du wählst dabei, wo: im Reiter NAS oder in Hörspiele, Musik oder Radio & Podcasts, neben den Inhalten von Speicherkarte und Spotify.
- **Ausblenden**: bleibt verborgen, auch alles darunter.
- **Laden**: wird auf die Speicherkarte kopiert, damit er auch ohne NAS spielt.

Praktisch dafür:

- Das Suchfeld **Ordner auf dem ganzen NAS suchen** findet Ordner auch tief im Baum. Dafür braucht die Box einen Suchindex; **Index aktualisieren** liest die Ordner neu ein, wenn sich auf dem NAS etwas geändert hat.
- **Suche in** legt fest, unter welchen Ordnern der Suchindex sucht, zum Beispiel nur „Hörspiele“. Ohne Auswahl ist es das ganze NAS; bei einem großen NAS dauert der Index dann lange (per SMB bei 40.000 Ordnern eine halbe Stunde und mehr). Die Wahl gehört zum Profil.
- **Nur die Auswahl zeigen** listet nur die Ordner, die du angezeigt, ausgeblendet oder zum Laden markiert hast.
- **Alle anzeigen**, **Keine anzeigen**, **Alle laden** und **Keine laden** markieren schnell.

Mit **Auswahl speichern** übernimmst du die Wahl. **Ausgewählte herunterladen** kopiert die Ordner, die zum Laden markiert sind, auf die Speicherkarte; ein Balken zeigt den Fortschritt, **Download abbrechen** hält an. **Cover neu laden** holt die Cover erneut.

> [!NOTE]
> Vor dem Herunterladen prüft die Box, ob alles auf die Speicherkarte passt. Bricht ein Download ab, starte **Ausgewählte herunterladen** noch einmal: Dateien, die schon vollständig auf der Box sind, werden übersprungen. Ein Ordner spielt erst dann ohne NAS, wenn er ganz geladen ist.

## Profile

Ein **Profil** merkt sich die Ordner-Auswahl (Anzeigen, Ausblenden, Laden) für ein NAS und Konto, nicht das Passwort. **Auswahl als Profil speichern** legt ein neues an, zum Beispiel für jedes Kind eines. Mit **Laden** neben einem Profil wechselst du zu dessen Auswahl, **Löschen** entfernt es. Das Profil „Standard“ bleibt immer.

Auf dem Display erscheinen die angezeigten Ordner im Reiter **NAS** oder in der Kategorie, die du gewählt hast. Den Reiter NAS kannst du bei Bedarf ausblenden ([Die Startseite](../bedienung/startseite.md)).

Fotos vom NAS wählst du getrennt davon unter **Bibliothek › Fotos** ([NAS-Ordner](../fotos/nas-ordner.md)).
