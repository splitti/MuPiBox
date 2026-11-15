# Buttons & GPIO Input

Mit der Erweiterung **Buttons & GPIO Input** steuern **echte Taster** die Box: Play/Pause, nächster Titel, lauter, leiser und mehr. Jeder Taster hängt an einem GPIO-Pin des Raspberry Pi, den du selbst wählst.

Nach der [Installation](installieren.md) stehen die Einstellungen auf einer eigenen Seite: **Einstellungen › System › Buttons & GPIO Input**. Dort steht dann auch die Karte **Drehregler** ([Drehregler und Taster](../hardware/drehregler.md)), die sonst unter **Einstellungen › Audio** zu finden ist.

## Anschluss

Ein Taster verbindet seinen **GPIO-Pin mit GND** (Masse). Mehr braucht es nicht: kein Widerstand, keine Versorgung. Die Box schaltet den internen Pull-up des Pins selbst ein.

| Anschluss des Tasters | Raspberry Pi |
| --- | --- |
| Kontakt 1 | ein freier GPIO-Pin (in der App gewählt) |
| Kontakt 2 | GND (zum Beispiel Pin 6, 9, 14, 20, 25, 30, 34 oder 39 der Stiftleiste) |

Die Auswahl in der App nennt jeden Pin mit seiner **GPIO-Nummer** und der **Nummer auf der Stiftleiste**, zum Beispiel „GPIO 5 (Pin 29)". Die ganze Leiste zeigt der Anhang [GPIO-Belegung](../anhang/gpio.md).

> [!WARNING]
> Schließe einen Taster nur zwischen einem GPIO-Pin und GND an, nie an 3,3 V oder 5 V. Verdrahte bei ausgeschalteter Box.

## Taster anlegen

Am Anfang steht auf der Seite nur **Taster 1**. Mit **+ Taster** rechts unten kommt ein weiterer dazu (bis zu sechs), mit **+ Doppeltaster** ein Doppeltaster (bis zu zwei). Der Papierkorb rechts neben dem Namen entfernt einen hinzugefügten Taster wieder; seine Pins sind danach frei.

