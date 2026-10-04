# System- und Experteneinstellungen

Diese Einstellungen unter **Einstellungen › System** brauchst du selten. Sie sind für Fortgeschrittene, und manche können die Box lahmlegen. Mache vorher ein [Backup](backup.md).

## Systemoptionen

**Einstellungen › System › Systemoptionen**:

| Einstellung | Wirkung |
| --- | --- |
| **SD-Karte übertakten** | schnelleres Lesen von der Karte |
| **PM2-Logs im RAM** | schont die SD-Karte. Die Logs gehen beim Neustart verloren |
| **Beim Start auf Netzwerk warten** | die Box wartet beim Hochfahren, bis das Netzwerk bereit ist |
| **Turbo beim Start** | höhere Taktfrequenz beim Hochfahren |
| **CPU-Governor** | die Art, wie der Prozessor seinen Takt regelt (conservative, ondemand, userspace, powersave, performance, schedutil) |
| **Unterspannungs-Warnungen ausblenden** | blendet die Warnung bei zu schwachem Netzteil aus |
| **SWAP** | Auslagerungsspeicher auf der Karte |

> [!WARNING]
> Eine Unterspannungs-Warnung heißt, dass das Netzteil oder das Kabel zu schwach ist. Das ist die häufigste Ursache für Aussetzer. Behebe sie, statt sie auszublenden.

## Browser (Chromium)

Das Display ist ein Browser im Kiosk-Modus. **Einstellungen › System › Browser (Chromium)**:

| Einstellung | Wirkung |
| --- | --- |
| **GPU-Unterstützung (experimentell)** | Grafik über die GPU |
| **Sanftes Scrollen (experimentell)** | flüssigeres Scrollen |
| **Kiosk-Modus** | Vollbild ohne Bedienelemente des Browsers |
| **Cache-Größe** | 0 bis 512 MB |
| **Chrome-Debugging** | Remote-Debugging des Display-Browsers |

## Experten

**Einstellungen › System › Experten**:

- **Hostname**: der Name der Box im Netzwerk, zum Beispiel `mupibox.local`. Nur Buchstaben, Ziffern und Bindestrich. Wird nach einem Neustart übernommen.
- **Konfiguration direkt bearbeiten**: ein Editor für die Konfigurationsdatei der Box.
- **DietPi-Dashboard**: öffnet sich in einem neuen Fenster.

> [!WARNING]
> Falsche Werte in der Konfiguration können die Box **lahmlegen**. Mache vorher ein [Backup](backup.md).

## Sprache

**Einstellungen › System › Sprache**:

- **Sprache der App**: nur diese App im Browser. „Automatisch“ folgt der Sprache des Browsers.
- **Sprache der Box**: die Texte auf dem Display (Limit, Ruhezeit, QR-Code für Eltern) und in den Start- und Wartungsbildern.

Beide Sprachen stellst du getrennt ein. Die Stimme für die Sprachausgabe steht unter **Audio › Sprachausgabe**.
