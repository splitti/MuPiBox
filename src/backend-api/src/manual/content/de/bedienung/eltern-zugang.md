# Einstellungen am Display

Ein paar Dinge lassen sich direkt am Display einstellen, ohne Handy. Sie sind für Eltern gedacht und deshalb nicht offen sichtbar.

## Die Einstellungen öffnen

Halte die **Statusanzeige** oben rechts am Display (die Symbole für WLAN, Akku und Ähnliches) gedrückt. Die Haltezeit ist einstellbar von 1 bis 10 Sekunden unter **Einstellungen › Display & Bedienung › Bedienung am Display › Haltezeiten › Haltezeit für den Einstellungszugang**. Unter 3 Sekunden kommen Kinder leicht hinein.

Es öffnen sich die Einstellungen am Display mit vier Kacheln. Sie sind auf Englisch beschriftet:

| Kachel | Wirkung |
| --- | --- |
| **Network settings** | WLAN und LAN einrichten (siehe unten) |
| **Bluetooth settings** | Kopfhörer und Lautsprecher koppeln ([Bluetooth](../hardware/bluetooth.md)) |
| **Reboot / Shutdown** | die Box neu starten oder ausschalten |
| **Parent web app** | zeigt den QR-Code für die App |

Oben stehen der Hostname und die IP-Adresse der Box.

![Die Einstellungen am Display](display-settings.png)

## Der QR-Code für Eltern

Tippe auf **Parent web app**. Es erscheint ein **QR-Code**. Scanne ihn mit dem Handy: Du bist dann in der [App](../erste-schritte/app-oeffnen.md) angemeldet, auch ohne Passwort. Den Text neben dem QR-Code änderst du unter **Einstellungen › Aussehen › Texte auf dem Display**.

## Netzwerkeinstellungen

Die Kachel **Network settings** öffnet die Netzwerkeinstellungen. Gibt es einen LAN-Anschluss, wählst du oben zwischen **WiFi** und **LAN** (die LAN-Einstellungen gibt es auch, wenn gerade kein Kabel steckt).

### WLAN

- Oben steht das aktuelle Netz mit der IP-Adresse der Box. **Renew address** holt eine neue IP-Adresse, nur für diese Verbindung.
- Die Liste zeigt gespeicherte und gefundene Netze. **Scan** sucht neu, **Add network** trägt ein Netz von Hand ein, zum Beispiel ein verstecktes.
- Bei einem Netz, das noch nicht gespeichert ist, steht **Connect**. Es fragt das Passwort ab und speichert das Netz.
- Gespeicherte Netze haben drei Knöpfe: **Address** stellt eine **feste IP-Adresse** für dieses Netz ein (die anderen bleiben bei DHCP; ist die Box gerade in diesem Netz, prüft **Test** die Adresse vor dem Speichern), **Change** ändert das Passwort, **Delete** löscht das Netz.

Dieselben Einstellungen, mit mehr Platz, gibt es in der App: [WLAN und LAN](../netzwerk/wlan-und-lan.md).

> [!NOTE]
> Wechselst du das WLAN, bleibt die Box im aktuellen Netz, bis das neue erreichbar ist. Ist sie danach in einem anderen Netz, hat sie eine andere IP-Adresse. Öffne die App dann über die neue Adresse oder über `mupibox.local`.

## Symbole in der Statusanzeige

Die Statusanzeige zeigt auf einen Blick, ob die Box im WLAN ist und wie voll der Akku ist (mit MuPiHAT, siehe [Akku, MuPiHAT und Ausschalter](../hardware/strom.md)). Fehlt das WLAN-Symbol, obwohl die Box verbunden ist, hilft [Weitere Fälle](../fehlerbehebung/weitere-faelle.md).
