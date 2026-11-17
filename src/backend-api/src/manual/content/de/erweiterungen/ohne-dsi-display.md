# Ohne DSI-Display

Mit dem Schalter **Ohne DSI-Display betreiben** der Erweiterung [OLED-Display](oled.md) läuft die Box ohne Bildschirm. Das ist für eine Box gedacht, die nur ein OLED-Display, Taster und NFC hat und mit der Webapp bedient wird.

## Was sich ändert

Nach dem **nächsten Neustart**:

- Es startet **kein Kiosk**: kein X-Server und kein Chromium. Das spart Arbeitsspeicher und Strom.
- Die Box **wartet beim Start nicht** auf das Display; die übrigen Dienste starten sofort.
- Ein **NFC-Tag startet sein Medium direkt**, ohne dass ein Display es abholt: Der Server schickt den Start an den Player (Album, Hörspiel-Ordner, NAS, Spotify, Radio, Podcast und TIDAL).
- Bedient wird die Box über die **Webapp**, **Taster**, **NFC** und das **OLED-Display**.

## Einschalten

1. **Einstellungen › OLED-Display** öffnen.
2. Bei **Ohne DSI-Display betreiben** den Schalter einschalten und speichern.
3. Die Box **neu starten**.

Die Zeile **DSI-Display** der Karte **Display** sagt, was gerade gilt: **Wird nach dem Neustart abgeschaltet**, solange der Kiosk noch läuft, danach **Aus (ohne DSI-Display)**.

Die Erweiterung stellt dafür den Start von DietPi von der Kiosk-Anmeldung auf die manuelle Anmeldung (`dietpi-autostart 0`) und trägt `mupibox.headless` in die Konfiguration der Box ein.

## Zurück zum DSI-Display

Den Schalter ausschalten, speichern und die Box neu starten: Die Erweiterung stellt den Start wieder auf den Kiosk (`dietpi-autostart 11`), oder auf das, was vorher eingestellt war.

> [!NOTE]
> Ohne Kiosk gibt es keine Anzeige am DSI-Display, auch nicht für Fehlermeldungen oder die Einrichtung. Prüfe vor dem Einschalten, dass die **Webapp** der Box erreichbar ist und das **OLED-Display** Bild zeigt. Der Tageslimit-Zähler einer Kachel zählt bei einem NFC-Start ohne Display nicht mit.
