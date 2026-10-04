# Sound und Lautstärke

## Soundkarte

**Einstellungen › Audio › Soundkarte**: Wähle das Gerät, über das die Box den Ton ausgibt. Die Auswahl wird nach einem Neustart übernommen.

Zur Wahl stehen unter anderem:

- der **Onboard-3,5-mm-Ausgang** und der **Onboard-HDMI-Ausgang** des Raspberry Pi,
- Verstärker-Boards mit **MAX98357A**,
- DACs und Verstärker von **HiFiBerry**, **Allo**, **IQaudIO**, **Pi-DAC**, **AudioPhonics** und weiteren,
- **Beliebiger USB-Audio-DAC** (wird automatisch erkannt).

> [!NOTE]
> Welche Einträge die Auswahl enthält, zeigt die [Einstellungs-Referenz](../referenz/audio/sound-card.md). Findest du deine Karte dort nicht, probiere den Eintrag, der zum Chip auf der Karte passt (viele Karten teilen sich Treiber). Bleibt der Ton aus, hilft [Kein Ton](../fehlerbehebung/kein-ton.md).

## Lautstärke

**Einstellungen › Audio › Lautstärke**:

| Einstellung | Wirkung |
| --- | --- |
| **Lautstärke jetzt** | die aktuelle Lautstärke, 0 bis 100 % |
| **Maximum (Hörschutz)** | die höchste Lautstärke, die sich überhaupt einstellen lässt, 10 bis 100 %. Gilt für Display, App und Drehregler |
| **Beim Start auf festen Wert setzen** | an: Die Box startet immer mit dem **Wert beim Start**. Aus: Sie behält die Lautstärke von vor dem Ausschalten |
| **Wert beim Start** | die Startlautstärke |
| **Weiterspielen beim Verlassen des Players** | ob die Wiedergabe weiterläuft, wenn das Kind den Player verlässt ([Fortsetzen und „Läuft gerade“](../bedienung/fortsetzen.md)) |

> [!TIP]
> Das **Maximum** ist der wichtigste Schutz für die Ohren. Stelle es so ein, dass der Lautsprecher in deinem Gerät auch bei voller Einstellung angenehm bleibt.

## Mit Bluetooth

Für Kopfhörer und Lautsprecher per Bluetooth gibt es ein eigenes Maximum, damit Kopfhörer nicht so laut werden dürfen wie ein Lautsprecher ([Bluetooth](bluetooth.md)).

## Sprachausgabe

Die Box kann Namen vorlesen und Ansagen sprechen. Stimme und Sprache stellst du unter **Einstellungen › Audio › Sprachausgabe** ein.

## Beim Ausschalten

Beim Ausschalten spielt die Box einen Abschiedston. Läuft zu diesem Zeitpunkt noch Musik, wird sie zuerst gestoppt, damit sie nicht kurz lauter wird, bevor der Ton kommt.
