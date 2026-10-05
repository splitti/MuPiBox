# Protokolle und Zustand

## Zustand der Box

**Einstellungen › System › Zustand der Box** zeigt auf einen Blick, ob alles in Ordnung ist: **Speicherplatz**, **Temperatur**, **Stromversorgung**, **SD-Karte**, **Arbeitsspeicher**, **Dienste der Box**, **Internet**, **NAS**, **Spotify-Anmeldung**, **Zertifikat (HTTPS)** und **Gespeicherte Podcast-Folgen**. Stimmt etwas nicht, steht dabei, was zu tun ist. **Neu prüfen** prüft noch einmal.

Ähnliches steht auf der Seite **Über die Box**: **Version**, **Hostname**, **Läuft seit**, **CPU-Last**, **Temperatur**, **Arbeitsspeicher** und der Platz auf der **SD-Karte**. Darunter zeigt ein **Verlauf** der letzten 1, 6 oder 24 Stunden, wie sich die Werte entwickelt haben. Gemessen wird einmal pro Minute, nur im Arbeitsspeicher der Box. Nach einem Neustart beginnt der Verlauf neu.

## Protokolle

**Einstellungen › System › Protokolle** zeigt die Logdateien der Box und den Status ihrer Dienste.

1. Wähle unter **Log oder Dienst** einen Eintrag: ein **Log** oder unter **Dienste (Status)** einen Dienst. Die Logs sind die des Servers (`server-out.log`, `server-error.log`), des Players (`spotify-control-out.log`, `spotify-control-error.log`), des automatischen Ausschaltens (`idle_shutdown.log`) und des Ausschalt-Tasters (`shutdown_control.log`).
2. Mit **Suche** filterst du auf einen Begriff.
3. **Aktualisieren** lädt neu, **Mitlaufen** zeigt neue Zeilen laufend an (**Anhalten** stoppt das), **Herunterladen** speichert den gewählten Eintrag.

### Fehlersuche

Mit **Ausführliches Player-Log** schreibt der Player viel mehr in sein Log (`spotify-control`). Der Player startet dafür neu. Schalte es nur ein, wenn du einem Problem auf der Spur bist, und danach wieder aus, denn es füllt die Logs.

## Support-Infos für die Hilfe

Brauchst du Hilfe, zum Beispiel im [Discord](https://discord.gg/4EjCgpCbbe), tippe unter **Einstellungen › System › Über die Box › Support** auf **Support-Infos herunterladen**. Das Zip enthält die Bibliothek (`data.json`), die Einstellungen ohne Passwörter, Tokens und Konten, den Zustand von Display und Netzwerk und die Versionen. Logs sind nicht dabei: Lade sie bei Bedarf unter **Protokolle** mit **Herunterladen** dazu.

## Die Logs schonen die SD-Karte

Standardmäßig landen die Logs von Server und Player auf der Speicherkarte. Wer sie schonen will, schaltet unter **Systemoptionen** **PM2-Logs im RAM** ein. Die Logs gehen dann beim Neustart verloren ([System- und Experteneinstellungen](system.md)).
