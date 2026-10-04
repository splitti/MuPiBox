# Protokolle und Zustand

## Zustand der Box

**Einstellungen › System › Zustand der Box** zeigt auf einen Blick, ob alles in Ordnung ist: **Speicher**, **Temperatur**, **Strom**, **SD-Karte**, die laufenden **Dienste** und die **Anmeldungen**.

Ähnliches steht auf der Seite **Über die Box**: **Version**, **Hostname**, **Läuft seit**, **CPU-Last**, **Temperatur**, **Arbeitsspeicher** und der Platz auf der **SD-Karte**. Darunter zeigt ein **Verlauf** der letzten 1, 6 oder 24 Stunden, wie sich die Werte entwickelt haben. Gemessen wird einmal pro Minute, nur im Arbeitsspeicher der Box. Nach einem Neustart beginnt der Verlauf neu.

## Protokolle

**Einstellungen › System › Protokolle** zeigt die Logdateien der Box und den Status ihrer Dienste.

1. Wähle unter **Log oder Dienst** eine Datei: ein **Log** (zum Beispiel vom automatischen Ausschalten), ein **PM2-Log** (die Meldungen des Servers und des Spotify-Players) oder den **Status** eines Dienstes.
2. Mit **Suche (grep)** filterst du auf einen Begriff.
3. **Aktualisieren** lädt neu, **Pause** hält die Ansicht an, **Herunterladen** speichert die Datei.

### Fehlersuche

Mit **Controller-Debugging** schreibt der Player ausführlichere Logs. Schalte es nur ein, wenn du einem Problem auf der Spur bist, denn es füllt die Logs. **PM2-Log herunterladen** speichert das Protokoll der Dienste.

> [!TIP]
> Willst du ein Problem melden, brauchst du die Logs nicht selbst einzusammeln: Der [Problembericht](problem-melden.md) packt das Ende der Logs für dich ein.

## Die Logs schonen die SD-Karte

Standardmäßig landen die Logs der Dienste auf der Speicherkarte. Wer sie schonen will, schaltet unter **Systemoptionen** **PM2-Logs im RAM** ein. Die Logs gehen dann beim Neustart verloren ([System- und Experteneinstellungen](system.md)).
