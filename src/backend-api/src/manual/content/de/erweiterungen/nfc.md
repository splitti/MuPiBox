# NFC-Extension

Die Erweiterung **NFC-Extension** bringt einen **NFC-Leser** an die Box. Unterstützt werden der **PN5180** (NXP), der **RC522** und der **PN532** am Raspberry Pi sowie **USB-Leser**, die die Kartennummer wie eine Tastatur tippen. Er liest die **UID** von Tags und Karten, im Moment der Annäherung wie beim Entfernen. Jeder Tag kann ein **Album, einen Hörspiel-Ordner, einen Sender oder einen Podcast starten**; die Zuordnung funktioniert wie bei TeddyCloud: Medium wählen, Tag auflegen, fertig. Die Einstellungen zeigen außerdem, ob der Leser läuft und welches Tag zuletzt gelesen wurde.

Der PN5180 liest beide Welten: **ISO 14443 A** (NTAG, MIFARE und die meisten Karten und Sticker) und **ISO 15693** (ICODE, SLIX).

Nach der [Installation](installieren.md) stehen die Einstellungen unter **Einstellungen › System › NFC-Extension**. Die Seite hat zwei Unterseiten: **NFC-Reader** richtet den Leser ein (Anschluss, Pins, Zustand des Lesers), **Zugeordnete Tags** zeigt die Tags mit ihren Medien. Zugeordnet wird in der Bibliothek (siehe unten).

## Anschluss

Verdrahte bei ausgeschalteter Box. Der PN5180 braucht **beide** Versorgungen: **5 V** für die Sendestufe der Antenne und **3,3 V** für die Logik. Die Signale sind 3,3 V, ein Pegelwandler ist nicht nötig.

| PN5180 | Raspberry Pi | Pin der Stiftleiste |
| --- | --- | --- |
| 5V | 5 V | 2 |
| 3.3V | 3,3 V | 1 |
| GND | Masse | 6 |
| SCK | GPIO 11 (SPI SCLK) | 23 |
| MOSI | GPIO 10 (SPI MOSI) | 19 |
| MISO | GPIO 9 (SPI MISO) | 21 |
| NSS | GPIO 8 (SPI CE0) | 24 |
| BUSY | GPIO 25 (Vorschlag) | 22 |
| RST | GPIO 23 (Vorschlag) | 16 |
| IRQ, GPIO, AUX, REQ | frei lassen | – |

Die Pins **SCK, MOSI, MISO und NSS** hat der SPI-Anschluss fest. **BUSY und RST** wählst du in den Einstellungen selbst; GPIO 25 und GPIO 23 sind auf den meisten Boxen frei, die Auswahl sperrt Pins, die schon belegt sind. Der PN5180 meldet über BUSY, wann er bereit ist, ohne BUSY geht es nicht. Der IRQ-Anschluss wird nicht gebraucht, die Erweiterung fragt den Chip ab.

> [!WARNING]
> Der **Drehregler** der Box hat seinen Taster ab Werk an GPIO 10, das ist auch MOSI des SPI-Anschlusses. Solange der Taster keine Funktion hat (**Aus**), lässt der Drehregler GPIO 10 frei. Brauchst du den Taster, legst du ihn unter **Einstellungen › Drehregler** auf einen freien Pin um (zum Beispiel GPIO 5); die Seite zeigt einen Hinweis, solange ein Pin des Drehreglers auch vom SPI-Anschluss belegt ist. Einen Pin des SPI-Anschlusses nimmt der Drehregler nie, der Taster bleibt dann ohne Wirkung.

Kurze Leitungen helfen (bis etwa 15 cm), am besten mit einer zusätzlichen Masseleitung. Die Pinbeschriftung der Platinen unterscheidet sich: Prüfe die Beschriftung auf deiner, besonders bei 5V und 3.3V. Die ganze Leiste zeigt der Anhang [GPIO-Belegung](../anhang/gpio.md).

## SPI einschalten

Der SPI-Anschluss ist bei einer frischen Box aus. Einschalten:

- in `dietpi-config` unter **Advanced Options › SPI state**, oder
- die Zeile `dtparam=spi=on` in die `config.txt` eintragen (`/boot/firmware/config.txt`; ältere Systeme: `/boot/config.txt`).

Danach die Box **neu starten**. Dann gibt es das Gerät `/dev/spidev0.0`.

## Einstellen

Die Einstellungen des Lesers stehen auf der Unterseite **NFC-Reader**.

