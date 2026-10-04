# Einstellungen am Display

Ein paar Dinge lassen sich direkt am Display einstellen, ohne Handy. Sie sind für Eltern gedacht und deshalb nicht offen sichtbar.

## Der QR-Code für Eltern

Halte die **Statusanzeige** am Display (die Symbole für WLAN, Akku und Ähnliches) gedrückt. Die Haltezeit ist einstellbar von 1 bis 10 Sekunden unter **Einstellungen › Display & Bedienung › Bedienung am Display › Haltezeit für den Einstellungszugang**. Es erscheint ein **QR-Code**.

Scanne ihn mit dem Handy: Du bist dann in der [App](../erste-schritte/app-oeffnen.md) angemeldet, auch ohne Passwort. Den Text neben dem QR-Code änderst du unter **Einstellungen › Aussehen › Texte auf dem Display**.

## Netzwerkeinstellungen

Am Display gibt es eigene **Netzwerkeinstellungen**. Oben wählst du zwischen **WLAN** und **LAN** (die LAN-Einstellungen gibt es auch, wenn gerade kein Kabel steckt).

### WLAN

- Die Liste zeigt gespeicherte und gefundene Netze.
- **Connect** wechselt sofort zu diesem Netz. Ist das Netz noch nicht gespeichert, fragt die Box zuerst das Passwort ab.
- **Change PW** ändert das Passwort eines gespeicherten Netzes.
- **Renew address** holt eine neue IP-Adresse, nur für diese Verbindung.
- Für jedes gespeicherte Netz lässt sich eine **feste IP-Adresse** einstellen, die anderen bleiben bei DHCP. Vor dem Speichern prüft die Box die Adresse im aktuellen Netz.

Dieselben Einstellungen, mit mehr Platz, gibt es in der App: [WLAN und LAN](../netzwerk/wlan-und-lan.md).

> [!NOTE]
> Wechselst du das WLAN, bleibt die Box im aktuellen Netz, bis das neue erreichbar ist. Ist sie danach in einem anderen Netz, hat sie eine andere IP-Adresse. Öffne die App dann über die neue Adresse oder über `mupibox.local`.

## Symbole in der Statusanzeige

Die Statusanzeige zeigt auf einen Blick, ob die Box im WLAN ist und wie voll der Akku ist (mit MuPiHAT, siehe [Akku, MuPiHAT und Ausschalter](../hardware/strom.md)). Fehlt das WLAN-Symbol, obwohl die Box verbunden ist, hilft [Weitere Fälle](../fehlerbehebung/weitere-faelle.md).
