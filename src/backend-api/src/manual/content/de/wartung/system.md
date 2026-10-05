# System- und Experteneinstellungen

Diese Einstellungen unter **Einstellungen › System** brauchst du selten. Sie sind für Fortgeschrittene, und manche können die Box lahmlegen. Mache vorher ein [Backup](backup.md).

## Systemoptionen

**Einstellungen › System › Systemoptionen**. Alles hier gilt erst nach einem Neustart der Box, nur der CPU-Governor gilt sofort.

| Einstellung | Wirkung |
| --- | --- |
| **SD-Karte übertakten** | schnellerer Zugriff auf die SD-Karte. Manche Karten laufen damit nicht stabil, die App fragt deshalb vorher nach |
| **PM2-Logs im RAM** | die Logs von Server und Player im Arbeitsspeicher statt auf der SD-Karte. Das schont sie, die Logs gehen aber beim Neustart verloren |
| **Beim Start auf Netzwerk warten** | die Box wartet beim Hochfahren aufs Netzwerk (langsamerer Start, dafür gleich online) |
| **Turbo beim Start** | höherer Takt in den ersten 30 Sekunden, für einen schnelleren Start |
| **CPU-Governor** | die Art, wie der Prozessor seinen Takt regelt (zum Beispiel ondemand = nach Bedarf) |
| **Unterspannungs-Warnungen ausblenden** | blendet das Blitz-Symbol bei zu schwacher Stromversorgung aus |
| **SWAP** | Auslagerungsdatei auf der SD-Karte |

> [!WARNING]
> Eine Unterspannungs-Warnung heißt, dass das Netzteil oder das Kabel zu schwach ist. Das ist die häufigste Ursache für Aussetzer. Behebe sie, statt sie auszublenden.

## Browser (Chromium)

Das Display ist ein Browser im Kiosk-Modus. **Einstellungen › System › Browser (Chromium)**:

| Einstellung | Wirkung |
| --- | --- |
| **GPU-Unterstützung (experimentell)** | Grafik über die GPU |
| **Sanftes Scrollen (experimentell)** | flüssigeres Scrollen |
| **Kiosk-Modus** | Vollbild ohne Bedienelemente des Browsers. Aus = mit Fensterrahmen, nur zum Testen |
| **Cache-Größe** | 0 bis 512 MB |
| **Chrome-Debugging** | schreibt ein ausführliches Log des Browsers. Nach der Fehlersuche wieder aus |

Die Änderungen gelten nach einem Neustart des Displays. Den startest du gleich mit **Übernehmen und Display neu starten**.

## Experten

**Einstellungen › System › Experten**:

- **Hostname**: der Name der Box im Netzwerk, zum Beispiel `mupibox` (erreichbar als `mupibox.local`). Nur Buchstaben, Ziffern und Bindestrich. Wird nach einem Neustart übernommen.
- **Weitere Werkzeuge**: das **DietPi-Dashboard** (Systemverwaltung von DietPi, Port 5252) und das **Bisherige Admin-Interface**. Beide öffnen sich in einem neuen Fenster.
- **Konfiguration direkt bearbeiten**: ein Editor für die JSON-Dateien der Box. Unter **Datei** wählst du, welche, zum Beispiel `mupiboxconfig.json` (Box), `data.json` (Bibliothek) oder `config.json` (Server).
- **Zurücksetzen**: **Box-Konfiguration zurücksetzen** (alle Einstellungen auf den Stand der installierten Version, das Passwort bleibt), **Bibliothek leeren** (alle Einträge der Bibliothek weg, die Dateien bleiben) und **Server-Konfiguration zurücksetzen**.

> [!WARNING]
> Falsche Werte in der Konfiguration können die Box **lahmlegen**, und Zurücksetzen lässt sich nicht rückgängig machen. Mache vorher ein [Backup](backup.md).

## Sprache

**Einstellungen › System › Sprache**:

- **Sprache der App**: nur diese App in diesem Browser. „Automatisch“ folgt der Sprache des Browsers, sonst gilt Englisch.
- **Sprache der Box**: die Texte auf dem Display (Limit, Ruhezeit, QR-Code für Eltern), in den Start- und Wartungsbildern und beim Telegram-Bot ([Telegram](../netzwerk/telegram.md)). Gibt es eine Stimme für diese Sprache, spricht die Box sie auch.

Beide Sprachen stellst du getrennt ein. Die Stimme für die Sprachausgabe steht unter **Audio › Sprachausgabe**.
