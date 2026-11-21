# Touch-Display Cover

Die Erweiterung **Touch-Display Cover** zeigt auf einem kleinen Touch-Display nur ein **Cover**: nach dem Start das des ersten Artisten. Ein **Wisch nach links oder rechts** dreht das Cover wie einen **Würfel** zum nächsten oder vorherigen; das Bild folgt dabei dem Finger. Ein **Tippen** öffnet den Artisten (seine Alben) oder, auf einem Album, **spielt es**. Mit einem **Wisch nach oben mit zwei Fingern** geht es eine Ebene zurück (ein Finger allein tut dabei nichts, damit ein Kind nicht versehentlich zurückspringt).

Unterstützt wird das **Waveshare 2.8inch Capacitive Touch LCD** (240 × 320 Punkte, Display-Chip ST7789, Touch-Chip CST328) am **SPI-** und **I2C-Anschluss**, auf dem **Raspberry Pi 4 und dem Pi 5**. Die Erweiterung braucht die Pakete `python3-pil`, `python3-spidev` und `python3-lgpio`, die ihre Installation mitbringt.

Nach der [Installation](installieren.md) stehen die Einstellungen unter **Einstellungen › Touch-Display Cover**.

## Wie sich die Cover drehen

Die Cover einer Ebene stehen wie die Seiten eines Körpers direkt aneinander, ohne Zwischenraum. Bis **vier** Cover ist es ein **Würfel**: von einem Cover zum nächsten sind es 90 Grad. Bei **mehr als vier** Covern wird es ein Vieleck, dessen Winkel sich aus der Zahl der Cover ergibt (360 Grad geteilt durch die Zahl): bei acht Covern sind es 45 Grad von einem zum nächsten. Je mehr Cover es sind, desto flacher stehen sie und desto weniger kippen sie beim Wischen weg.

## Die Ebenen

| Ebene | Was das Display zeigt | Tippen | Mit zwei Fingern nach oben wischen |
| --- | --- | --- | --- |
| **Artisten** | das Cover des Artisten, nach Namen geordnet wie in der Bibliothek der Box | öffnet die Alben des Artisten | tut nichts |
| **Alben** | das Cover eines Albums des Artisten | **spielt das Album** (kurz erscheint ein Play-Symbol) | zurück zu den Artisten, beim selben Artisten |
| **Ordner in einem Ordner** (eine Serie auf der SD-Karte oder dem NAS) | die Alben der Serie | spielt das Album | eine Ebene zurück |

Ein Eintrag ohne Artisten, etwa eine **Playlist** oder ein **Radiosender**, steht gleich auf der ersten Ebene und **spielt** beim Tippen. Gezeigt wird, was die Bibliothek der Box kennt: Spotify, Podcasts, Radio, TIDAL, Jellyfin, Audible, die Ordner der SD-Karte und des NAS. Ein Spotify-Eintrag für einen **ganzen Artisten** (nicht für ein Album) hat hier kein Album zum Spielen und wird ausgelassen. Das Wischen läuft im Kreis: nach dem letzten Cover kommt wieder das erste. Wo nur ein Cover da ist, dreht sich nichts.

Ein Cover, das noch lädt, ersetzt zunächst der Name des Artisten auf einer Farbe. Fehlt ein Cover ganz, bleibt der Name.

## Anschließen

Das Modul hängt am SPI- und am I2C-Bus der Stiftleiste. Verdrahte bei ausgeschalteter Box:

| Modul | Raspberry Pi | Pin der Stiftleiste |
| --- | --- | --- |
| VCC | 3,3 V | 1 |
| GND | Masse | 6 |
| LCD_DIN | GPIO 10 (SPI MOSI) | 19 |
| LCD_CLK | GPIO 11 (SPI SCLK) | 23 |
| LCD_CS | GPIO 7 (**CE1**) | 26 |
| LCD_DC | ein freier GPIO, zum Beispiel GPIO 24 | 18 |
| LCD_RST | ein freier GPIO, zum Beispiel GPIO 22 | 15 |
| LCD_BL | ein freier GPIO, zum Beispiel GPIO 18 | 12 |
| TP_SDA | GPIO 2 (I2C SDA) | 3 |
| TP_SCL | GPIO 3 (I2C SCL) | 5 |
| TP_RST | ein freier GPIO, zum Beispiel GPIO 17 | 11 |
| TP_INT | bleibt frei (die Erweiterung fragt den Touch-Chip ab) | – |

