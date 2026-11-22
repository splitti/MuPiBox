# OLED-Display

Die Erweiterung **OLED-Display** zeigt auf einem kleinen OLED-Display, was die Box spielt: Titel, Interpret und Album, die Zeit, die Titelnummer, die Lautstärke, das WLAN, den Akku eines MuPiHAT, Zufall und Wiederholen und den Ausgang (Lautsprecher, Kopfhörer, Bluetooth). Wenn nichts spielt, zeigt es ein Bild: standardmäßig den NFC-Leser, der auf einen Tag wartet. Beim Start, beim Update, in der Ruhezeit und beim Herunterfahren hat es eigene Bilder, die sich ändern lassen. Dazu kann die Box **ganz ohne DSI-Display** laufen; das ist seit MuPiBox 5.1 ein Schalter der Box selbst (siehe [Ohne DSI-Display](ohne-dsi-display.md)).

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
| Pfeile mit **A** oder **1** | **Wiederholen**: die ganze Liste (A) oder ein Titel (1). Der Taster für Wiederholen in der Erweiterung Buttons & GPIO Input schaltet durch: alle (A), eins (1), aus |
| gekreuzte Pfeile | **Zufall** ist an |
| Zahl und Symbol rechts | Lautstärke und **Ausgang**: Lautsprecher, Kopfhörer oder Bluetooth |

Darunter stehen **Titel**, **Interpret** und **Album**; eine lange Zeile läuft von selbst durch (oder auch nicht: siehe **Zu lange Texte** unten). Ein **Stream** (ein Radiosender, der kein Ende hat) bekommt keinen Fortschrittsbalken; ein **Podcast** hat ihn, auch über dem Bild des Tags (in **Mix**, **Kompakt** und auf dem Display mit 128 × 32 Punkten, ganz oben als dünne Linie). Der Titel einer Podcast-Folge (und der Name eines Radiosenders) steht, wenn nötig, über **drei Zeilen** und bricht zwischen den Wörtern um; was in die dritte Zeile nicht passt, läuft dort durch. Statt „Track“ steht in der Anzeige **Voll** unten rechts **„Folge: 12/123“**, in **Mix** in der Mitte der Statusleiste nur die Nummer der Folge („12“). Sie ist die Stelle der Folge in der Liste des Podcasts, wie sie die Box anzeigt (solange sie nicht bekannt ist, bleibt das Feld leer); ein Podcast zeigt keine Uhrzeit, ein Radiosender dafür an dieser Stelle die **Uhrzeit** („14:35“; in **Kompakt** zeigt keiner von beiden etwas dort). Unten links zeigt ein Dreieck, dass die Box spielt (zwei Balken: pausiert), daneben die **Zeit**, unten rechts die **Titelnummer** („Track:3/12“).

![Die Zeit läuft rückwärts, der Ausgang ist Bluetooth](oled-play-bt.png)

Wenn nichts spielt, zeigt das Display das Bild, das unter **Anzeige im Leerlauf** gewählt ist: den **NFC-Leser** (eine Hand mit Karte: die Box wartet auf einen Tag), den **Barcodescanner**, die **Uhrzeit** mit dem Datum (das ist die Voreinstellung; der Wochentag in der Sprache der Box, die du unter **Einstellungen › System › Sprache** wählst; ohne Auswahl deutsch) oder ein **eigenes Bild**; nach der eingestellten Zeit schaltet es sich aus.

![Die Uhr im Leerlauf](oled-idle.png)

Ein kurzes Bild erscheint, wenn die Wiedergabe startet oder pausiert und wenn sich die Lautstärke ändert. Dieses Bild für die Lautstärke lässt sich mit **Lautstärke-Animation zeigen** ausschalten, das Bild für Start und Pause mit **Play/Pause-Animation zeigen**. Mit **IP-Adresse der Box als QR-Code anzeigen** erscheint zehn Sekunden lang ein **QR-Code** mit der IP-Adresse der Box und sonst nichts. Das Handy scannt ihn und öffnet die Box im Browser. Dieselbe Aktion lässt sich auch einem Taster, einem Doppeltaster oder dem Drehregler geben ([Buttons & GPIO Input](buttons.md), [Drehregler und Taster](../hardware/drehregler.md)). Hat die Box keine Netzwerkadresse, zeigt die Anzeige stattdessen die **Netzwerkseite** mit WLAN-Name, Adresse und Version.

![Der QR-Code mit der Adresse der Box](oled-info.png)

Wählt der **Drehregler** mit der NFC-Extension ein Album ([NFC: Drehregler](nfc-drehregler.md)), steht in den Informationen der **Name**, bei dem er gerade steht, mit seinem Platz in der Liste. Nach der Wahl kommt die normale Anzeige zurück.