| Einstellung | Wirkung |
| --- | --- |
| **Typ** | **Kein Leser** (Standard), **PN5180**, **RC522**, **PN532** oder **USB-Leser (Tastatur)** |
| **NSS an** | der Chipselect, an dem NSS hängt: **CE0** (Pin 24, Standard) oder **CE1** (Pin 26) |
| **GPIO-Pin BUSY**, **GPIO-Pin RST** | die Pins für die beiden Leitungen; zwei verschiedene |
| **Erkennen** | nur PN5180: **Beide** (Standard), nur **ISO 14443 A** oder nur **ISO 15693**. RC522, PN532 und USB-Leser lesen ISO 14443 A |
| **PN532 Anschluss**, **Serielle Schnittstelle** | nur PN532: I2C (Standard), SPI oder seriell, und bei seriell die Schnittstelle |
| **Name des USB-Lesers** | nur USB-Leser: leer lassen oder einen Teil des Namens eintragen |

Die Seite zeigt nur die Einstellungen und Hinweise des Lesers, den du bei **Typ** gewählt hast: beim RC522 zum Beispiel keine Pins BUSY, keine Wahl der Tag-Art und keine Angaben zum PN532. Jede Änderung wirkt sofort. Ein Neustart ist nicht nötig.

## Weitere Leser

Außer dem PN5180 kennt die Erweiterung drei weitere Leser. Sie wählst du bei **Typ**. Jeder Leser meldet dasselbe: ein Tag kommt, ein Tag geht (nur der USB-Leser nicht). Welches Medium ein Tag startet, ist bei allen gleich.

### RC522

Der RC522 (MFRC522) ist die kleine blaue Platine. Er liest **ISO 14443 A**, kein ISO 15693. Er arbeitet mit **3,3 V**, **nie an 5 V**. SPI muss eingeschaltet sein (siehe oben).

| RC522 | Raspberry Pi | Pin der Stiftleiste |
| --- | --- | --- |
| 3.3V | 3,3 V | 1 |
| GND | Masse | 6 |
| SCK | GPIO 11 (SPI SCLK) | 23 |
| MOSI | GPIO 10 (SPI MOSI) | 19 |
| MISO | GPIO 9 (SPI MISO) | 21 |
| SDA (= NSS) | GPIO 8 (SPI CE0) | 24 |
| RST | ein freier Pin, zum Beispiel GPIO 25 | 22 |
| IRQ | frei lassen | – |

Der **RST-Pin** ist freiwillig: Ohne Pin setzt die Erweiterung den Chip über seinen Software-Reset zurück. Wie beim PN5180 gilt: Den Taster des **Drehreglers** (ab Werk GPIO 10, MOSI) legst du auf einen anderen Pin.

### PN532

Der PN532 liest **ISO 14443 A**, kein ISO 15693. Auf der Platine (Elechouse, Adafruit und Nachbauten) wählen zwei Schalter den Anschluss; der gleiche Anschluss muss bei **PN532 Anschluss** stehen.

| Anschluss | Schalter (SEL0 / SEL1) | Verdrahtung |
| --- | --- | --- |
| **I2C** (Standard) | 1 / 0 | SDA an Pin 3 (GPIO 2), SCL an Pin 5 (GPIO 3) |
| **SPI** | 0 / 1 | wie beim RC522: SCK, MOSI, MISO und SS an CE0 (Pin 24) |
| **Seriell (UART)** | 0 / 0 | TX der Platine an Pin 10 (RXD), RX der Platine an Pin 8 (TXD) |

Versorgung: 3,3 V oder 5 V, je nach Platine (die Beschriftung prüfen), und Masse. Die Schalterstellung ist auf Platinen verschieden: Im Zweifel steht sie auf der Platine oder im Datenblatt des Händlers.

- **I2C** braucht `dtparam=i2c_arm=on` in der `config.txt` und das Modul `i2c-dev` (Zeile `i2c-dev` in `/etc/modules`), danach einen Neustart. Dann gibt es `/dev/i2c-1`.
- **SPI** wird wie oben eingeschaltet.
- **Seriell** braucht `enable_uart=1` in der `config.txt`; die Konsole auf der Schnittstelle muss aus sein (in `dietpi-config` unter **Advanced Options › Serial/UART**). Als **Serielle Schnittstelle** wählst du `/dev/serial0`; auf dem Pi 5 ist `/dev/ttyAMA0` die Schnittstelle an Pin 8 und 10. Auf einem Pi 3 und 4 hängt an `/dev/ttyAMA0` das **Bluetooth** der Box – dort nicht `/dev/ttyAMA0` wählen.

### USB-Leser (Tastatur)