> [!NOTE]
> Waveshare beschreibt für CS den Pin 24 (CE0), für DC GPIO 25 und für RST GPIO 27. Das passt nicht zusammen mit einem **NFC-Leser (PN5180)**, der CE0 und GPIO 25 und 23 braucht. Deshalb liegt CS hier auf **CE1 (Pin 26)**, und DC, RST, BL und TP_RST wählst du selbst auf freie Pins. Die Pins stellst du in der App ein: die Liste sperrt, was schon belegt ist, und sagt von wem.

Der I2C-Bus kann mit anderen Geräten geteilt werden, etwa einem OLED-Display; der Touch-Chip hat die Adresse **0x1A**.

Sind SPI oder I2C noch aus, zeigt die Karte **Display** den Block **SPI** oder **I2C** als **Aus**. Tippe auf **SPI einschalten** und **I2C einschalten** und starte die Box danach **neu**.

## Einstellungen

| Einstellung | Bedeutung |
| --- | --- |
| **CS-Anschluss des Displays** | **CE1 · Pin 26** (Standard) oder **CE0 · Pin 24**; der NFC-Leser belegt meist CE0 |
| **GPIO-Pin DC**, **RST** | nötig; verschiedene Pins, nicht die des SPI- und I2C-Anschlusses (2, 3, 7 bis 11) |
| **GPIO-Pin BL** | die Hintergrundbeleuchtung: nur damit lässt sich das Display **dimmen** und ausschalten. Ohne Pin hängt BL an 3,3 V und das Display leuchtet immer voll |
| **GPIO-Pin TP_RST** | Reset des Touch-Chips; ohne Pin hängt TP_RST an 3,3 V |
| **Was angezeigt wird** | alles, nur Musik, nur Hörbücher, nur „Sonstiges“ oder nur das NAS |
| **Namen unter dem Cover zeigen** | schreibt den Namen in den schwarzen Streifen unter dem Cover |
| **Drehung** | Hochformat, Querformat und die gedrehten Lagen, wenn das Display anders eingebaut ist |
| **Helligkeit**, **Display aus nach** | wie beim OLED-Display; eine Berührung weckt ein ausgeschaltetes Display (sie macht sonst nichts) |
| **Abends dunkler** | dunkler nach den Zeiten von „Abends dunkler“ in den Einstellungen des Displays |
| **Touch** | **Achsen tauschen**, **links und rechts spiegeln**, **oben und unten spiegeln**: nur nötig, wenn ein Wisch in die falsche Richtung zählt |

## Wenn es nicht geht

Die Zeile **Display** der Karte sagt, was fehlt:

| Meldung | Was zu tun ist |
| --- | --- |
| **Bitte die Pins DC und RST wählen** | zwei verschiedene freie Pins wählen |
| **SPI ist aus** / **I2C ist aus** | **SPI einschalten** / **I2C einschalten** antippen, die Box neu starten |
| **Kein Zugriff auf den SPI-Bus** / **I2C-Bus** | die Box einmal neu starten (die Regel für den Zugriff wird dabei aktiv) |
| **Der Touch-Chip antwortet nicht** | SDA, SCL, TP_RST und die Stromversorgung prüfen; das Modul hat zwei Ausführungen, unterstützt ist die mit dem Touch-Chip **CST328** (die neuere mit CST3530 nicht) |
| **Die Pins lassen sich nicht belegen** | ein anderes Programm hat einen der Pins; einen anderen wählen |
| **Die Pakete … fehlen** | die Erweiterung neu installieren (sie holt die Pakete) |

Bleibt das Display weiß oder schwarz, obwohl die Zeile **Bereit** sagt, stimmt meist die Verdrahtung von **DC**, **RST** oder **CS** nicht, oder **CS** steht auf dem falschen SPI-Gerät. Läuft ein Wisch in die falsche Richtung, hilft die Karte **Touch**.

> [!NOTE]
> Das Programm für das Display ist eine eigene Umsetzung nach den Angaben von Waveshare: Es schreibt über `spidev` und `lgpio` und braucht weder `RPi.GPIO` noch `smbus`; es läuft deshalb auf dem Pi 4 und dem Pi 5 gleich.
