# Synology Photos

Auf einem Synology-NAS mit **Synology Photos** kann die Box Alben und Ordner zeigen. Sie meldet sich mit einem eigenen Konto an. Du wählst, was am Display erscheint: die **Alben** des Kontos (auch die mit ihm geteilten) und **Ordner** aus dem **persönlichen Bereich** des Kontos und aus dem **gemeinsamen Bereich**.

## In DSM vorbereiten

Am besten legst du ein Konto nur für die Box an. Dann sieht sie nur, was du ausdrücklich mit ihr teilst.

1. In DSM unter **Systemsteuerung › Benutzer und Gruppe** ein Konto anlegen, zum Beispiel „mupibox“, **ohne** Zwei-Faktor-Anmeldung.
2. Beim Konto unter **Bearbeiten › Anwendungen** die App **Synology Photos** erlauben.
3. Für **Alben**: In Synology Photos ein Album öffnen, **Teilen** wählen und das Konto als **Betrachter** einladen. Ein öffentlicher Link ist nicht nötig.
4. Für Ordner des **gemeinsamen Bereichs**: Der Bereich muss in Synology Photos eingerichtet sein, und das Konto braucht Zugriff auf die Ordner (das stellt ein DSM-Administrator ein). Der **persönliche Bereich** gehört dem Konto der Box selbst; Ordner daraus gibt es nur, wenn du Fotos in dessen Bereich ablegst.

## Verbinden

Unter **Bibliothek › Fotos › Foto-Dienst verbinden › Synology Photos** führt ein Assistent durch drei Schritte:

1. **Anmeldung**: die **DSM-Adresse** (wie im Browser, meist `https://192.168.1.10:5001`; ohne Angabe nimmt die Box https und Port 5001), **Benutzername** und **Passwort**.
2. **Test**: Nutzt das NAS sein eigenes, selbst ausgestelltes Zertifikat, zeigt die Box dessen Fingerabdruck. Vergleiche ihn mit dem im NAS bzw. im Browser über das Schloss-Symbol und tippe nur bei Übereinstimmung auf **Vertrauen und testen**. Danach zeigt der Test Konto, Alben, davon geteilte, und die Anzahl der Fotos und Videos.
3. **Auswahl**: oben zwischen **Alben**, **Persönlicher Bereich**, **Gemeinsamer Bereich** und **Intelligent** umschalten und anhaken, was die Box zeigen soll, dann **Fertig**. In den Bereichen klappst du die Ordner mit dem Pfeil auf. Ein gewählter Ordner wird ein Album und enthält auch die Fotos der Ordner darin; die Ordner darin sind dann nicht noch einmal einzeln wählbar.

Das Passwort wird verschlüsselt auf der Box gespeichert und nie wieder angezeigt. Es gilt nur für die Adresse und das Konto, für die es eingegeben wurde. **Anmeldung ändern** auf der Seite von Synology Photos öffnet den Assistenten erneut. Wird das Zertifikat auf dem NAS erneuert, fragt die Box beim nächsten Test wieder nach.

| Meldung beim Test | Was tun |
| --- | --- |
| **Anmeldung abgelehnt** | Benutzername und Passwort prüfen, und ob das Konto aktiv ist |
| **Synology Photos nicht erlaubt** | dem Konto in DSM die App erlauben (siehe oben) |
| **Zweite Bestätigung verlangt** | ein Konto ohne Zwei-Faktor-Anmeldung nehmen |
| **Box von DSM gesperrt** | in DSM unter **Sicherheit › Schutz › Automatische Blockierung** die Adresse der Box wieder freigeben |
| **DSM nicht erreichbar** | Adresse, Port und Firewall prüfen; die Box muss DSM erreichen (nicht den WebDAV-Port) |

> [!NOTE]
> Lehnt DSM die Anmeldung ab, versucht es die Box mit denselben Daten 10 Minuten lang nicht erneut, damit DSM sie nicht sperrt. Nur **Verbindung testen** fragt sofort.

Clips liefert Synology Photos nur im Original, oft 4K vom Handy. Die Box wandelt sie deshalb selbst um, und **Videos gibt es nur mit „Fotos auf der Box speichern“**. Live zeigt sie nur die Fotos ([Foto-Dienste: speichern oder live](speichern-oder-live.md)).

## Intelligente Alben

Unter **Intelligent** bietet die Box an, was Synology Photos selbst zusammenstellt: **Zuletzt hinzugefügt** (die neuesten 300) und **Videos**, dazu je ein Album für jede **Person**, jeden **Ort**, jeden **Tag** und jedes **Motiv** (zum Beispiel „Strand“), das Synology Photos kennt. Die Listen sind einklappbar (die Zahl daneben sagt, wie viele Einträge es sind) und nach der Zahl der Fotos sortiert, die meisten zuerst. Eine Liste mit angehakten Einträgen ist beim Öffnen schon aufgeklappt. Die Alben ändern sich von selbst: Die Box gleicht sie mit ab wie alle anderen.

> [!NOTE]
> Personen, Orte, Tags und Motive zeigt die Box aus dem persönlichen **und** dem gemeinsamen Bereich; die aus dem gemeinsamen Bereich sind mit „Gemeinsamer Bereich“ gekennzeichnet. Benannte Personen liegen oft nur dort. Es gibt sie nur, wenn die Erkennung von Synology Photos für das Konto der Box eingeschaltet ist; Personen müssen einen Namen haben. Ein Konto, das nur Alben geteilt bekommt, hat meist keine. Ein Motiv-Album sucht in Synology Photos nach dem Namen des Motivs und kann deshalb ein, zwei Bilder von der Zahl in Synology Photos abweichen. **Favoriten** bietet die Box nicht an: Synology Photos gibt sie über die Schnittstelle nicht heraus. **Videos** zeigt die Box nur mit „Videos anzeigen“ und „Fotos auf der Box speichern“.
