# Ohne DSI-Display

Mit dem Schalter **Ohne DSI-Display betreiben** läuft die Box ohne Bildschirm. Das ist für eine Box gedacht, die zum Beispiel nur mit **NFC-Tags** und **Tastern** bedient wird, mit oder ohne [OLED-Display](oled.md). Eingestellt wird sie dann über die **Webapp**.

Seit MuPiBox 5.1 ist das ein Schalter der Box selbst. Vorher gab es ihn nur in der Erweiterung OLED-Display. Ein Schalter, der dort schon an war, bleibt an.

## Was sich ändert

Nach dem **nächsten Neustart**:

- Es startet **kein Kiosk**: kein X-Server und, ohne Spotify bereithalten, kein Chromium. Das spart Arbeitsspeicher und Strom.
- Die Box **wartet beim Start nicht** auf das Display; die übrigen Dienste starten sofort.
- Ein **NFC-Tag startet sein Medium direkt**, ohne dass ein Display es abholt: Der Server schickt den Start an den Player. Das geht mit eigenen Dateien, Hörspiel-Ordnern, NAS, Radio, Podcasts, TIDAL, Jellyfin und Audible.
- **Spotify** geht nur mit **Spotify bereithalten** (siehe unten): Der Spotify-Player der Box läuft im Browser des Displays. Ohne diesen Schalter spielt ein Tag mit einem Spotify-Album nichts.
- Bedient wird die Box über die **Webapp**, **NFC**, **Taster** und, falls vorhanden, das **OLED-Display**.

## Einschalten

1. In der Webapp **Einstellungen › Display** öffnen.
2. In der Karte **Ohne DSI-Display** den Schalter **Ohne DSI-Display betreiben** einschalten.
3. Die Box **neu starten**.

Bis zum Neustart zeigt die Karte **gilt nach dem Neustart**. Solange ein **DSI-Display angeschlossen** ist, lässt sich der Schalter nicht einschalten: Die Box würde sonst mit dunklem Display starten.

Ein Display gilt als angeschlossen, wenn sein **Touch-Chip** am I2C-Bus meldet (zum Beispiel beim offiziellen 7"-Display, bei Waveshare und EDATEC) oder der Anschluss ein **EDID** liefert. Der DSI-Anschluss selbst sagt dafür nichts: Der Kernel meldet ihn als verbunden, sobald ein DSI-Overlay in der `config.txt` steht (das **Display-Modell**), auch ohne Display. Findet die Box kein Display, steht unter dem Schalter ein Hinweis, und die App **fragt beim Einschalten nach**. Ein Display ohne Touch-Chip und ohne EDID erkennt die Box nicht: Hängt so eines dran und du bestätigst, bleibt es nach dem Neustart dunkel; dann den Schalter in der Webapp wieder ausschalten.

Die Box stellt dafür den Start von DietPi von der Kiosk-Anmeldung auf die manuelle Anmeldung (`dietpi-autostart 0`) und trägt `mupibox.headless` in ihre Konfiguration ein. Was vorher eingestellt war, merkt sie sich.

## Spotify bereithalten

Ist **Ohne DSI-Display betreiben** an, erscheint darunter der Schalter **Spotify bereithalten**. Mit ihm startet die Box den Browser **unsichtbar im Hintergrund**, ohne Bildschirm. Darin läuft der Spotify-Player der Box wie sonst auf dem Display: Spotify-Kacheln, NFC-Tags mit Spotify-Alben und Spotify Connect spielen dann auch ohne Display.

- Der Browser braucht etwa **so viel Arbeitsspeicher wie der Betrieb mit Display** (ohne X-Server eher etwas weniger). Was mit Display läuft, läuft also auch so.
- Läuft die Box schon ohne Display, ist Spotify nach dem Einschalten gleich da. Sonst nach dem nächsten Neustart.
- Ausschalten beendet den Browser sofort.

## Zurück zum DSI-Display

Den Schalter ausschalten und die Box neu starten: Die Box stellt den Start wieder auf den Kiosk (`dietpi-autostart 11`) oder auf das, was vorher eingestellt war.

Steckt beim Start ein **DSI-Display**, obwohl der Schalter an ist (etwa nach einer Wiederherstellung aus der Sicherung einer anderen Box oder wenn das Display später angeschlossen wurde), schaltet die Box den Kiosk von selbst wieder ein. Nach dem nächsten Neustart ist das Display wieder da.

> [!NOTE]
> Ohne Kiosk gibt es keine Anzeige am DSI-Display, auch nicht für Fehlermeldungen oder die Einrichtung. Prüfe vor dem Einschalten, dass die **Webapp** der Box erreichbar ist.
