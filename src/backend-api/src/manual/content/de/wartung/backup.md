# Backup

**Einstellungen › System › Backup**

## Sichern

| Art | Inhalt |
| --- | --- |
| **Konfigurations-Backup** | die Einstellungen (`mupiboxconfig.json`), die Bibliothek (`data.json`), die eigenen Cover und die Einstellungen der installierten [Erweiterungen](../erweiterungen/index.md) (etwa die Pins der Tasten oder der Ort beim Wetter) |
| **Voll-Backup** | zusätzlich **alle Medien der SD-Karte** und die hochgeladenen Fotos und Videos ([Fotos](../fotos/hochladen.md#sicherung)). Kann mehrere GB groß werden und dauern |

Tippe bei der gewünschten Art auf **Herunterladen**. Die Datei landet auf deinem PC oder Handy. Bewahre sie nicht nur auf der Box selbst auf.

## Einspielen

Tippe unter **Einspielen** auf **Backup-Datei wählen**, wähle die Datei und tippe auf **Backup einspielen**. Das geht mit Backups dieser App und des früheren Admin-Interface (bis MuPiBox 5.0). Danach startet die Box neu.

Die Erweiterungen selbst stecken nicht im Backup, nur ihre Einstellungen. Fehlen nach dem Einspielen Erweiterungen auf der Box, nennt die App sie: Installiere sie unter **Einstellungen › System › Erweiterungen** neu, ihre Einstellungen sind dann schon da. Ein Backup von MuPiBox 5.1 lässt sich nicht auf einer Box mit 5.0 einspielen; aktualisiere die Box vorher.

> [!WARNING]
> Das Einspielen **überschreibt** die aktuellen Einstellungen und die Bibliothek. Es ist als Rückweg gedacht, wenn etwas kaputt ist, und nicht als Änderung im Betrieb.

## Wann sichern?

- **vor jedem Update** ([Updates](updates.md)),
- vor Änderungen mit dem JSON-Editor ([System- und Experteneinstellungen](system.md)),
- nach größeren Änderungen an der Bibliothek,
- vor einem Umzug der Box auf eine neue Speicherkarte.

> [!NOTE]
> Das Konfigurations-Backup enthält die Einstellungen **einschließlich** der darin gespeicherten Passwörter und Zugänge. Gib die Datei nicht aus der Hand, und hänge sie nicht an eine Fehlermeldung an. Wenn du Hilfe brauchst, nimm die **Support-Infos** unter **Über die Box**: Sie lassen Passwörter, Tokens und Konten weg ([Protokolle und Zustand](protokolle.md)).
