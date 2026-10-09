# Sound und Lautstärke

## Soundkarte

**Einstellungen › Audio › Soundkarte**: Wähle das Gerät, über das die Box den Ton ausgibt. Die Auswahl wird nach einem Neustart übernommen. Die Seite zeigt auch, welche Soundkarte das System gerade erkennt. Mit dem MuPiHAT gehört die Soundkarte zum HAT (MAX98357A).

Zur Wahl stehen unter anderem:

- der **Onboard-3,5-mm-Ausgang** und der **Onboard-HDMI-Ausgang** des Raspberry Pi,
- Verstärker-Boards mit **MAX98357A**,
- DACs und Verstärker von **HiFiBerry**, **Allo**, **IQaudIO**, **Pi-DAC**, **AudioPhonics** und weiteren,
- **Beliebiger USB-Audio-DAC** (wird automatisch erkannt).

> [!NOTE]
> Welche Karten es gibt, zeigt die Auswahl in der App. Findest du deine Karte dort nicht, probiere den Eintrag, der zum Chip auf der Karte passt (viele Karten teilen sich Treiber). Bleibt der Ton aus, hilft [Kein Ton](../fehlerbehebung/kein-ton.md).

### Kopfhörerbuchse zusätzlich

Hat die Box eine eigene Soundkarte (zum Beispiel den MuPiHAT oder einen HiFiBerry), schaltet DietPi den 3,5-mm-Ausgang des Raspberry Pi ab. Mit **Einstellungen › Audio › Soundkarte › Kopfhörerbuchse › 3,5-mm-Ausgang zusätzlich** bleibt er neben der Soundkarte an, für Kopfhörer an der Buchse. Das gilt nach einem Neustart, den die App gleich anbietet.

Danach gibt es mehrere Ausgänge: Im Player wechselt ein Tipp auf das Symbol neben der Lautstärke bei zwei Ausgängen gleich zum anderen, bei mehr öffnet er **Hören mit** mit einer Kachel je Ausgang ([Der Player](../bedienung/player.md)). In der App wählst du bei **Jetzt läuft** unter **Ausgabe**. Die Box merkt sich den gewählten Ausgang auch über einen Neustart. Ohne Wahl spielt sie über die Soundkarte, die oben gewählt ist.

- Wechselst du auf die Buchse, wird sie nicht lauter, als die Box gerade war. Das **Maximum für Kopfhörer** gilt auch für die Buchse, ebenso das **Maximum (Hörschutz)**.
- Die Box sorgt dafür, dass ihre Soundkarte die erste Karte im System bleibt. Wechselst du die Soundkarte oder schaltest du den MuPiHAT ein oder aus, schaltet sie die Buchse danach wieder ein.
- Ausschalten stellt alles zurück, wie DietPi es für die Soundkarte eingerichtet hat (ebenfalls nach einem Neustart).
- Ist der Onboard-Ausgang selbst die Soundkarte, gibt es den Schalter nicht: Die Buchse ist dann ohnehin an.
- Raspberry Pi 5 und Zero haben keine 3,5-mm-Buchse, dort fehlt der Schalter. Auf einem Raspberry Pi 1 bis 3 teilen sich Buchse und Status-LED (GPIO 12/13) die PWM-Einheit: Mit eingeschalteter Buchse läuft die LED per Software weiter. Ab dem Pi 4 bleibt sie auf der Hardware-PWM.

### HDMI-Ton zusätzlich

Für einen Monitor oder Fernseher am HDMI-Anschluss schaltest du **Einstellungen › Audio › Soundkarte › HDMI-Ton › HDMI-Ausgang zusätzlich** ein. Der HDMI-Ausgang ist dann ein eigener Ausgang neben der Soundkarte der Box und wird wie die Buchse im Player oder in der App gewählt. Auch das gilt nach einem Neustart.

- Die Buchse bleibt dabei aus, solange ihr eigener Schalter aus ist. Beide lassen sich zusammen einschalten.
- Die Box stellt den HDMI-Ausgang auf HDMI statt DVI (`hdmi_drive=2`), damit auch ein Monitor ohne eigene Einstellung den Ton bekommt – nur, wenn in der Boot-Konfiguration noch nichts dazu steht.
- Ausschalten nimmt alles wieder heraus, was dafür eingetragen wurde.
- Ist der Onboard-Ausgang selbst die Soundkarte, gibt es den Schalter nicht.

## Lautstärke

**Einstellungen › Audio › Lautstärke**:

| Einstellung | Wirkung |
| --- | --- |
| **Lautstärke jetzt** | die aktuelle Lautstärke, 0 bis 100 % |
| **Maximum (Hörschutz)** | die höchste Lautstärke, die sich überhaupt einstellen lässt, 10 bis 100 %. Gilt für Display, App, Drehregler und Telegram |
| **Eigene Grenze für Kopfhörer** und **Maximum für Kopfhörer** | ein eigenes Maximum, solange über Bluetooth (Kopfhörer oder Lautsprecher) oder die Kopfhörerbuchse gespielt wird (siehe unten) |
| **Beim Start auf festen Wert setzen** | an: Die Box startet immer mit dem **Wert beim Start**. Aus: Sie behält die Lautstärke von vor dem Ausschalten |
| **Wert beim Start** | die Startlautstärke, nie höher als das Maximum |

> [!TIP]
> Das **Maximum** ist der wichtigste Schutz für die Ohren. Stelle es so ein, dass der Lautsprecher in deinem Gerät auch bei voller Einstellung angenehm bleibt.

## Mit Bluetooth

Für Kopfhörer und Lautsprecher per Bluetooth und für die Kopfhörerbuchse gibt es ein eigenes Maximum, damit Kopfhörer nicht so laut werden dürfen wie der Lautsprecher der Box. Schalte dafür **Eigene Grenze für Kopfhörer** ein und stelle **Maximum für Kopfhörer** ein. Ist die Box beim Verbinden lauter, geht sie gleich auf diesen Wert herunter ([Bluetooth](bluetooth.md)).

## Lautstärke angleichen

**Lautstärke angleichen** bringt Hörspiele, Musik, Podcasts und Radio auf eine gemeinsame Lautheit. Ein leises Hörspiel ist dann nicht leiser als das Album davor. Ist der Schalter an, wählst du die **Stärke**: **Sanft** oder **Kräftig**. Spotify bleibt, wie es ist. Nach der Installation ist der Schalter aus. Auf einem Pi 3 kann es beim Start eines Titels kurz ruckeln.

## Zurück im Player

**Zurück im Player** legt fest, was der Zurück-Knopf oben links im Player auf dem Display macht:

- **Minimieren**: Die Musik läuft weiter, oben zeigt „Läuft gerade“, was spielt ([Fortsetzen und „Läuft gerade“](../bedienung/fortsetzen.md)).
- **Beenden**: Die Musik stoppt, das Display geht eine Ebene zurück.

## Sprachausgabe

Die Box kann Namen vorlesen und Ansagen sprechen. Stimme und Sprache stellst du unter **Einstellungen › Audio › Sprachausgabe** ein.

## Beim Ausschalten

Beim Ausschalten spielt die Box einen Abschiedston. Läuft zu diesem Zeitpunkt noch Musik, wird sie zuerst gestoppt, damit sie nicht kurz lauter wird, bevor der Ton kommt.
