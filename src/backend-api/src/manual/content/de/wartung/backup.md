# Backup

**Einstellungen › System › Backup**

## Sichern

| Art | Inhalt |
| --- | --- |
| **Konfigurations-Backup** | die Cover, die Konfiguration (`mupiboxconfig.json`) und die Liste der Inhalte (`data.json`) |
| **Voll-Backup** | zusätzlich **alle Mediendateien**. Kann sehr groß werden |

Beide laden sich als Datei auf deinen PC oder dein Handy herunter. Bewahre sie nicht nur auf der Box selbst auf.

## Einspielen

Wähle unter **Einspielen** die **Backup-Datei** und tippe auf **Backup einspielen**.

> [!WARNING]
> Das Einspielen **überschreibt** die aktuelle Konfiguration und die Inhalte. Es ist als Rückweg gedacht, wenn etwas kaputt ist, und nicht als Änderung im Betrieb.

## Wann sichern?

- **vor jedem Update** ([Updates](updates.md)),
- vor Änderungen mit dem JSON-Editor ([System- und Experteneinstellungen](system.md)),
- nach größeren Änderungen an der Bibliothek,
- vor einem Umzug der Box auf eine neue Speicherkarte.

> [!NOTE]
> Das Konfigurations-Backup enthält die Einstellungen **einschließlich** der darin gespeicherten Zugangsdaten. Gib die Datei nicht aus der Hand, und hänge sie nicht an eine Fehlermeldung an. Für Fehlermeldungen gibt es den [Problembericht](problem-melden.md), der Passwörter und Schlüssel weglässt.
