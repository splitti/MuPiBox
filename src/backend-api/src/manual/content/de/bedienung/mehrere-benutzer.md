# Mehrere Benutzer

Teilen sich mehrere Kinder eine Box, bekommt jedes seine eigene Bibliothek, Spielzeit und Ruhezeiten und eigene Einstellungen. Alles dazu steht in der App unter **Einstellungen › Mehrere Benutzer**. Im Standard ist das aus: Die Box hat dann einen Benutzer, wie bisher.

## Einschalten

Schalte **Mehrere Benutzer** ein. Der bisherige Stand der Box wird zum ersten Benutzer **Standard**, den du umbenennen kannst. Mit **Benutzer anlegen** kommt ein weiteres Kind dazu:

- **Leer anfangen**: eine leere Bibliothek.
- **Kopie der Bibliothek von …**: die Bibliothek eines anderen Benutzers als Start, mit seinen Spotify-Abos.

Die Einstellungen (Theme, Lautstärke, Startseite …) übernimmt ein neuer Benutzer vom aktiven Benutzer, bei einer Kopie von dem kopierten. Jeder Benutzer hat eine eigene **Farbe**. Das Display zeigt sie als Punkt oben rechts. Es gibt neun Farben, also höchstens neun Benutzer.

## Was jedes Kind für sich hat

| Eigenes | Gemeinsam für die ganze Box |
| --- | --- |
| Bibliothek mit Kacheln, Spotify-Abos und Podcasts | Anmeldungen bei Spotify, TIDAL, Jellyfin, Audible |
| Zuletzt gehört, Weiterhören, gehörte Folgen | WLAN, NAS, Freigaben |
| [Hör-Verlauf](../spielzeit/hoer-verlauf.md) und Statistik | eigene Dateien der Box (Medienordner) |
| [Tageslimits](../spielzeit/tageslimits.md), [Ruhezeiten](../spielzeit/ruhezeiten.md), [Kachel-Limits](../spielzeit/kachel-limit.md) | die Fotoalben selbst |
| Bildzeit und welche Fotoalben das Display zeigt | NFC-Karten, Tasten, OLED und andere Erweiterungen |
| Theme, Lautstärken, Startseite, Uhr, Helligkeit | Telegram, Home Assistant, MQTT, Schlaftimer |
| Einstellungen einer Erweiterung, die mit **je Benutzer** markiert sind (etwa die Vereine bei [Fußball](../erweiterungen/fussball.md)) | |

Eigene Dateien zeigt die Box allen Kindern. Jedes Kind hat seine eigenen ausgeblendeten Cover: Mit **Kein Cover** blendest du eines für das Kind aus, das gerade hört.

## Wechseln

**In der App** wechselst du auf der Startseite oder unter **Einstellungen › Mehrere Benutzer** mit **Wechseln**. Der Wechsel dauert etwa eine Sekunde. Was gerade läuft, hält an, und das Display lädt neu mit Theme, Startseite und Bibliothek des anderen Kindes.

**Am Display** tippt man auf den farbigen **Punkt** oben rechts. Es öffnet sich **Wer hört?** mit einer Kachel je Kind. Wie dort gewechselt wird, stellst du unter **Wechsel am Display** ein:

| Einstellung | Wirkung |
| --- | --- |
| **Antippen** | ein Tipp auf die Kachel wechselt |
| **Halten** | die Kachel drei Sekunden halten, so wechselt niemand aus Versehen |
| **Nur in der App** | der Punkt zeigt nur, wer gerade hört, gewechselt wird nur in der App |

Das geht auch vom **Sperrbild** aus. Die Spielzeit gilt ja je Kind: Hat ein Geschwister noch Zeit übrig, darf es hören. Eine Pause, die du in der App oder bei Telegram mit **Ruhe sofort** setzt, gilt dagegen für die ganze Box, auch nach einem Wechsel.

## PIN

Jeder Benutzer kann eine **PIN** aus vier Ziffern bekommen (**PIN** in seiner Zeile). Das Display fragt sie, bevor es **zu diesem Benutzer** wechselt. So kommt ein Kind nicht an die Bibliothek eines Erwachsenen oder an die Spielzeit eines Geschwisters. Nach fünf falschen Versuchen nimmt das Display eine Minute lang keine PIN an. Die App, Telegram, Home Assistant und MQTT fragen keine PIN.

## Ein anderes Kind bearbeiten, ohne zu wechseln

Auf den Seiten **Bibliothek**, **Spielzeit** und **Hör-Verlauf** steht oben eine Auswahl, für welches Kind du gerade arbeitest. Du kannst die Bibliothek, Abos, Limits und Ruhezeiten eines Kindes ändern, während ein anderes hört. Die Änderungen gelten, sobald es an der Reihe ist. Bonus-Minuten für heute zählen ebenso.

Nur beim aktiven Kind gehen **Abspielen**, **Sperren aufheben**, **Ruhe sofort**, **Kein Cover** und einzelne Folgen offline behalten, denn sie wirken auf das, was die Box gerade tut oder zeigt. Smart-Sync ein- und ausschalten und seine Konflikte (**Bibliothek › Spotify**) gelten ebenfalls für das aktive Kind.

## Was im Hintergrund für alle läuft

- **Smart-Sync**: Die Box gleicht die Spotify-Abos jedes Kindes ab, jeweils in seine eigene Bibliothek, jedes in seinem eigenen Abstand. Ein- und ausgeschaltet wird er je Kind, während es aktiv ist (**Bibliothek › Spotify**). Ein Kind mit leerer Bibliothek beginnt ohne Smart-Sync: Neue Abos kommen dann einmal auf die Box, spätere Folgen erst, wenn sein Smart-Sync an ist.
- **Offline-Folgen** von Podcasts liegen einmal auf der SD-Karte. Eine Folge bleibt, solange ein Kind sie behalten will. Hat ein Kind 1 Folge eingestellt und ein anderes 3, liegen die 3 neuesten dort.
- **Telegram**: Ein Name am Ende eines Befehls meint dieses Kind, ohne Namen das aktive (`/status Leni`, `/extend 30 Leni`, siehe [Telegram](../netzwerk/telegram.md)). Der Wochenrückblick kommt für jedes Kind einzeln.

## NFC-Karten

Karten gelten für die ganze Box und wechseln nie das Kind. Liegt das, was eine Karte startet, nicht in der Bibliothek des aktiven Kindes, spielt nichts und das Display sagt es kurz. Im Zweifel spielt die Karte lieber: Eigene Dateien und NAS spielen immer, ebenso ein Album aus einem Künstler, einer Serie oder einer Suche der Bibliothek.

## Ausschalten

Schaltest du **Mehrere Benutzer** aus, wählst du, mit wem die Box weiterläuft. Die anderen ruhen mit allem, was sie haben: Ihre Abos werden nicht abgeglichen, ihre Offline-Folgen bleiben. Schaltest du es wieder ein, sind sie wieder da.

## Entfernen und Papierkorb

**Entfernen** legt einen Benutzer für 30 Tage in den Papierkorb, mit Bibliothek, Einstellungen und PIN. Von dort holst du ihn zurück. Den aktiven Benutzer kannst du nicht entfernen, wechsle vorher.

## Backup

Ein [Backup](../wartung/backup.md) enthält alle Benutzer: ihre Liste, ihre Bibliotheken und Einstellungen, nicht den Papierkorb. Beim Einspielen kommen alle so zurück, wie sie im Backup waren. Benutzer, die das Backup nicht kennt, landen im Papierkorb.