Billige USB-Leser (Neuftech, Sycreader und ähnliche, oft „RFID Reader 125 kHz / 13,56 MHz“) melden sich als **Tastatur** und **tippen die Kartennummer**, meist zehn Ziffern und Enter. Sie brauchen nichts als den Stecker. Die Erweiterung liest die Tasten des Geräts und **nimmt das Gerät für sich**: Die Ziffern landen weder in der Konsole noch im Browser des Displays.

- **Name des USB-Lesers**: leer lassen, die Box findet den Leser selbst, wenn nur eine USB-Tastatur steckt (oder nur eine wie ein Leser heißt). Steckt noch eine USB-Tastatur, trägst du einen Teil des Namens ein (zum Beispiel `Sycreader`) oder den Pfad (`/dev/input/event3`). Welche Geräte es gibt, zeigt `cat /proc/bus/input/devices`.
- Die **Nummer** des Tags ist die Kartennummer, wie der Leser sie tippt. Sie steht so in der Liste der Tags (ohne Doppelpunkte). Ein Tag, den ein anderer Leser (PN5180, RC522, PN532) liest, hat eine andere Nummer: Tags sind **nicht** zwischen den Lesertypen austauschbar.
- Ein USB-Leser meldet **nur das Auflegen**, nie das Abnehmen. **Beim Abnehmen** wirkt deshalb mit ihm nicht; die Wiedergabe läuft einfach weiter. „Tag im Feld“ zeigt die Seite nicht.
- Beim ersten Einrichten (oder nach dem Einstecken eines anderen Lesers) das Gerät **neu einstecken**, damit die Berechtigung (die Udev-Regel der Erweiterung) greift.

## Medien den Tags zuordnen

Ein Tag bekommt sein Medium dort, wo du das Medium findest: in der **Bibliothek**.

1. In der Bibliothek ein **Album, einen Hörspiel-Ordner, einen Sender oder einen Podcast** öffnen: bei Ordnern der SD-Karte und des NAS das Fenster des Albums, bei Spotify-, Radio-, Podcast- und TIDAL-Einträgen das Fenster des Eintrags.
2. **NFC-Tag** antippen. Das Fenster zeigt, welche Tags das Medium schon hat (mit Bild), und lässt dich dort ein Bild ändern oder einen Tag **entfernen**.
3. **NFC-Tag hinzufügen** (beim ersten Tag) oder **Weiteren NFC-Tag hinzufügen** antippen. Das Fenster zeigt das Cover und „Lege jetzt den NFC-Tag auf den Leser“.
4. Den Tag auf den Leser legen. Das Fenster meldet „Fertig – der Tag gehört jetzt zu diesem Medium“, und das Medium startet am Display.

Ein Medium kann **mehrere Tags** haben, etwa einen für jedes Kind: Im Fenster **NFC-Tag** stehen alle, und **Weiteren NFC-Tag hinzufügen** ergänzt einen.

Der Tag startet sein Medium von da an jedes Mal, wenn er auf dem Leser liegt, ohne dass du etwas einstellst. Hatte der Tag schon ein Medium, ersetzt das neue es; das Fenster nennt das alte („Vorher: …“). Eine Zuordnung wartet höchstens **zehn Minuten** und nur, solange das Fenster offen ist: Schließt du es, sperrst du das Handy oder lädst du die App neu, ist sie nach wenigen Sekunden abgebrochen.

**Podcasts:** Ein Tag mit einem Podcast spielt eine **Folge** davon, und zwar nur eine, die auch die Kachel zeigt (deine Auswahl der Folgen und die Sortierung des Eintrags gelten): die begonnene, die noch nicht fertig gehört ist, sonst die erste noch nicht gehörte (ohne eigene Sortierung die neueste), sonst die erste. Dafür braucht die Box den Feed (Internet oder der Zwischenspeicher der Box); ist er nicht erreichbar, startet nichts.

Nicht jeder Eintrag lässt sich auf einen Tag legen: ein Ordner, der nur weitere Ordner enthält, und ein ganzer Künstler (Spotify, TIDAL) haben kein einzelnes Medium. Dort steht der Knopf nicht, oder die Box sagt „Dieses Medium lässt sich keinem Tag zuordnen“.

### Bild des Tags

In der Liste der Tags zeigt jeder Tag ein Bild. Das ist das **Cover des Mediums**, wie es auch die Kachel zeigt (ein Album mit `cover.jpg`, das Bild von Spotify, das Bild eines Podcasts, das Logo eines Senders). Ein **eigenes Bild** wählst du im Fenster **Bild wählen** oder **Bild ändern** (Suche bei iTunes, Deezer und Spotify oder ein Bild vom Gerät), entweder gleich beim Zuordnen oder später in der Liste. **Cover des Mediums nehmen** gibt das Bild des Mediums zurück.

