# WLAN und LAN

**Einstellungen › Netzwerk › WLAN** und **Einstellungen › Netzwerk › LAN**. Am Display gibt es dieselben Einstellungen, siehe [Einstellungen am Display](../bedienung/eltern-zugang.md).

## WLAN

### Verbindung und Netze

Die Seite **WLAN** zeigt die aktuelle **Verbindung**, die **Netze in Reichweite** (mit **Neu suchen**) und die **gespeicherten Netze**. Die Box kennt beliebig viele Netze und verbindet sich mit dem, das sie findet.

> [!NOTE]
> Das **aktive** Netz lässt sich nicht entfernen, sonst wäre die Box offline.

### Neues WLAN hinzufügen

Trage **Netzname (SSID)** und **Passwort** ein (8 bis 63 Zeichen; ein leeres Passwort steht für ein offenes Netz) und tippe auf **Hinzufügen**. Die Box bleibt im aktuellen Netz und wechselt erst, wenn das neue erreichbar ist. So bleibt sie auch bei einem Tippfehler erreichbar.

### Feste IP-Adresse

Für jedes gespeicherte Netz lässt sich eine **feste IP-Adresse** festlegen, die anderen bleiben bei DHCP. Vor dem Speichern prüft die Box die Adresse im Netz, in dem sie gerade ist, ohne dass sie dafür die Verbindung kappt.

### WLAN-Wächter

| Einstellung | Wirkung |
| --- | --- |
| **WLAN-Wächter** | baut die Verbindung neu auf, wenn sie abreißt |
| **Beste Verbindung suchen** | wechselt bei mehreren Netzen automatisch zum stärksten |
| **WLAN neu starten** | startet das WLAN neu |

### Adresse und DHCP

**DHCP-Timeout** sorgt dafür, dass die Box beim Start nicht ewig auf eine IP-Adresse wartet. **Adresse neu holen** erneuert nur die Adresse des WLANs.

### WLAN-Hardware

Das eingebaute WLAN lässt sich ausschalten (**Onboard-WLAN an**). Für einen **USB-WLAN-Stick** wählst du den **Treiber** (RTL88X2BU oder RTL8821AU) und installierst ihn. **Stromsparen des USB-Adapters** ist aus, denn die Verbindung ist ohne meist stabiler.

## LAN (Kabel)

Die Seite **LAN** gehört dem Kabelanschluss:

- **LAN an** schaltet ihn ein oder aus,
- **Adresse beziehen**: **DHCP** oder **Statisch**,
- bei einer festen Adresse sind Router und DNS optional. Ohne Router bleibt das Internet beim WLAN. Das ist praktisch, wenn ein PC direkt an die Box angeschlossen ist,
- **Adresse neu holen** erneuert nur die Adresse des Kabels.

## Die Box hat eine neue Adresse

Nach einem Wechsel des Netzes oder des Anschlusses hat die Box meist eine andere IP-Adresse. Öffne die App dann über `mupibox.local` oder die neue Adresse ([Die App öffnen und anmelden](../erste-schritte/app-oeffnen.md)). Die Seite **WLAN** zeigt die Adresse, wenn vorhanden auch die IPv6-Adresse.
