# Updates

**Einstellungen › System › Updates**

## MuPiBox

Die Seite zeigt die **installierte Version** und die verfügbaren Versionen aus dem offiziellen MuPiBox-Repository (splitti/MuPiBox) in drei Kanälen:

| Kanal | Für wen |
| --- | --- |
| **Stabil** | die geprüfte Version für den Alltag |
| **Beta** | neuere Funktionen, noch in der Erprobung |
| **Entwicklung** | die Entwicklungsversion. Auf eigenes Risiko |

Tippe beim gewünschten Kanal auf **Installieren** (oder **Neu installieren**, wenn diese Version schon drauf ist). Während das Update läuft, zeigt die Seite den Fortschritt und das Display das Wartungsbild ([Cover und Themes](../bedienung/cover-und-themes.md)). Die Box ist dabei 10 bis 30 Minuten nicht nutzbar und startet danach von selbst neu. Einstellungen und Bibliothek bleiben erhalten.

> [!WARNING]
> **Mache vorher ein Backup** ([Backup](backup.md)). Die **Entwicklungsversion kann die Installation beschädigen.** Stelle bei einem Update sicher, dass die Box nicht unterbrochen wird: Strom und WLAN müssen bis zum Ende halten. Am besten hängt die Box am Netzteil.

### Von einer Box mit 4.x

Eine Box mit MuPiBox 4.x hat diese App noch nicht. Dort startest du das Update im bisherigen **Admin-Interface** mit dessen Update-Knopf. Die Seite antwortet sofort, das Update läuft im Hintergrund weiter: Das Display zeigt das Wartungsbild, und die Box startet am Ende von selbst neu (auf älteren Raspberry Pis nach bis zu 30 Minuten). Bis dahin bitte nicht ausschalten. Die alte Seite meldet unter Umständen schon vorher „Update complete“; ein zweiter Tipp auf den Knopf startet kein zweites Update. Danach geht es in dieser App weiter ([App öffnen](../erste-schritte/app-oeffnen.md)); das Admin-Interface ist dann aus und lässt sich unter [System](system.md) wieder einschalten.

> [!WARNING]
> Auf diesem Weg legt die Box **keine automatische Sicherung** an, und die Anzeige unter **Ausgabe** gibt es nicht. Mache vorher im Admin-Interface ein Backup; es lässt sich später in dieser App einspielen ([Backup](backup.md)). Was das Update getan hat, steht in `/boot/mupibox_update.log`; nach einem erfolgreichen Update heißt die Datei `/boot/<Datum>_update_<Version>.log`. Scheitert das Update schon ganz am Anfang, steht der Fehler in `/var/lib/mupibox-update-admin/output.txt`. Ist unter `/boot` die Boot-Partition eingehängt (wie bei DietPi), lassen sich die Dateien unter `/boot` auch am PC von der Speicherkarte lesen.

### Wenn ein Update schiefgeht

Vor jedem Update aus dieser App sichert die Box Einstellungen, Bibliothek und Cover auf der Speicherkarte: in `/home/dietpi/mupibox-backups/before-update-….zip` (die drei neuesten bleiben). Scheitert schon das Herunterladen oder das Auspacken der neuen Version, bleibt die bisherige Installation erhalten. Ein vollständiges Zurückrollen auf den alten Stand gibt es sonst nicht. Bricht ein Update aus dieser App ab, zeigt die Seite unter **Ausgabe**, was passiert ist.

## Neuigkeiten

Was in der jeweiligen Version neu ist, steht unter **Einstellungen › System › Über die Box › Neuigkeiten**.

## Betriebssystem

Unter **Betriebssystem** aktualisierst du mit **Betriebssystem aktualisieren** die Pakete des Systems (DietPi, das System unter der MuPiBox). Das dauert auf älteren Raspberry Pis **bis zu 30 Minuten**. Die Box läuft dabei weiter und startet **nicht** von selbst neu. Ist das Update fertig, tippe auf **Box neu starten**.

> [!WARNING]
> Auch hier gilt: **Vorher immer ein Backup machen.**
