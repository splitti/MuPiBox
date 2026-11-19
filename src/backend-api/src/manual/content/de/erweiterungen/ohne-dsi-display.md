# Ohne DSI-Display

Mit dem Schalter **Ohne DSI-Display betreiben** läuft die Box ohne Bildschirm. Das ist für eine Box gedacht, die zum Beispiel nur mit **NFC-Tags** und **Tastern** bedient wird, mit oder ohne [OLED-Display](oled.md). Eingestellt wird sie dann über die **Webapp**.

Seit MuPiBox 5.1 ist das ein Schalter der Box selbst. Vorher gab es ihn nur in der Erweiterung OLED-Display. Ein Schalter, der dort schon an war, bleibt an.

## Was sich ändert

Nach dem **nächsten Neustart**:

- Es startet **kein Kiosk**: kein X-Server und kein Chromium. Das spart Arbeitsspeicher und Strom.
- Die Box **wartet beim Start nicht** auf das Display; die übrigen Dienste starten sofort.
- Ein **NFC-Tag startet sein Medium direkt**, ohne dass ein Display es abholt: Der Server schickt den Start an den Player. Das geht mit eigenen Dateien, Hörspiel-Ordnern, NAS, Radio, Podcasts, TIDAL, Jellyfin und Audible.
- **Spotify geht ohne Display nicht**: Der Spotify-Player der Box läuft im Chromium des Displays. Ein Tag mit einem Spotify-Album spielt dann nichts.
- Bedient wird die Box über die **Webapp**, **NFC**, **Taster** und, falls vorhanden, das **OLED-Display**.

## Einschalten

1. In der Webapp **Einstellungen › Display** öffnen.
2. In der Karte **Ohne DSI-Display** den Schalter **Ohne DSI-Display betreiben** einschalten.
3. Die Box **neu starten**.

Bis zum Neustart zeigt die Karte **gilt nach dem Neustart**. Solange ein **DSI-Display angeschlossen** ist, lässt sich der Schalter nicht einschalten: Die Box würde sonst mit dunklem Display starten.

Die Box stellt dafür den Start von DietPi von der Kiosk-Anmeldung auf die manuelle Anmeldung (`dietpi-autostart 0`) und trägt `mupibox.headless` in ihre Konfiguration ein. Was vorher eingestellt war, merkt sie sich.

## Zurück zum DSI-Display

Den Schalter ausschalten und die Box neu starten: Die Box stellt den Start wieder auf den Kiosk (`dietpi-autostart 11`) oder auf das, was vorher eingestellt war.

Steckt beim Start ein **DSI-Display**, obwohl der Schalter an ist (etwa nach einer Wiederherstellung aus der Sicherung einer anderen Box oder wenn das Display später angeschlossen wurde), schaltet die Box den Kiosk von selbst wieder ein. Nach dem nächsten Neustart ist das Display wieder da.

> [!NOTE]
> Ohne Kiosk gibt es keine Anzeige am DSI-Display, auch nicht für Fehlermeldungen oder die Einrichtung. Prüfe vor dem Einschalten, dass die **Webapp** der Box erreichbar ist. Der Tageslimit-Zähler einer Kachel zählt bei einem NFC-Start ohne Display nicht mit.
