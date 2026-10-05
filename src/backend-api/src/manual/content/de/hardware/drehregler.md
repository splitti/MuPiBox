# Drehregler und Taster

Ein **Drehregler mit Taster** (Drehgeber im Stil des KY-040) macht die Lautstärke für Kinderhände leicht erreichbar. Er wird in der App unter **Einstellungen › Audio › Drehregler und Taster** eingeschaltet.

## Anschluss

| Anschluss des Drehreglers | GPIO-Pin des Raspberry Pi |
| --- | --- |
| A (CLK) | **26** |
| B (DT) | **24** |
| Taster | **10** (der Taster schaltet gegen GND) |

Dreht der Regler in die falsche Richtung, tausche die Anschlüsse A und B.

## Einstellungen

| Einstellung | Wirkung |
| --- | --- |
| **Drehregler für die Lautstärke** | schaltet den Regler ein (nach der Installation ist er aus) |
| **Schritt pro Raste** | wie viel Prozent jede Raste die Lautstärke ändert, 1 bis 10 (Standard 5) |
| **Funktion des Tasters (GPIO 10)** | **Aus**, **Play/Pause**, **Nächster Titel**, **Titelwahl (Drücken schaltet um)** oder **Vorspulen** |

Das **Maximum** der Lautstärke (**Audio › Lautstärke › Maximum (Hörschutz)**) gilt auch für den Regler: Er dreht nie lauter als erlaubt ([Sound und Lautstärke](sound.md)). Die Wahl des Taster-Verhaltens und die Schrittweite wirken sofort. Das Ein- und Ausschalten des Reglers startet seinen Dienst neu.

## Der Taster

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
- Prüfe die Verkabelung der Pins 26, 24 und 10 ([GPIO-Belegung](../anhang/gpio.md)).
- Der Dienst heißt `mupi_rotary`.
