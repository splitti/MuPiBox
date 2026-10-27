# Display

**Einstellungen › Display & Bedienung › Display**

## Display-Modell

Ein Display am Flachbandkabel (DSI) meldet nicht, was es ist. Deshalb wählst du hier aus, welches angeschlossen ist. Bei einer Box, die schon ein Bild zeigt, ist das passende Modell vorbelegt.

| Modell | Hinweis |
| --- | --- |
| **Offizielles 7″ (1. Generation)** | 800 × 480, auch für ein Display am HDMI-Anschluss oder ganz ohne Display – so laufen die bisherigen Boxen |
| **Touch Display 2** | von Raspberry Pi, Größe 5″, 7″ oder 10″ wählen – auf einer MuPiBox getestet (7″) |
| **Waveshare 5″ DSI** / **Waveshare 4,3″ DSI** | je 800 × 480 |
| **Waveshare DSI 7″ bis 12,3″** | das genaue Modell wählen, es steht auf der Rückseite oder der Packung. „DSI LCD“ und „DSI-TOUCH“ sind verschiedene Bauarten, auch bei gleicher Größe |
| **EDATEC DSI 7″ oder 10″** | Größe wählen |
| **Eigene Einstellung** | Die App fasst die `config.txt` nicht an – für Displays, die du selbst eingerichtet hast |

Mit **Übernehmen und neu starten** startet die Box mit dem neuen Modell neu. Danach fragen die App (auch auf der Startseite) und das Display: **Siehst du ein Bild?** Tippst du am Display auf **Behalten** oder in der App auf **Ja, behalten**, bleibt das Modell. Kommt innerhalb von **3 Minuten** keine Antwort – etwa weil das Display dunkel bleibt –, stellt die Box das bisherige Display wieder ein und startet noch einmal neu. Mit **Nein, zurück** geht das sofort.

> [!NOTE]
> Bleibt das Display auch mit dem richtigen Modell dunkel, prüf die Stromversorgung: Die meisten DSI-Displays bekommen ihre 5 V nicht über das Flachbandkabel, sondern über ein eigenes Kabel (am MuPiHAT an **J2**, oben 5V, darunter GND). Bis auf das offizielle 7″ nutzen alle Modelle die Treiber aus dem Raspberry-Pi-Kernel.

## Helligkeit und Display-Aus

| Einstellung | Bereich |
| --- | --- |
| **Helligkeit** | 5 bis 100 % |
| **Display aus nach** | 0 bis 120 Minuten in Stufen, **0 = nie** (nach der Installation 10 Minuten) |

Beides gilt sofort. Lässt sich dein Display nicht dimmen, ist der Regler **Helligkeit** gesperrt.

Das Display schaltet sich nach der eingestellten Zeit ohne Bedienung aus, die Box selbst läuft weiter. Ein Tipp auf den Bildschirm weckt es wieder.

## Abends dunkler

Mit **Abends dunkler** wird das Display abends dunkler und morgens wieder normal hell:

- **Ab** und **Bis**: die Uhrzeiten,
- **Helligkeit am Abend**: 5 bis 100 %, nie heller als die normale Helligkeit,
- **Sanft abdunkeln über**: sofort oder über 15, 30 oder 60 Minuten,
- **Auch während der Ruhezeiten**: dunkler auch in einer Ruhezeit, die außerhalb der Uhrzeiten liegt.

## Drehung

Steht das Display auf dem Kopf oder quer, drehst du das Bild. Was du dafür siehst, hängt vom Display-Modell ab:

- **Offizielles 7″ (1. Generation):** Für ein **Display am HDMI-Anschluss** wählst du aus, 90°, 180°, 270°, horizontal oder vertikal spiegeln. Für ein **Display am Flachbandkabel (DSI/LCD)** gibt es (zugeklappt) **LCD-Drehung** und **Display-LCD-Drehung**, jeweils aus oder 180°. Die Drehung gilt nach einem Neustart der Box.
- **Alle anderen Modelle:** Kacheln **0°**, **90°**, **180°** und **270°** sowie **Spiegeln ↔** (links-rechts) und **Spiegeln ↕** (oben-unten) – gedreht oder gespiegelt, nicht beides. Bild und Touch drehen bzw. spiegeln sich zusammen, beim Drehen auch das Start-, Wartungs- und Ausschaltbild (gespiegelt bleiben diese Bilder, wie sie sind). Die Anzeige startet kurz neu, die Box nicht. **Quer** markiert die Lagen, in denen die MuPiBox richtig steht – viele dieser Displays sind hochkant gebaut (etwa das Touch Display 2), dann ist es 90° oder 270°, je nachdem, wie das Display eingebaut ist.

## Auflösung

Bei allen Modellen außer dem offiziellen 7″ nimmt die Box die Auflösung vom Display selbst (nach der Drehung) – der Abschnitt **Auflösung** erscheint dann nicht.

Der Standard ist **800 × 480** Pixel (die Größe der üblichen 7-Zoll-Touch-Displays). Unter **Größe** wählst du eine der üblichen Größen oder **Eigene …** und trägst dann **Breite** und **Höhe** ein. Mit **Auflösung übernehmen** startet das Display gleich neu.

Ist die Auflösung größer als 800 × 480, vergrößert die Box die Oberfläche passend: Aufbau und Themes bleiben gleich, Schrift, Symbole und Cover werden in voller Schärfe gezeichnet. Beim Raspberry Pi Touch Display 2 (1280 × 720) ist das das 1,5-Fache. Stell hier deshalb die echte Auflösung deines Displays ein. Hintergrundbilder für das Theme „custom“ passen am besten in genau dieser Größe ([Cover und Themes](../bedienung/cover-und-themes.md)).

## Display live

Unter **Einstellungen › Display & Bedienung › Display live** siehst du das aktuelle Bild des Displays (es aktualisiert sich alle 5 Sekunden, solange die Seite offen ist) und kannst das Display im Browser **fernsteuern**. Die Fernsteuerung braucht VNC ([Freigaben und Fernsteuerung](../netzwerk/freigaben.md)).

## Browser-Einstellungen

Das Display ist ein Browser im Vollbildmodus (Chromium). Dessen Einstellungen, etwa GPU-Unterstützung und Cache, findest du unter **Einstellungen › System › Browser (Chromium)** ([System- und Experteneinstellungen](../wartung/system.md)).
