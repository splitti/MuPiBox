# PhotoPrism

Die Box zeigt Alben aus **PhotoPrism**, die du auswählst. Private und archivierte Fotos bleiben draußen.

## In PhotoPrism vorbereiten

Die Box meldet sich mit einem **App-Passwort** an, nicht mit dem richtigen Passwort. Ein App-Passwort lässt sich jederzeit einzeln widerrufen.

1. In PhotoPrism unter **Einstellungen › Konto › Apps und Geräte** auf **Hinzufügen** tippen.
2. Einen Namen eingeben, zum Beispiel „MuPiBox“. **Berechtigung** auf **Voller Zugriff** lassen, **Ablaufdatum** am besten **Nie**.
3. Das angezeigte App-Passwort kopieren. PhotoPrism zeigt es nur dieses eine Mal.

Fotos, die die Box zeigen soll, liegen in PhotoPrism in **Alben**. Ordner, Momente und Kalender-Alben zeigt die Box nicht.

## Verbinden

Unter **Bibliothek › Fotos › Foto-Dienst verbinden › PhotoPrism** führt ein Assistent durch drei Schritte:

1. **Anmeldung**: die **PhotoPrism-Adresse** wie im Browser, ohne `/library/…` dahinter (zum Beispiel `http://192.168.1.20:2342`), und das **App-Passwort**.
2. **Test**: Nutzt PhotoPrism ein eigenes, selbst ausgestelltes Zertifikat, zeigt die Box dessen Fingerabdruck. Vergleiche ihn mit dem im Browser über das Schloss-Symbol und tippe nur bei Übereinstimmung auf **Vertrauen und testen**. Danach zeigt der Test Konto, Alben und die Anzahl der Fotos und Videos.
3. **Alben**: die Alben anhaken und **Fertig**.

Das App-Passwort wird verschlüsselt auf der Box gespeichert und nie wieder angezeigt. Es gilt nur für die Adresse, für die es eingegeben wurde. **Anmeldung ändern** auf der Seite von PhotoPrism öffnet den Assistenten erneut.

| Meldung beim Test | Was tun |
| --- | --- |
| **App-Passwort abgelehnt** | App-Passwort prüfen, notfalls ein neues erstellen; das Anmeldepasswort funktioniert hier nicht |
| **Kein PhotoPrism gefunden** | Adresse prüfen, meist endet sie auf `:2342` |
| **PhotoPrism nicht erreichbar** | Adresse und Netz prüfen; die Box muss PhotoPrism erreichen |

## Was die Box zeigt

Die Bilder kommen als Vorschaubilder von PhotoPrism in Anzeigegröße. Clips liefert PhotoPrism so, wie es sie auch im Browser abspielt (MP4). Videos gibt es deshalb **auch live** ([Foto-Dienste: speichern oder live](speichern-oder-live.md)). Live-Fotos zeigt die Box als Standbild.

Ist das App-Passwort abgelaufen oder widerrufen, zeigt die Seite von PhotoPrism **Anmeldung abgelehnt**. Gespeicherte Fotos bleiben so lange am Display.
