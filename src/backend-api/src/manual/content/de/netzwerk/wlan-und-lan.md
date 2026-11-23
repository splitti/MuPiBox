# WLAN und LAN

**Einstellungen › Netzwerk › WLAN** und **Einstellungen › Netzwerk › LAN**. Ein WLAN lässt sich auch am Display einrichten, siehe [Einstellungen am Display](../bedienung/eltern-zugang.md).

## WLAN

### Verbindung und gespeicherte Netze

Die Seite **WLAN** zeigt die aktuelle **Verbindung** (mit IP-Adresse, unter **Details** auch Signal, Gateway, DNS und MAC) und die **gespeicherten Netze**. Die Box kennt beliebig viele Netze und verbindet sich mit dem, das sie findet.

Bei jedem gespeicherten Netz gibt es **Adresse** (feste IP-Adresse, siehe unten), **Passwort** (das neue Passwort, wenn der Router eines bekommen hat) und **Entfernen**.

> [!NOTE]
> Das **verbundene** Netz lässt sich nicht entfernen, sonst wäre die Box offline.

### Netz hinzufügen

1. Tippe unter **Netz hinzufügen** auf **Netze in Reichweite suchen**.
2. Wähle dein Netz aus der Liste.
3. Trage das **Passwort** ein (8 bis 63 Zeichen, ein offenes Netz braucht keins) und tippe auf **Hinzufügen**.

Ein Netz, das seinen Namen nicht zeigt, trägst du unter **Verstecktes Netz eingeben** ein: **Netzname (SSID)** und **Passwort** (leer bei einem offenen Netz), dann **Hinzufügen**.

Die Box probiert ein neues Netz gleich aus. Klappt es, bleibt sie dort und hat dann meist eine andere Adresse. Klappt es nicht, etwa wegen eines Tippfehlers, geht sie ins bisherige Netz zurück und das neue steht unter den gespeicherten Netzen mit **Keine Verbindung – Passwort prüfen**. Über **Passwort** trägst du es dann richtig ein. Während des Versuchs kann die App kurz die Verbindung verlieren. Ein Netz, das die Box nicht findet, bleibt gespeichert. Sie verbindet sich damit, sobald es in Reichweite ist.

WPA2 und WPA3 erkennt die Box von selbst. Über das eingebaute WLAN des Raspberry Pi (Pi 3B+, 4 und 5) nutzt sie ein Netz, das beides anbietet, mit WPA2: Dieser WLAN-Chip wechselt mit WPA2 ohne Aussetzer zwischen mehreren Access Points (Mesh, Repeater), mit WPA3 kann er das nicht. In einem reinen WPA3-Netz sucht die Box mit ihm deshalb nicht laufend nach einem besseren Access Point. Bleibt das Signal schwach, baut sie die Verbindung einmal neu auf (wenige Sekunden). Ein USB-WLAN-Stick nutzt WPA3 auch im Mischbetrieb, solange das eingebaute WLAN aus ist. Ist es an, lesen beide dieselben gespeicherten Netze, und die Box speichert sie so, dass sie zum eingebauten WLAN passen. Ein Netz, das sie gerade nicht sieht (etwa ein verstecktes), trägt sie für beide ein. Für WPA3 liegt das Passwort im Klartext in der WLAN-Konfiguration der Box, die nur der Administrator der Box (root) lesen kann. WPA3 braucht das so. Ist ein Netz schon gespeichert, wird sein Eintrag ersetzt statt verdoppelt. Das Netz, mit dem die Box gerade verbunden ist, bleibt dabei unverändert, damit ein Tippfehler sie nicht offline nimmt.

### Feste IP-Adresse

Für jedes gespeicherte Netz lässt sich über **Adresse** eine **feste IP-Adresse** festlegen (**Adresse beziehen**: **DHCP** oder **Statisch**), die anderen bleiben bei DHCP. Im Netz, in dem die Box gerade ist, prüfst du die Werte vorher mit **Testen**, ohne dass die Verbindung abreißt. Erreicht die Box mit der festen Adresse ihren Router nicht, nimmt sie wieder DHCP und behält die Werte zum Korrigieren.

### WLAN-Wächter

| Einstellung | Wirkung |
| --- | --- |
| **WLAN-Wächter (DietPi-WiFi-Monitor)** | baut die Verbindung neu auf, wenn sie abreißt (nach einer Neuinstallation an). Steckt ein Kabel oder ist kein Netz in Reichweite, greift er nicht laufend ein |
| **Beste Verbindung suchen** | wechselt bei mehreren gespeicherten Netzen zum stärksten |
| **WLAN neu starten** | startet das WLAN neu |

### Adresse und DHCP

**DHCP-Timeout** sorgt dafür, dass die Box beim Start höchstens 10 Sekunden auf eine IP-Adresse wartet. Es gilt für WLAN und LAN. **Adresse neu holen** erneuert nur die Adresse des WLANs.

### WLAN-Hardware

Das eingebaute WLAN lässt sich ausschalten (**Onboard-WLAN an**). Wieder einschalten geht auch am Display: auf der WLAN-Seite oben das WLAN-Symbol antippen. War es schon beim Start aus, ist es nach einem Neustart wieder da – das Display bietet ihn an. Für einen **USB-WLAN-Stick** wählst du den **USB-WLAN-Treiber** (RTL88X2BU oder RTL8821AU) und tippst auf **Treiber installieren**. Der Treiber wird auf der Box gebaut, das dauert einige Minuten. Danach startest du die Box neu. Ist der Treiber installiert, stellst du **Stromsparen des USB-Adapters** ein (**Aus**, **Minimal** oder **Maximal**). **Aus** macht die Verbindung bei manchen Adaptern stabiler.

Auf Debian 13 (Trixie) lassen sich diese beiden Treiber noch nicht bauen, die Auswahl fehlt dort. Ein Stick, dessen Treiber im System enthalten ist, läuft auch ohne sie. Auf Trixie ist das eingebaute WLAN die bessere Wahl: Ältere Realtek-Sticks können dort aussetzen.

## LAN (Kabel)

Die Seite **LAN** gehört dem Kabelanschluss:

- **LAN an** schaltet ihn ein oder aus. Mit Kabel hat LAN Vorrang vor dem WLAN,
- **Verbindung** zeigt, ob ein Kabel verbunden ist, und die aktuelle IP-Adresse, unter **Details** auch Gateway, DNS und MAC,
- **Adresse beziehen**: **DHCP** oder **Statisch**,
- bei **Statisch** trägst du **IP-Adresse** und **Netzmaske** ein. **Router (optional)** und **DNS-Server (optional)** darfst du leer lassen. Ohne Router bleibt das Internet beim WLAN. Das ist praktisch, wenn ein PC direkt an die Box angeschlossen ist,
- **Speichern** übernimmt die Werte, **LAN neu starten** startet den Anschluss neu,
- **Adresse neu holen** erneuert nur die Adresse des Kabels.

## Die Box hat eine neue Adresse

Nach einem Wechsel des Netzes oder des Anschlusses hat die Box meist eine andere IP-Adresse. Öffne die App dann über `mupibox.local` oder die neue Adresse ([Die App öffnen und anmelden](../erste-schritte/app-oeffnen.md)). Die Seite **WLAN** zeigt die Adresse, wenn vorhanden auch die IPv6-Adresse.