## Einstellungen

Die Einstellungen stehen in Karten: **Display** (Chip, Größe, Adresse, Drehung), **Anzeige**, **Helligkeit & Ausschalten** (Helligkeit, Display aus nach), **Abends dunkler**, **Bilder** und **Ohne DSI-Display**.

| Einstellung | Wirkung |
| --- | --- |
| **Chip** | **SSD1306** (fast alle 0,96-Zoll-Module), **SH1106** (meist 1,3 Zoll) oder **SSD1309**. Zeigt das Bild einen Versatz oder Streifen am Rand, den anderen Chip wählen |
| **Größe** | **128 × 64** oder **128 × 32** |
| **I2C-Adresse** | **0x3C** oder **0x3D** |
| **Um 180° drehen** | wenn das Display auf dem Kopf eingebaut ist |
| **Anzeige beim Spielen** | **Voll** (das Bild oben), **Mix** (die Titelnummer groß) oder **Kompakt** (die Zeit groß). Ein Taster oder Doppeltaster kann mit **OLED-Anzeige wechseln (Voll / Mix / Kompakt)** zur nächsten Anzeige weiterschalten ([Buttons & GPIO Input](buttons.md)); das gilt bis zum nächsten Speichern |
| **Anzeige im Leerlauf** (Karte **Bilder**) | was das Display zeigt, solange nichts spielt: **NFC-Leser**, **Barcodescanner**, **Uhrzeit** (Voreinstellung) oder **Eigenes Bild** |
| **Lautstärke-Animation zeigen** | das kurze Bild beim Ändern der Lautstärke; ausgeschaltet bleibt die Anzeige, wie sie ist |
| **Play/Pause-Animation zeigen** | das kurze Bild mit Play oder Pause beim Starten und Anhalten der Wiedergabe; ausgeschaltet bleibt die Anzeige, wie sie ist |
| **Podcast und Radio zeigen** | Bei einem Podcast oder Radiosender: **Bild, falls vorhanden** (das [Bild des Tags](#das-bild-eines-tags), solange der Tag das Medium gestartet hat) oder immer **Titel und Uhrzeit**: der Titel über bis zu drei Zeilen, bei einem Podcast mit der Folge („Folge: 12/123“), bei einem Radiosender mit der **Uhrzeit** an derselben Stelle. Hat der Tag kein Bild, steht auch bei „Bild“ der Titel. Gilt für alle drei Anzeigen (Voll, Mix, Kompakt); Alben und Hörspiele zeigen ihr Bild des Tags immer |
| **Zeit zeigen** | **Vergangen** (zählt vom Anfang hoch) oder **Restzeit** (zählt mit einem Minus bis zum Ende herunter); bei einem Sender oder Podcast ohne bekannte Länge zählt sie hoch |
| **Zu lange Texte** | **Immer wieder durchlaufen** (Standard), **Einmal durchlaufen** (die Zeile läuft einmal komplett durch und steht danach mit „…“ am Ende) oder **Nicht durchlaufen** (die Zeile wird mit „…“ gekürzt) |
| **Helligkeit** | 1 bis 255 |
| **Abends dunkler** | das OLED-Display wird abends dunkler und morgens wieder normal hell. Die Zeiten sind die von „Abends dunkler“ in den Einstellungen des Displays (feste Uhrzeiten oder Sonnenuntergang bis Sonnenaufgang, sanftes Abdunkeln, Ruhezeiten); ob das Display der Box selbst abdunkelt, ist davon unabhängig. Die Karte **Abends dunkler** zeigt diese Zeiten mit an: Sonnenuntergang, Ort, Uhrzeiten, Abdunkeln und Ruhezeiten, die du hier änderst, gelten auch für das Display der Box |
| **Helligkeit am Abend** | 1 bis 255, mit dem Regler oder direkt in das Feld getippt; nie heller als die normale Helligkeit |
| **Display aus nach** | **Nie**, 1, 5, 15 Minuten oder 1 Stunde, wenn nichts spielt |
| **Ohne DSI-Display** | zeigt nur noch, was die Box tut; der Schalter steht unter **Einstellungen › Display** (siehe [Ohne DSI-Display](ohne-dsi-display.md)) |

Der Knopf **IP-Adresse der Box als QR-Code anzeigen** probiert den QR-Code aus. Eine Änderung von Chip, Größe, Adresse und Drehung startet das Display neu; die anderen gelten sofort.

Das **128 × 32**-Display zeigt Titel, Interpret, Zeit, Lautstärke und WLAN in einer Anzeige.

## Bilder

Die Karte **Bilder** zeigt die Bilder des Displays und wo sie erscheinen. Alle sind **128 × 64** Punkte, weiß auf schwarz.

| Bild | Wann es erscheint | Änderbar |
| --- | --- | --- |
| **Startbild** (das MuPiBox-Logo) | beim Hochfahren, sobald die Anzeige startet, bis die Box bereit ist (höchstens zwei Minuten) | ja |
| **Leerlauf: NFC-Leser** | im Leerlauf, wenn **Anzeige im Leerlauf** auf **NFC-Leser** steht | nein |
| **Leerlauf: Barcodescanner** | im Leerlauf, wenn **Anzeige im Leerlauf** auf **Barcodescanner** steht | nein |
| **Leerlauf: Eigenes Bild** | im Leerlauf, wenn **Anzeige im Leerlauf** auf **Eigenes Bild** steht (bis du eins wählst, bleibt der NFC-Leser) | ja |
| **Update** | solange ein Update läuft | ja |
| **Ruhezeit und Limit** (ein schlafendes Gesicht) | solange eine Ruhezeit läuft oder das Limit erreicht ist | ja |
| **Herunterfahren** (das Ein/Aus-Symbol) | sobald die Box herunterfährt | nein |

Jedes Bild hat einen Knopf **Zeige Bild**: Das Bild steht dann **zehn Sekunden** auf dem Display, danach zeigt es wieder, was vorher zu sehen war. So siehst du ein Bild, ohne dass der Anlass eintritt.

Bei einem änderbaren Bild tippst du auf **Bild ändern** und wählst ein Bild vom Gerät. Die Box nimmt **nur Bilder, die genau 128 × 64 Punkte groß sind und nur aus reinem Schwarz und Weiß bestehen (1 Bit)**; Weiß leuchtet. Die App prüft das gleich beim Wählen, die Box noch einmal. Ein Bild mit anderer Größe, Graustufen, Farben oder durchsichtigen Stellen wird **abgelehnt**, nichts wird verkleinert oder umgewandelt. Mach das Bild vorher in einem Grafikprogramm fertig (Größe 128 × 64, Modus „Schwarzweiß“ ohne Dithering oder mit, wie du es willst). Mit **Zurücksetzen** kommt das Original wieder.

### Das Bild eines Tags

Jeder NFC-Tag kann ein eigenes Bild bekommen, das auf dem Display steht, solange **das Medium dieses Tags** spielt (ein Album, ein Stream, ein Podcast, was auch immer der Tag startet). Es ersetzt den Fortschrittsbalken und die große Zeit (in **Voll** die Statusleiste und die Zeilen mit Titel und Interpret); die oberen 50 Punkte gehören dem Bild, die Statusleiste (Mix) beziehungsweise das WLAN-Symbol und PAUSE (Kompakt) bleiben. Bei einem Radiosender steht in **Voll** und **Mix** die **Uhrzeit** dort, wo sonst die Titelnummer steht; bei einem Podcast die Folge. Auch in **Voll** steht das Bild oben; darunter bleibt die Zeile mit Abspielzeichen und Zeit. Auf einem Display mit 128 × 32 Punkten erscheint es nicht. Bei einem Podcast oder Radiosender lässt sich mit **Podcast und Radio zeigen** (Einstellungen › OLED-Display › Anzeige) wählen, ob das Bild oder der Titel mit der Uhrzeit gezeigt wird.

Das Bild wählst du in **Einstellungen › NFC-Extension › Zugeordnete Tags** mit dem Knopf **OLED-Bild** der Kachel des Tags (der Knopf steht nur da, wenn die OLED-Extension installiert ist), siehe [Zugeordnete Tags](nfc-zugeordnete-tags.md). Die Box nimmt **nur Bilder, die genau 128 × 50 Punkte groß sind und nur aus reinem Schwarz und Weiß bestehen (1 Bit)**; Weiß leuchtet. Alles andere wird wie bei den anderen Bildern abgelehnt. Hat der Tag schon ein Bild, zeigt dasselbe Fenster es zuerst und fragt, ob du es ändern oder **entfernen** möchtest; wird der Tag entfernt, geht sein Bild mit. Das Bild kommt nur, wenn der Tag das Medium gestartet hat: Wählt das Kind danach am Display etwas anderes, ist das normale Bild wieder da. Die Bilder der Tags gehören nicht zum Export der Tag-Liste.

Das Update- und das Herunterfahr-Bild zeichnet die Box selbst auf das Display, auch wenn der Server dabei schon steht. Das Startbild erscheint, sobald die Anzeige gestartet ist; ein Bild davor, während Linux noch startet, ist nicht möglich.

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
