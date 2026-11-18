# NFC: USB-Leser anschließen

Billige USB-Leser (Neuftech, Sycreader und ähnliche, oft „RFID Reader 125 kHz / 13,56 MHz“) melden sich als **Tastatur** und **tippen die Kartennummer**, meist zehn Ziffern und Enter. Sie brauchen **keine Verdrahtung**, nur den Stecker: in einen **beliebigen USB-Anschluss** der Box stecken.

![Ein USB-Leser an der Box](wiring-usb.svg)

Die Erweiterung liest die Tasten des Geräts und **nimmt das Gerät für sich**: Die Ziffern landen weder in der Konsole noch im Browser des Displays.

## USB Reader 1 und USB Reader 2

Die Box ordnet die USB-Geräte selbst zu: Du trägst keinen Namen ein. Bei **Typ** stehen **USB Reader 1** und **USB Reader 2**:

- **USB Reader 1** ist das erste USB-Gerät, das die Box findet, **USB Reader 2** das zweite, nach dem Anschluss, in dem das Gerät steckt.
- Im Menü **Typ** steht hinter dem Namen das Gerät, das gemeint ist (zum Beispiel „USB Reader 1 · Tera 5100 dongle“).
- **USB Reader 2** ist **grau**, solange kein zweites USB-Gerät erkannt ist.
- Steckst du ein Gerät in einen anderen Anschluss, kann die Zuordnung wechseln; prüfe dann im Menü **Typ**, welches Gerät hinter **USB Reader 1** und **USB Reader 2** steht.

Zwei USB-Leser nebeneinander: Der eine Leser auf **USB Reader 1**, der andere auf **USB Reader 2** (siehe [Leser hinzufügen](nfc-leser.md)). Zwei Leser mit demselben Typ wollen dasselbe Gerät.

## Der Zustand

Die Karte **Zustand** zeigt bei **Gerät** den **Namen des Lesers**, wie das Gerät sich selbst nennt, sonst wie die USB-Datenbank der Box seine Kennung nennt (zum Beispiel „Tera 5100 dongle“ statt „HID 0581:011c“); neben dem **Letzten Tag** steht derselbe Name.

## Was ein USB-Leser anders macht

- Die **Nummer** des Tags ist die Kartennummer, wie der Leser sie tippt. Sie steht so in der Liste der Tags (ohne Doppelpunkte). Ein Tag, den ein anderer Leser (PN5180, RC522, PN532) liest, hat eine andere Nummer: Tags sind **nicht** zwischen den Lesertypen austauschbar.
- Ein USB-Leser meldet **nur das Auflegen**, nie das Abnehmen. **Beim Abnehmen** wirkt deshalb mit ihm nicht; die Wiedergabe läuft einfach weiter. „Tag im Feld“ zeigt die Seite nicht.
- Auch ein **USB-Barcodeleser** ist so ein Leser: Er tippt die Nummer des Barcodes (Ziffern, auch Buchstaben von A bis F) und Enter. Seine Nummer ist die Nummer des Tags; ein Etikett mit Barcode kann so ein Medium starten.
- Beim ersten Einrichten (oder nach dem Einstecken eines anderen Lesers) das Gerät **neu einstecken**, damit die Berechtigung (die Udev-Regel der Erweiterung) greift.
