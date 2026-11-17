# OLED-Display

Die Erweiterung **OLED-Display** zeigt auf einem kleinen OLED-Display, was die Box spielt: Titel, Interpret und Album, die Zeit, die Titelnummer, die Lautstärke, das WLAN, den Akku eines MuPiHAT, Zufall und Wiederholen und den Ausgang (Lautsprecher, Kopfhörer, Bluetooth). Wenn nichts spielt, zeigt es die Uhrzeit. Dazu kann die Box **ganz ohne DSI-Display** laufen (siehe [Ohne DSI-Display](ohne-dsi-display.md)).

Unterstützt werden die Chips **SSD1306**, **SH1106** und **SSD1309** am **I2C-Anschluss** mit **128 × 64** oder **128 × 32** Pixeln, auf dem **Raspberry Pi 4 und dem Pi 5**. Die Anzeige braucht kein Paket außer `python3-pil`, das die Installation der Erweiterung mitbringt.

Nach der [Installation](installieren.md) stehen die Einstellungen unter **Einstellungen › OLED-Display**.

## Anschließen

Das Display hängt am I2C-Bus der Stiftleiste. Verdrahte bei ausgeschalteter Box:

| OLED | Raspberry Pi | Pin der Stiftleiste |
| --- | --- | --- |
| VCC | 3,3 V | 1 |
| GND | Masse | 6 |
| SDA | GPIO 2 (I2C SDA) | 3 |
| SCL | GPIO 3 (I2C SCL) | 5 |

Die meisten Module haben die Adresse **0x3C**; manche lassen sich mit einer Lötbrücke auf **0x3D** stellen. Der I2C-Bus kann mit anderen Geräten geteilt werden, etwa mit einem PN532 oder einem MuPiHAT.

Ist I2C noch aus, zeigt die Karte **Display** den Block **I2C** als **Ausgeschaltet**. Tippe rechts daneben auf **I2C einschalten** und starte die Box danach **neu**.

## Die Anzeige

![Ein Album spielt: oben die Statusleiste, darunter Titel, Interpret und Album, unten Zeit und Titelnummer](oled-play.png)

Die **Statusleiste** oben zeigt von links nach rechts:

| Symbol | Bedeutung |
| --- | --- |
| Antenne mit Balken | Empfang des WLAN (ohne Balken: keine Verbindung) |
| Bildschirm mit Netzwerkstecker | die Box hängt am **LAN-Kabel** (das Symbol steht dann anstelle der Antenne) |
| Zahl mit Batterie | Ladung des Akkus (nur mit einem MuPiHAT) |
| Pfeile mit **A** oder **1** | **Wiederholen**: die ganze Liste (A) oder ein Titel (1, bei Spotify) |
| gekreuzte Pfeile | **Zufall** ist an |
| Zahl und Symbol rechts | Lautstärke und **Ausgang**: Lautsprecher, Kopfhörer oder Bluetooth |

Darunter stehen **Titel**, **Interpret** und **Album**; eine lange Zeile läuft von selbst durch (oder auch nicht: siehe **Zu lange Texte** unten). Unten links zeigt ein Dreieck, dass die Box spielt (zwei Balken: pausiert), daneben die **Zeit**, unten rechts die **Titelnummer** („Track:3/12“).

![Die Zeit läuft rückwärts, der Ausgang ist Bluetooth](oled-play-bt.png)

Wenn nichts spielt, zeigt das Display die **Uhrzeit** mit dem Datum (der Wochentag in der Sprache der Box, die du unter **Einstellungen › System › Sprache** wählst; ohne Auswahl deutsch); nach der eingestellten Zeit schaltet es sich aus.

![Die Uhr im Leerlauf](oled-idle.png)

Ein kurzes Bild erscheint, wenn die Wiedergabe startet oder pausiert und wenn sich die Lautstärke ändert. Dieses Bild für die Lautstärke lässt sich mit **Lautstärke-Animation zeigen** ausschalten. Mit **Adresse der Box zeigen** erscheint zehn Sekunden lang die **Netzwerkseite**: WLAN-Name (am LAN-Kabel stattdessen **LAN**), Adresse und Version, mit dem Symbol (i) oben.

