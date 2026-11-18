# NFC: Zugeordnete Tags

Die Unterseite **Zugeordnete Tags** (**Einstellungen › NFC-Extension › Zugeordnete Tags**) zeigt alle Tags, die ein Medium haben. Neue Tags kommen aus der Bibliothek dazu (siehe [Tag mit einem Album verknüpfen](nfc-tag-zuordnen.md)); diese Seite verwaltet sie.

![Die Seite Zugeordnete Tags](nfc-tags-page.png)

## Die Kacheln

Jeder Tag ist eine Kachel. Auf dem Handy (bis 575 Pixel Breite) steht eine Kachel in jeder Reihe, ab 576 Pixel zwei, ab 1000 Pixel drei nebeneinander.

![Drei Kacheln nebeneinander](nfc-tags-page-wide.png)

Eine Kachel zeigt von oben nach unten:

| Angabe | Bedeutung |
| --- | --- |
| **Titel** | das Medium, das der Tag startet |
| **Bild** | das Cover des Mediums oder ein eigenes Bild (siehe [Bild des Tags ändern](nfc-bild.md)) |
| **Text** | die Art (SD-Karte, NAS, Spotify, Radio, Podcast, TIDAL, Jellyfin oder Audible), die Nummer des Tags (die UID, zum Beispiel `04:A1:B2:C3:D4:E5:F6`; bei einem USB-Leser die Kartennummer, wie der Leser sie tippt) und **Flex-Tag**, wenn der Tag der Flex-Tag ist |
| **Knöpfe** | fünf Symbole, siehe unten |

Die neuesten Tags stehen oben.

## Die fünf Knöpfe

Von links nach rechts:

| Symbol | Wirkung |
| --- | --- |
| Bild | **Bild ändern**: ein eigenes Bild für den Tag wählen, oder im selben Fenster mit **Cover des Mediums nehmen** das eigene Bild wieder abgeben, siehe [Bild des Tags ändern](nfc-bild.md) |
| Abspielen | **Album abspielen**: startet das Medium des Tags, als hättest du den Tag aufgelegt |
| Pfeile | **Tag ändern**: der Tag bekommt ein anderes Album, siehe unten |
| Papierkorb | **Entfernen**: nimmt den Tag aus der Liste, nach einer Rückfrage. Ein entfernter Tag gilt beim nächsten Auflegen wieder als neu und spielt nichts |

Ein Tag, den du auflegst, der aber kein Medium hat, steht nicht in der Liste. Er spielt nichts.

## Der Player am unteren Rand

Am unteren Rand der Seite steht, immer sichtbar, ein kleiner Player. Er zeigt, was die Box gerade spielt, und steuert es:

- **Zurück**, **Abspielen/Pause** und **Weiter**,
- das Cover und den Titel,
- die Zeit und einen Balken, wie weit das Medium ist,
- die **Lautstärke** (mit dem Hörschutz der Box).

Tippst du bei einer Kachel auf **Album abspielen**, zeigt der Player nach ein, zwei Sekunden das neue Medium. Spielt schon etwas, wird es ersetzt. Der Player zeigt auch, was ein aufgelegter Tag oder ein Tipp am Display startet.

## Tag ändern

Mit **Tag ändern** bekommt der Tag ein anderes Album, ohne dass du ihn auflegen musst:

1. Tippe auf der Kachel auf **Tag ändern**. Die App wechselt in die **Bibliothek**; unten steht ein Hinweis (mit **Abbrechen**).
2. Öffne dort das Album, den Sender oder den Podcast, den der Tag künftig starten soll.
3. Unter dem Knopf **NFC-Tag** steht jetzt **Weise den NFC-Tag diesem Album zu**. Tippe darauf.

Die App geht zurück auf **Zugeordnete Tags**; die Kachel zeigt das neue Medium. Ein eigenes Bild des Tags geht dabei weg (der Tag zeigt das Cover des neuen Mediums), der Flex-Tag bleibt der Flex-Tag.

![Die Bibliothek wartet auf das neue Album](nfc-change-library.png)

![Das Album mit dem Knopf „Weise den NFC-Tag diesem Album zu“](nfc-change-sheet.png)

## Beim Abnehmen

Unter der Liste steht die Einstellung **Beim Abnehmen**: **Pausieren** (Standard), **Stoppen** oder **Weiterspielen**. Nur ein Tag, der ein Medium hat, löst das aus, und nur, solange noch läuft, was er gestartet hat: Hat das Kind inzwischen am Display etwas anderes gewählt, läuft das weiter.

