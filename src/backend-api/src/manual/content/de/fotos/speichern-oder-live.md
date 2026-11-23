# Foto-Dienste: speichern oder live

Für Alben aus [Immich](immich.md), [Synology Photos](synology-photos.md), [Nextcloud](nextcloud.md), [PhotoPrism](photoprism.md) und [iCloud](icloud.md) entscheidest du auf der Seite des Dienstes mit **Fotos auf der Box speichern**, wie die Box mit den Fotos umgeht.

| | An (Standard) | Aus (live) |
| --- | --- | --- |
| Wo die Fotos liegen | in Anzeigegröße auf der Speicherkarte | beim Dienst; die Box holt jedes Foto beim Anzeigen |
| Ohne Netz | alles da | Album zeigt **Gerade nicht da** |
| Platz auf der Karte | bis zur Grenze unter **Zwischenspeicher** | nur die zuletzt gezeigten Fotos, höchstens 200 MB |
| Videos | ja | Immich, PhotoPrism und iCloud: ja, direkt vom Dienst; Synology Photos und Nextcloud: nein |

Live lohnt sich bei schnellem WLAN und großen Alben, die nicht auf die Karte passen sollen.

## Abgleich

Die Box schaut regelmäßig nach neuen, geänderten und gelöschten Fotos und übernimmt geänderte Albennamen. Wie oft, legt **Abgleich › Intervall** fest (alle 15 Minuten bis täglich, oder nur von Hand). **Jetzt abgleichen** schaut sofort nach, **Abgleich abbrechen** hält einen laufenden Abgleich an. Die schon geholten Fotos bleiben.

Die Zeile oben auf der Seite zeigt den Stand:

| Zeile | Bedeutung |
| --- | --- |
| **Abgeglichen** … | alles übernommen |
| **Abgleich läuft** | gerade dabei, mit Fortschritt |
| **Nicht erreichbar seit** … | der Dienst antwortet nicht; die Box zeigt weiter, was gespeichert ist, und versucht es spätestens nach 15 Minuten wieder (außer bei **Nur von Hand**) |
| **Abgleich unterbrochen · neuer Versuch in Kürze** | der Dienst hatte mitten im Abgleich eine Störung; der Rest kommt beim nächsten Versuch |
| **Schlüssel abgelehnt** / **Anmeldung abgelehnt** | Schlüssel bzw. Anmeldung neu eintragen |

Ist der **Zwischenspeicher** voll, lädt die Box keine weiteren Fotos und zeigt einen Hinweis. Dann die Grenze erhöhen oder weniger Alben wählen.

## Alben aus dem Dienst

Fotos hinzufügen, löschen oder ein Album umbenennen geht im Dienst selbst. Die Box übernimmt Änderungen beim nächsten Abgleich. Gibt es ein gewähltes Album nicht mehr (oder ist es nicht mehr geteilt), sagt die Seite das.

**Verbindung trennen** entfernt die Alben des Dienstes und ihre Fotos von der Box. Im Dienst bleibt alles erhalten.