| Einstellung | Wirkung |
| --- | --- |
| **Name** (das Feld mit „Taster 1") | ein eigener Name für den Taster, zum Beispiel „Lauter". Ohne Namen heißt er „Taster 1", „Taster 2" … |
| **GPIO-Pin** | der Pin, an dem der Taster hängt. **Kein Pin** schaltet den Taster ab. Die übrigen Einstellungen erscheinen, sobald ein Pin gewählt ist |
| **Kurz drücken** | die Aktion für einen kurzen Druck |
| **Lang drücken** | die Aktion für einen langen Druck, oder **Keine Aktion** |
| **Haltezeit** | ab wann ein Druck als lang gilt: 0,5 bis 3 Sekunden (Standard 1 Sekunde) |
| **Beim Halten wiederholen** | die Aktion wiederholt sich, solange der Taster gedrückt bleibt (viermal pro Sekunde), zum Beispiel für die Lautstärke |

Jede Änderung wird sofort gespeichert und gilt sofort. Ein Neustart ist nicht nötig.

### Belegte Pins

Pins, die schon vergeben sind, lassen sich nicht wählen. Die Liste nennt, **wer** den Pin hält: die Box selbst (Ein-/Aus-Taster, LED, Lüfter, eingeschalteter Drehregler, MuPiHAT), die Boot-Konfiguration (zum Beispiel die Soundkarte), eine andere Erweiterung oder ein anderer Taster dieser Seite.

Die drei Pins des **Drehreglers** (Vorgabe 26, 24 und 10, in seinen Einstellungen änderbar) sind frei, solange der Drehregler ausgeschaltet ist; die Liste zeigt sie dann mit dem Hinweis „Drehregler (ausgeschaltet)". Hat ein Taster einen dieser Pins, lässt sich der Drehregler nicht einschalten, bis der Pin wieder frei ist. Umgekehrt nehmen LED und Lüfter keinen Pin, den ein Taster hat.

## Kurz und lang drücken

Ein Taster kann zwei Aktionen haben („Dual Action"):

- **Ohne lange Aktion** wirkt die kurze **sofort beim Drücken**.
- **Mit langer Aktion** wirkt die kurze **beim Loslassen** und die lange, **sobald die Haltezeit erreicht ist**. Du musst für die lange Aktion also nicht loslassen.

Beispiel: kurz = **Vorheriger Titel**, lang = **Von vorn beginnen**. Ein kurzer Druck springt einen Titel zurück; wer den Taster eine Sekunde hält, startet das Album oder die Playlist von vorn.

Mit **Beim Halten wiederholen** wiederholt sich die lange Aktion, solange der Taster gedrückt bleibt. Hat der Taster keine lange Aktion, wiederholt sich die kurze, sobald er die Haltezeit lang gehalten wurde. So wird aus einem Taster mit **Lauter** ein Taster, der beim Halten immer lauter stellt.

## Doppeltaster

Ein **Doppeltaster** sind zwei Taster (A und B) mit zusammen **sechs Aktionen**: jeder allein und beide zusammen, jeweils kurz oder lang.

| Druck | Beispiel |
| --- | --- |
| **A kurz** | Vorheriger Titel |
| **B kurz** | Nächster Titel |
| **A und B kurz** | Play/Pause |
| **A lang** | Leiser |
| **B lang** | Lauter |
| **A und B lang** | Ausgabe wechseln |

Die kurzen Aktionen wirken beim Loslassen, die langen, sobald die Haltezeit erreicht ist. „Beide zusammen" heißt: Der zweite Taster wird gedrückt, während der erste noch gehalten wird. **Beim Halten wiederholen** gilt nur für A oder B allein, nie für beide zusammen.

Ein Doppeltaster braucht **beide** Pins. Solange nur einer gewählt ist, liest die Box ihn nicht.

## Die Aktionen

| Aktion | Wirkung |
| --- | --- |
| **Play/Pause** | hält die Wiedergabe an oder setzt sie fort |
| **Nächster Titel** / **Vorheriger Titel** | springt einen Titel weiter oder zurück |
| **Von vorn beginnen** | startet das Album oder die Playlist beim ersten Titel neu |
| **Lauter** / **Leiser** | ändert die Lautstärke um den Schritt, der rechts daneben gewählt ist: 1, 2, 3, 5 oder 10 % |
| **30 Sekunden vor** / **30 Sekunden zurück** | spult im Titel |
| **Zufallswiedergabe an/aus** | schaltet das Mischen um |
| **Ausgabe wechseln** | schaltet zur nächsten Ausgabe: Soundkarten der Box und gekoppelte Bluetooth-Geräte der Reihe nach |
| **Stopp** | beendet die Wiedergabe |
| **Box ausschalten** | fährt die Box herunter |
| **Keine Aktion** | der Druck tut nichts |

Der **Lautstärke-Schritt** erscheint nur neben **Lauter** und **Leiser** und gilt für genau diese eine Aktion. So kann ein kurzer Druck fein (1 %) und ein langer grob (10 %) stellen. Das **Maximum** der Lautstärke ([Sound und Lautstärke](../hardware/sound.md)) gilt auch für die Taster.

## Wenn ein Taster nicht reagiert

- Ist ein **GPIO-Pin** gewählt und eine Aktion ungleich **Keine Aktion**? Ein Taster ohne Aktion wird nicht gelesen.
- Verbindet der Taster den gewählten Pin wirklich mit **GND**? Die App zeigt die Nummer auf der Stiftleiste in Klammern.
- Bei einem **Doppeltaster** müssen beide Pins gewählt und verschieden sein.
- Ist die Erweiterung unter **Einstellungen › System › Erweiterungen** eingeschaltet?
- Spielt gerade nichts, tun **Nächster Titel**, **Vorheriger Titel** und **Von vorn beginnen** nichts.
