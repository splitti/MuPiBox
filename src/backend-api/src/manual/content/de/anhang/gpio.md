# GPIO-Belegung

Die **GPIO-Pins** sind die Anschlüsse auf der Stiftleiste des Raspberry Pi. Zubehör der MuPiBox nutzt sie nach den **BCM-Nummern** (GPIO 26 ist nicht Pin 26 der Leiste, sondern der Anschluss mit der Bezeichnung „GPIO26“).

:::gpio-map

> [!NOTE]
> Die Belegung des **MuPiHAT** stammt aus dem offiziellen Pinout des Boards. Die acht Pins der Erweiterungsleiste **J5** (GPIO 5, 6, 8, 9, 10, 11, 12, 25) sind frei nutzbar; sie sind gestrichelt markiert und lösen keine Überschneidung aus. Das MuPiHAT hat den OnOff-SHIM schon an Bord und belegt deshalb dieselben beiden Pins wie dieser (4 und 17). Beide zusammen gehen nicht.

## Pins, die die Box nutzt

| Zubehör | Funktion | GPIO (BCM) | Einstellbar |
| --- | --- | --- | --- |
| {rotary-a} Drehregler | A (CLK) | 26 | nein |
| {rotary-b} Drehregler | B (DT) | 24 | nein |
| {rotary-button} Drehregler | Taster | 10 | nein |
| {poweroff} OnOff SHIM (auch das MuPiHAT) | Signal zum Ausschalten (`gpio-poweroff`) | 4 | in der Konfiguration (`shim.poweroffPin`) |
| {trigger} OnOff SHIM (auch das MuPiHAT) | Taster (Trigger) | 17 | in der Konfiguration (`shim.triggerPin`) |
| {cut} Stromabschaltung (setzt die Box, nicht der SHIM) | Signal bei Ausschalten | 27 | in der Konfiguration (`shim.cutPin`) |
| {led} Betriebs-LED (eigene LED, nicht Teil des SHIM) | Status-LED | 13 | ja, **Einstellungen › Akku & Strom › Ein-/Ausschalter und LED** |
| {fan} Lüfter | PWM-Signal | 12 | ja, **Einstellungen › Akku & Strom › Lüfter** |

Auf deiner Box zeigt diese Tabelle **nur die Pins, die dort mit den aktuellen Einstellungen verwendet werden**: Ein ausgeschalteter Lüfter oder Drehregler erscheint nicht, und ein geänderter Pin zeigt seine neue Nummer. Wo die Seite die Box nicht fragen kann (zum Beispiel auf GitHub), stehen die Pins so, wie sie nach der Installation eingetragen sind.

> [!WARNING]
> Zwei Geräte dürfen sich **keinen** Pin teilen. Wähle für LED und Lüfter Pins, die oben nicht anderweitig stehen. Die App warnt, wenn du für ein Zubehör einen Pin wählst, den ein aktiviertes anderes Zubehör schon nutzt.

## Wo steht die Pin-Einstellung noch?

Der Pin für das Ausschalten steht an **zwei** Stellen, und beide müssen übereinstimmen:

1. in der Konfiguration der Box: `shim.poweroffPin`,
2. in `/boot/config.txt`: als Parameter `gpiopin=…` des Overlays `gpio-poweroff`.

Mehr dazu und was bei einer doppelten Zeile passiert: [Die Box hängt beim Ausschalten](../fehlerbehebung/haengt-beim-ausschalten.md).
