# Drehregler und Taster

Ein **Drehregler mit Taster** (Drehgeber im Stil des KY-040) macht die Lautstärke für Kinderhände leicht erreichbar. Er wird in der App unter **Einstellungen › Audio › Drehregler und Taster** eingeschaltet.

> [!NOTE]
> Ist die Erweiterung [Buttons & GPIO Input](../erweiterungen/buttons.md) eingeschaltet, steht diese Einstellung stattdessen unter **Einstellungen › Buttons & GPIO Input**, als Karte **Drehregler**. Mit der Erweiterung lassen sich außerdem beliebige weitere Taster anschließen.

## Anschluss

| Anschluss des Drehreglers | GPIO-Pin des Raspberry Pi |
| --- | --- |
| A (CLK) | **26** (Vorgabe) |
| B (DT) | **24** (Vorgabe) |
| Taster | **10** (Vorgabe; der Taster schaltet gegen GND) |

Die drei Pins sind die Vorgabe nach der Installation. Du kannst sie in den Einstellungen ändern (siehe unten), zum Beispiel wenn ein Pin schon für etwas anderes gebraucht wird. Dreht der Regler in die falsche Richtung, tausche die Anschlüsse A und B.

## Einstellungen

| Einstellung | Wirkung |
| --- | --- |
| **Drehregler für die Lautstärke** | schaltet den Regler ein (nach der Installation ist er aus) |
| **Schritt pro Raste** | wie viel Prozent jede Raste die Lautstärke ändert, 1 bis 10 (Standard 5) |
| **GPIO-Pin A (CLK)**, **GPIO-Pin B (DT)**, **GPIO-Pin Taster** | die Pins, an denen der Regler angeschlossen ist (siehe „Die Pins ändern“) |
| **Funktion des Tasters (GPIO …)** | **Aus**, **Play/Pause**, **Nächster Titel**, **Titelwahl (Drücken schaltet um)** oder **Vorspulen** |

Das **Maximum** der Lautstärke (**Audio › Lautstärke › Maximum (Hörschutz)**) gilt auch für den Regler: Er dreht nie lauter als erlaubt ([Sound und Lautstärke](sound.md)). Die Wahl des Taster-Verhaltens und die Schrittweite wirken sofort. Das Ein- und Ausschalten des Reglers startet seinen Dienst neu.

## Die Pins ändern

In den drei Listen stehen **nur Pins, die zum Drehregler passen und frei sind**: alle Pins der Stiftleiste, die nichts anderes nutzt. Nicht angeboten werden Pins der Box selbst (Ein-/Aus-Taster, LED, Lüfter, MuPiHAT), Pins, die die Boot-Konfiguration belegt (zum Beispiel I²C, SPI oder die Soundkarte), Pins von Erweiterungen und Pins, die gerade ein Programm hält. Ein Pin, den schon einer der drei Anschlüsse hat, steht in den anderen beiden Listen nicht mehr zur Wahl. Der aktuelle Pin bleibt immer in seiner Liste.

Eine Änderung gilt sofort: Läuft der Regler, startet die Box seinen Dienst mit den neuen Pins neu. Verdrahte den Regler vorher um (am besten bei ausgeschalteter Box) oder schalte ihn kurz aus. Das Einschalten prüft die Pins noch einmal; ist einer inzwischen belegt, bleibt der Regler aus und die App nennt, wer den Pin hält. LED und Lüfter bieten die Pins eines eingeschalteten Reglers nicht an.

## Der Taster

Den Pin des Tasters nimmt der Regler nur, solange der Taster eine Funktion hat; mit **Aus** bleibt er frei für anderes. Wählst du später eine Funktion, prüft die App, ob der Pin noch frei ist. Einen Pin des SPI- oder I²C-Anschlusses (etwa GPIO 10 bei einem NFC-Leser) nimmt der Regler nie: Der Taster bleibt dann ohne Wirkung, der Regler selbst läuft weiter.

| Funktion | Ein Druck |
| --- | --- |
| **Play/Pause** | hält die Wiedergabe an oder startet sie wieder |
| **Nächster Titel** | springt zum nächsten Titel |
| **Titelwahl (Drücken schaltet um)** | schaltet den Drehregler zwischen **Lautstärke** und **Titelwahl** um (siehe unten) |
| **Vorspulen** | springt 30 Sekunden vor |
| **Aus** | tut nichts |

### Titelwahl mit dem Drehknopf

Ist **Titelwahl (Drücken schaltet um)** gewählt, ist der Taster ein Schalter:

1. **Erster Druck**: Der Drehregler wählt jetzt **Titel** statt der Lautstärke. Jede Raste nach rechts springt zum **nächsten Titel**, jede Raste nach links zum **vorherigen**.
2. **Zweiter Druck**: Der Regler stellt wieder die **Lautstärke** ein.

Die Titelwahl endet auch von selbst: **10 Sekunden** nach dem letzten Druck oder der letzten Drehung. Jede Drehung startet die Zeit neu. Wer weiterdreht, bleibt also in der Titelwahl. Der erste Druck selbst springt noch nicht zum nächsten Titel.

> [!TIP]
> Das ist praktisch bei Alben mit vielen Titeln: Zum Hörspiel-Kapitel springen, ohne aufs Display zu schauen, und danach mit einem Druck wieder zur Lautstärke.

## Wenn er nicht reagiert

- Ist der Schalter **Drehregler für die Lautstärke** eingeschaltet? Der Dienst startet nur dann.
- Prüfe die Verkabelung der drei Pins (Vorgabe 26, 24 und 10; die gewählten stehen in den Einstellungen und in der [GPIO-Belegung](../anhang/gpio.md)).
- Lässt sich der Regler nicht einschalten und die App nennt einen belegten GPIO-Pin, hat ein Taster der Erweiterung [Buttons & GPIO Input](../erweiterungen/buttons.md) (oder etwas anderes) einen der drei Pins. Wähle einen freien Pin.
- Der Dienst heißt `mupi_rotary`.