### Flex-Tag

Mit dem Haken **Flex-Tag** im Fenster wird der Tag zum **Flex-Tag** (so heißt er auch bei TeddyCloud): ein Tag, dessen Medium du jederzeit wechseln kannst. Ordnest du später wieder mit Haken ein anderes Medium zu, hat der Flex-Tag es **sofort**, ohne dass er aufliegen muss. Es gibt nur einen Flex-Tag; ein neuer ersetzt den alten.

### Zugeordnete Tags

Die Unterseite **Zugeordnete Tags** listet alle Tags mit Bild, Medium, Art (SD-Karte, NAS, Spotify, Radio, Podcast, TIDAL) und UID. Dort änderst du das Bild eines Tags oder **entfernst** ihn; ein entfernter Tag gilt beim nächsten Auflegen wieder als neu und spielt nichts.

### Auflegen und Abnehmen

Auf der Unterseite **Zugeordnete Tags** stehen auch diese Einstellungen:

| Einstellung | Wirkung |
| --- | --- |
| **Tag startet sein Medium** | Aus: Tags werden nur gelesen und zugeordnet, nichts startet. |
| **Beim Abnehmen** | **Pausieren** (Standard), **Stoppen** oder **Weiterspielen**. Nur ein Tag, der ein Medium hat, löst das aus, und nur, solange noch läuft, was er gestartet hat: Hat das Kind inzwischen am Display etwas anderes gewählt, läuft das weiter. |

Mit **Pausieren** geht ein Hörspiel dort weiter, wo es war, wenn derselbe Tag innerhalb einer halben Stunde wieder aufliegt. Bei einem anderen Tag startet dessen Medium wie bei einem Tipp auf die Kachel. Liegt ein Tag wieder auf, während sein Medium noch läuft (beim USB-Leser bei jedem Vorhalten), spielt es einfach weiter und beginnt nicht von vorn. Wird ein Tag mit **Pausieren** oder **Stoppen** nur kurz aufgelegt und gleich wieder abgenommen, bevor die Wiedergabe beginnt, startet nichts.

Die Zuordnungen stehen in `tags.json` im Datenordner der Erweiterung (`~/.mupibox/data/extensions/nfc/`) und bleiben bei Updates erhalten. Beim Start geht die Box über das **Display** (so zählen Kachel-Zeiten, Spielzeit und „Fortsetzen“ wie bei einem Tipp); ohne laufendes Display startet ein Tag also nichts.

## Zustand

Die Karte **Zustand** oben auf der Unterseite **NFC-Reader** zeigt, wie weit der Leser ist, und aktualisiert sich selbst:

| Anzeige | Bedeutung |
| --- | --- |
| **Leser: Aus** | kein Leser gewählt |
| **Bereit**, **Firmware PN5180 4.0** | der Chip antwortet; die Versionsnummer kommt vom Chip selbst. Verdrahtung und SPI stimmen |
| **Tag im Feld** | ein Tag liegt gerade auf dem Leser |
| **Letzter Tag** | die UID (zum Beispiel `04:A1:B2:C3:D4:E5:F6`) und die Art des Tags |

Ist der Leser nicht bereit, steht unter **Hinweis**, was zu prüfen ist:

| Hinweis | Was tun |
| --- | --- |
| Bitte die Pins BUSY und RST wählen | zwei verschiedene Pins einstellen |
| SPI ist aus: dtparam=spi=on in der config.txt, dann neu starten | `dtparam=spi=on` eintragen und neu starten (siehe oben) |
| Kein Zugriff auf den SPI-Bus | die Erweiterung neu installieren, sie legt die Zugriffsregel für `/dev/spidev` an |
| Die Pakete python3-spidev und python3-lgpio fehlen | die Erweiterung neu installieren (sie lädt die Pakete) |
| Die Pins BUSY und RST lassen sich nicht belegen | ein anderes Programm hat den Pin; einen anderen wählen |
| BUSY reagiert nicht: BUSY, RST und die Stromversorgung prüfen | BUSY und RST und beide Versorgungen (5 V und 3,3 V) prüfen |
| Der Leser antwortet nicht: MISO, MOSI, SCK, NSS und die Stromversorgung prüfen | die Leitungen und die Masse prüfen, und ob der Leser beide Versorgungen hat |

Die Erweiterung läuft als Programm im Hintergrund und startet sich nach einem Fehler selbst wieder, zuerst nach wenigen Sekunden, dann langsamer. Meldungen stehen im Protokoll der Box (`pm2 logs server`, Zeilen mit `[nfc]`).
