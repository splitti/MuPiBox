# Nextcloud

Die Box zeigt Alben der Nextcloud-App **Fotos**: die eigenen Alben eines Kontos und alle Alben, die mit ihm geteilt sind.

## In Nextcloud vorbereiten

Am besten legst du ein Konto nur für die Box an. Dann sieht sie nur, was du ausdrücklich mit ihr teilst.

1. In Nextcloud ein Konto anlegen, zum Beispiel „mupibox“. Die App **Fotos** muss eingeschaltet sein (sie ist es normalerweise).
2. Mit diesem Konto anmelden und unter **Persönliche Einstellungen › Sicherheit** mit **Neues App-Passwort erstellen** ein App-Passwort für die Box anlegen. So bleibt das richtige Passwort außen vor, und das App-Passwort lässt sich jederzeit einzeln widerrufen.
3. In der App **Fotos** ein Album mit diesem Konto teilen, oder mit dem Konto selbst Alben anlegen.

## Verbinden

Unter **Bibliothek › Fotos › Foto-Dienst verbinden › Nextcloud** führt ein Assistent durch drei Schritte:

1. **Anmeldung**: die **Nextcloud-Adresse** wie im Browser, ohne `/apps/…` dahinter (zum Beispiel `https://cloud.example.de`), der **Benutzername** und das **App-Passwort**.
2. **Test**: Nutzt die Nextcloud ein eigenes, selbst ausgestelltes Zertifikat, zeigt die Box dessen Fingerabdruck. Vergleiche ihn mit dem im Browser über das Schloss-Symbol und tippe nur bei Übereinstimmung auf **Vertrauen und testen**. Danach zeigt der Test Konto, Alben, davon geteilte, und die Anzahl der Fotos und Videos.
3. **Alben**: die Alben anhaken und **Fertig**.

Das App-Passwort wird verschlüsselt auf der Box gespeichert und nie wieder angezeigt. Es gilt nur für die Adresse und das Konto, für die es eingegeben wurde. **Anmeldung ändern** auf der Seite von Nextcloud öffnet den Assistenten erneut.

| Meldung beim Test | Was tun |
| --- | --- |
| **Anmeldung abgelehnt** | Benutzername und App-Passwort prüfen, notfalls ein neues App-Passwort erstellen |
| **Fotos-App fehlt** | in Nextcloud unter **Apps** die App **Fotos** einschalten |
| **Nextcloud nicht erreichbar** | Adresse und Netz prüfen; die Box muss die Nextcloud erreichen |

## Was die Box zeigt

Die Bilder kommen als Vorschaubilder der Nextcloud in Anzeigegröße. Kann die Nextcloud von einem Foto kein Vorschaubild machen (zum Beispiel iPhone-Fotos, wenn dort keine HEIC-Vorschau eingerichtet ist), holt die Box mit **Fotos auf der Box speichern** das Original und wandelt es selbst um. Live fehlt ein solches Foto.

Clips liefert Nextcloud so, wie sie hochgeladen wurden. Die Box wandelt sie deshalb selbst um, und **Videos gibt es nur mit „Fotos auf der Box speichern“** ([Foto-Dienste: speichern oder live](speichern-oder-live.md)).
