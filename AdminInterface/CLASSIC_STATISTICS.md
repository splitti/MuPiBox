# MuPiBox Classic: freiwillige Statistik und Spendenhinweise

Die Classic-Implementierung verwendet denselben Statistikdienst wie MuPiBox NG, meldet
aber durchgehend das Produkt `classic`. Sie ändert weder den Player noch die
Wiedergabe. Spendenhinweise werden ausschließlich in der Admin-Oberfläche angezeigt.

## Freiwillige Statistik

- **Standardzustand:** Aus. Vor einer ausdrücklichen Einwilligung wird kein
  Installationsbericht gesendet und keine Hardwarekennung für die Statistik
  gelesen. Ein monatlicher Hinweis im Admin-Bereich erklärt die Teilnahme.
- **Einschalten:** Admin > Voluntary installation statistics. Die Zustimmung
  wird lokal gespeichert, zufällig tokenisiert und an die Geräte-Seriennummer
  kryptografisch gebunden. Beim Wiederherstellen der Konfiguration auf einem
  anderen Raspberry Pi wird sie nicht übernommen.
- **Meldung:** Höchstens täglich, zusätzlich nach Versionswechsel oder
  bewusster Anforderung im Admin-Bereich. Ziel:
  `https://stat.mupibox.de/api/v1/report.php`.
- **Felder:** Classic-Version, Pi-Modell, DietPi/Debian, Displayauflösung,
  Hauptaudiohardware (Konfiguration, nicht nur aktive Senke), grobe
  Audiokategorie, MuPiHAT, HiFiBerry, OnOff SHIM falls eindeutig bekannt,
  Controller-/Webcam-Präsenz sowie die Raspberry-Pi-Seriennummer und ein
  zufälliges Consent-Token für die pseudonyme Monatszählung.
- **Keine Medien-/Verhaltensdaten.** Die Seriennummer wird nur zum Ermitteln
  der wechselnden pseudonymen Monatskennung verarbeitet, nicht gespeichert.
  Die Serververbindung verarbeitet technisch die IP-Adresse. Nach 45 Tagen
  ab Monatsende bleiben nur aggregierte Monatswerte.
- **Widerruf:** Sofortiges Abschalten; ausstehende Löschanforderungen bleiben
  lokal vorgemerkt, auch während der Server offline ist, und werden über
  `https://stat.mupibox.de/api/v1/erase.php` abgearbeitet.
- **Erinnerung:** Höchstens einmal pro UTC-Kalendermonat, solange aus;
  der zuletzt angezeigte Monat wird auf der Box selbst gespeichert.

Technischer Speicher: `installationStatistics` in
`/etc/mupibox/mupiboxconfig.json`. Beim Wechsel auf eine neue
Einwilligungsversion wird die bisherige Einwilligung zurückgezogen.

**Wichtig beim produktiven Ausrollen:** Der gemeinsame Statistikserver
akzeptiert im Standardzustand nur NG. Im privaten
`deploy/stat-server/private/config.php` der Statistikinstallation muss
`'enabled_products' => ['ng', 'classic']` freigegeben sein. Dies ist eine
serverseitige Betriebsänderung; ohne diese Einstellung weist der Server
Classic-Berichte zurück, die UI kennzeichnet den Fehler. Keine Änderung
an einem ungeprüften Server als bereits durchgeführt ausgeben.

## Spendenhinweise

Die Admin-Oberfläche zeigt einen Link zur freiwilligen Projektförderung
(`https://mupibox.de/spenden/`) im Footer. Zusätzlich erscheint im
jeweiligen Admin-Browser höchstens einmal alle sieben Tage ein
Spendenhinweis. Spenden und Statistik sind vollständig voneinander
unabhängig. Die Nutzung ist ohne Spende nicht eingeschränkt.

## Tests

```sh
node --test AdminInterface/tests/classic-notices.test.cjs
node_modules/.bin/tsx --test src/backend-api/src/telemetry.spec.ts
node_modules/.bin/tsc --noEmit -p src/backend-api/tsconfig.json
php -l AdminInterface/www/admin.php
php -l AdminInterface/www/statistics_reminder.php
php -l AdminInterface/www/includes/footer.php
```