![Die Netzwerkseite](oled-info.png)

## Einstellungen

| Einstellung | Wirkung |
| --- | --- |
| **Chip** | **SSD1306** (fast alle 0,96-Zoll-Module), **SH1106** (meist 1,3 Zoll) oder **SSD1309**. Zeigt das Bild einen Versatz oder Streifen am Rand, den anderen Chip wählen |
| **Größe** | **128 × 64** oder **128 × 32** |
| **I2C-Adresse** | **0x3C** oder **0x3D** |
| **Um 180° drehen** | wenn das Display auf dem Kopf eingebaut ist |
| **Anzeige beim Spielen** | **Voll** (das Bild oben), **Mix** (die Titelnummer groß) oder **Kompakt** (die Zeit groß) |
| **Uhrzeit zeigen** | die Uhr im Leerlauf |
| **Lautstärke-Animation zeigen** | das kurze Bild beim Ändern der Lautstärke; ausgeschaltet bleibt die Anzeige, wie sie ist (Start und Pause zeigen weiter ihr Bild) |
| **Zeit zeigen** | **Vergangen** (zählt vom Anfang hoch) oder **Restzeit** (zählt mit einem Minus bis zum Ende herunter); bei einem Sender oder Podcast ohne bekannte Länge zählt sie hoch |
| **Zu lange Texte** | **Immer wieder durchlaufen** (Standard), **Einmal durchlaufen** (die Zeile läuft einmal komplett durch und steht danach mit „…“ am Ende) oder **Nicht durchlaufen** (die Zeile wird mit „…“ gekürzt) |
| **Helligkeit** | 0 bis 255 |
| **Abends dunkler** | das OLED-Display wird abends dunkler und morgens wieder normal hell. Die Zeiten sind die von „Abends dunkler“ in den Einstellungen des Displays (feste Uhrzeiten oder Sonnenuntergang bis Sonnenaufgang, sanftes Abdunkeln, Ruhezeiten); ob das Display der Box selbst abdunkelt, ist davon unabhängig |
| **Helligkeit am Abend** | 1 bis 255, mit dem Regler oder direkt in das Feld getippt; nie heller als die normale Helligkeit |
| **Display aus nach** | **Nie**, 1, 5, 15 Minuten oder 1 Stunde, wenn nichts spielt |
| **Ohne DSI-Display betreiben** | siehe [Ohne DSI-Display](ohne-dsi-display.md) |

Die Knöpfe **Adresse der Box zeigen** und **Nächste Anzeige** probieren die Anzeige aus: Der zweite wechselt bis zum nächsten Speichern zwischen **Voll**, **Mix** und **Kompakt**. Eine Änderung von Chip, Größe, Adresse und Drehung startet das Display neu; die anderen gelten sofort.

Das **128 × 32**-Display zeigt Titel, Interpret, Zeit, Lautstärke und WLAN in einer Anzeige.

## Wenn das Display dunkel bleibt

Die Zeile **Display** der Karte sagt, was fehlt:

| Meldung | Was zu tun ist |
| --- | --- |
| **I2C ist aus: einschalten, dann neu starten** | **I2C einschalten** antippen, die Box neu starten |
| **Kein Zugriff auf den I2C-Bus** | die Box einmal neu starten (die Regel für den Zugriff wird dabei aktiv) |
| **Antwortet nicht: Anschluss und Adresse prüfen** | Verdrahtung prüfen, die **I2C-Adresse** und den **Chip** ausprobieren |
| **Es fehlt das Paket python3-pil** | die Erweiterung neu installieren (sie holt das Paket) |

> [!NOTE]
> Das Programm für das Display ist eine eigene Umsetzung: Die Anzeige ist dem Projekt [oled_phoniebox](https://github.com/splitti/oled_phoniebox) nachempfunden, nutzt aber keinen Code daraus. Sie schreibt direkt auf den I2C-Bus und braucht weder `luma.oled` noch `RPi.GPIO`; sie läuft deshalb auf dem Pi 4 und dem Pi 5 gleich.