Mit **Pausieren** geht ein Hörspiel dort weiter, wo es war, wenn derselbe Tag innerhalb einer halben Stunde wieder aufliegt. Bei einem anderen Tag startet dessen Medium wie bei einem Tipp auf die Kachel. Liegt ein Tag wieder auf, während sein Medium noch läuft (beim USB-Leser bei jedem Vorhalten), spielt es einfach weiter und beginnt nicht von vorn. Wird ein Tag mit **Pausieren** oder **Stoppen** nur kurz aufgelegt und gleich wieder abgenommen, bevor die Wiedergabe beginnt, startet nichts.

Ein **USB-Leser** meldet nur das Auflegen, nie das Abnehmen. Für ihn wirkt **Beim Abnehmen** nicht; die Wiedergabe läuft einfach weiter.

## Wo die Zuordnungen stehen

Die Zuordnungen stehen in `tags.json` im Datenordner der Erweiterung (`~/.mupibox/data/extensions/data/nfc/`) und bleiben bei Updates erhalten. Zusätzlich schreibt die Erweiterung sie bei jeder Änderung in eine eigene Datei, **`tag-assignments.json`**, im selben Ordner (siehe unten). Beim Start geht die Box über das **Display** (so zählen Kachel-Zeiten, Spielzeit und „Fortsetzen“ wie bei einem Tipp); ohne laufendes Display startet ein Tag also nichts.

## Sicherung, Export und Import

Welcher Tag welches Medium startet, geht nicht verloren, wenn eine Datei kaputtgeht:

- Die Zuordnung steht in einer Datei für sich, **`tag-assignments.json`**, im Datenordner der Erweiterung. Sie wird bei jeder Änderung neu geschrieben. Die Fassung davor bleibt als `tag-assignments.json.bak` erhalten, dazu eine Kopie je Tag (die Fassung vor der ersten Änderung des Tages) im Ordner `backup/`, sieben Tage lang.
- Die Datei gehört zum **Backup der Box** (**Einstellungen › System › Backup**) und kommt mit dem Zurückspielen wieder. Beim nächsten Start der Erweiterung übernimmt sie die Zuordnung aus der Datei, wenn die sich von der gemerkten unterscheidet. Ist `tags.json` verloren oder beschädigt, holt sie die Zuordnung ebenfalls aus der Datei (oder deren Kopie).
- Unter der Liste stehen nebeneinander die Knöpfe **Tags exportieren** und **Tags importieren**. Mit **Tags exportieren** speicherst du die Liste der Tags mit ihrem Medium als **Tabelle** (`mupibox-nfc-tags-JJJJ-MM-TT.csv`) auf dem Gerät, auf dem du die App geöffnet hast; Excel (und LibreOffice) öffnet sie mit einem Doppelklick. Mit **Tags importieren** wählst du so eine Tabelle aus (auch von einer anderen Box oder von dir geschrieben). Neue Tags kommen dazu; ein Tag, den die Box schon kennt, bekommt das Medium aus der Tabelle. Was nicht in der Tabelle steht, bleibt unverändert. Zeilen, die sich nicht abspielen lassen, werden übersprungen. Statt der Tabelle nimmt der Import auch eine JSON-Datei.

### Die Tabelle

Eine Zeile je Tag, die Spalten (mit Semikolon getrennt):

| Spalte | Inhalt |
| --- | --- |
| **UID** | die Nummer des Tags, zum Beispiel `04:A1:B2:C3` |
| **Titel**, **Interpret**, **Kategorie** | wie in der Bibliothek |
| **Art** | `library` (Bibliothek/SD-Karte), `nas`, `spotify`, `radio`, `rss` (Podcast) oder `tidal` |
| **Adresse** | der Ordner (`library`), der Pfad auf dem NAS, die Spotify-ID, die Adresse des Senders oder Podcasts |
| **Flex-Tag** | `ja` beim Flex-Tag |
| **Bild**, **Cover** | die Bilder des Tags |
| **Medium (technisch)** | das ganze Medium; steht hier etwas, gilt es, und die Spalten davor sind nur zum Lesen |

Eine Tabelle von Hand geht auch: Es genügen die Spalten **UID**, **Art**, **Titel** und **Adresse** (die Spalte **Medium (technisch)** leer lassen oder weglassen). Die Spaltennamen dürfen auch englisch sein (`uid`, `type`, `title`, `address`), und statt des Semikolons gehen Komma oder Tabulator.

Die Tabelle enthält nur Tags, die ein Medium haben, nicht, wann und wie oft sie aufgelegt wurden. Die Medien werden über ihren Pfad oder ihre Adresse gefunden: Auf einer anderen Box funktionieren die Tags also nur, wenn dort dieselben Alben unter demselben Pfad liegen oder es Sender, Podcasts und Spotify-Einträge sind.
