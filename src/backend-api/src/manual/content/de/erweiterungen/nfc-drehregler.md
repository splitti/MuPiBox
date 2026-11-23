# NFC: Drehregler

Ein Tag kann nicht nur ein Album starten, sondern ein **ganzes Artistcover**: alle Alben eines Interpreten in der Bibliothek, einen **Ordner der SD-Karte** oder einen **Ordner auf dem NAS**. Der Tag spielt dann **ein** Album davon, und mit dem **Album-Drehregler** (KY-040) schaltest du durch die anderen.

Der Drehregler der NFC-Extension ist **nur für die Wahl des Albums** da. Er hat **eigene Pins** und ist ein anderer Drehregler als der für Lautstärke und Titel (siehe [Drehregler und Taster](../hardware/drehregler.md)). Du kannst beide zugleich anschließen.

## Einen Tag einem Artistcover zuordnen

1. Öffne in der Bibliothek den **Interpreten** (oder den Ordner), nicht ein einzelnes Album. Er muss mindestens zwei Alben haben.
2. Tippe **NFC-Tag** an und lege den Tag auf (genau wie bei einem Album, siehe [Tag mit einem Album verknüpfen](nfc-tag-zuordnen.md)).

Der Tag trägt den Namen des Artistcovers. Beim ersten Auflegen spielt das **erste Album** der Liste (nach Namen sortiert).

## Welches Album beim Auflegen spielt

Auf der Seite **Zugeordnete Tags** ([Zugeordnete Tags](nfc-zugeordnete-tags.md)) hat die Kachel eines solchen Tags eine **Auswahlliste**: **Album beim Auflegen**. Wähle dort das Album, das der Tag beim Auflegen spielen soll. Die Liste zeigt alle Alben des Artistcovers; was nicht mehr auf der Box ist, fehlt.

## Mit dem Drehregler ein anderes Album wählen

Der Drehregler wählt nur unter den **Alben des Artistcovers, dessen Tag gerade aufliegt** (oder zuletzt aufgelegt wurde). Nach dem Auflegen eines solchen Tags gilt für eine Weile:

| Du | Die Box |
| --- | --- |
| **drehst nach rechts** | geht zum **nächsten** Album der Liste (nach dem letzten kommt das erste) |
| **drehst nach links** | geht zum **vorherigen** Album |
| **drückst den Taster** | **spielt** das Album, bei dem der Drehregler steht |

Der Drehregler **ändert dabei nichts** am Tag: Beim nächsten Auflegen spielt wieder das Album aus der Auswahlliste.

Ein Druck, **bevor** du gedreht hast, wählt nichts aus. Nach einer Wahl bleibt der Drehregler beim Album, das jetzt spielt: Du kannst sofort weiterdrehen und ein anderes Album wählen. Dreht niemand, geht die Wahl nach der eingestellten Zeit zu Ende. Jede Drehung und jede Wahl startet die Zeit neu. Ohne aufgelegten Tag tut der Album-Drehregler nichts.

## OLED-Display

Ist das [OLED-Display](oled.md) angeschlossen, zeigt es beim Drehen **in den Informationen** den Interpreten (oder Ordner) und darunter den **Namen** des Albums, bei dem der Drehregler gerade steht, mit seinem Platz in der Liste („< 2/12 >“). Lange Namen laufen durch. Statusleiste und die Zeile unten mit der Zeit bleiben, sie zeigen, was gerade noch spielt. Ein Druck auf den Taster spielt das Album, und das Display zeigt wieder die **normale Anzeige des Players**. Drehst du, wählst aber nichts aus, geht das Display nach **10 Sekunden** ohne Drehen von selbst zurück zur vorherigen Anzeige (dem Player). Ein Druck wählt dann nichts aus, bis du wieder drehst.

## Anschluss und Einstellungen

**Einstellungen › NFC-Extension › Drehregler**:

| Einstellung | Wirkung |
| --- | --- |
| **GPIO-Pin A (CLK)**, **GPIO-Pin B (DT)** | die beiden Pins des Drehreglers |
| **GPIO-Pin Taster** | der Pin des Tasters (nach Masse geschaltet): Ein Druck spielt das gewählte Album |
| **Nach dem Auflegen aktiv (Sekunden)** | Ein Regler von **0 bis 120 Sekunden** (Vorgabe 20): so lange nach dem Auflegen, nach jedem Drehen und nach jeder Wahl wählt der Drehregler Alben. **0** heißt **immer aktiv**: Der Drehregler wählt Alben, bis du einen anderen Tag auflegst. |

Die Listen zeigen **nur freie Pins**: keine, die die Box selbst, die Boot-Konfiguration, ein NFC-Leser, eine andere Erweiterung oder ein anderer Drehregler nutzt. Ohne alle **drei** Pins gibt es den Album-Drehregler nicht. **Eine Raste ist ein Album**, und der **Taster bestätigt** das Album, bei dem der Drehregler steht. Dreht der Regler in die falsche Richtung, tausche die Anschlüsse A und B.

## Was dafür nötig ist

- Drei **freie GPIO-Pins** für diesen Drehregler. Pins des SPI-Anschlusses (GPIO 9, 10, 11, auch 7 und 8) gehören den NFC-Lesern.
- Das Artistcover hat **mindestens zwei** Alben. Mit einem einzigen gibt es nichts zu wählen.

## Wenn es nicht klappt

- Der Drehregler tut nichts: Prüfe die Verkabelung (A und B nicht vertauscht, Masse und Pins richtig). Sonst: Die Zeit nach dem Auflegen ist um (Tag noch einmal auflegen), einer der drei Pins fehlt, oder das Artistcover hat nur ein Album.
- Der Taster wählt nichts aus: Du musst zuerst **drehen**.
- Lautstärke oder Titel sollen auch einen Drehregler haben: Das ist ein anderer, unter **Einstellungen › Audio › Drehregler und Taster**.
- Die Auswahlliste fehlt in der Kachel: Die Box konnte die Alben nicht lesen (das NAS ist nicht erreichbar, der Ordner ist weg). Sie erscheint wieder, wenn die Alben gelesen werden können.
