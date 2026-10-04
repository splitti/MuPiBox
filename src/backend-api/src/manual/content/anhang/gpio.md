# GPIO-Belegung

Die **GPIO-Pins** sind die Anschlüsse auf der Stiftleiste des Raspberry Pi. Zubehör der MuPiBox nutzt sie nach den **BCM-Nummern** (GPIO 26 ist nicht Pin 26 der Leiste, sondern der Anschluss mit der Bezeichnung „GPIO26“).

## Pins, die die Box nutzt

| Zubehör | Funktion | GPIO (BCM) | Einstellbar |
| --- | --- | --- | --- |
| Drehregler | A (CLK) | 26 | nein |
| Drehregler | B (DT) | 24 | nein |
| Drehregler | Taster | 10 | nein |
| OnOff SHIM | Signal zum Ausschalten (`gpio-poweroff`) | 4 | in der Konfiguration (`shim.poweroffPin`) |
| OnOff SHIM | Taster (Trigger) | 17 | in der Konfiguration (`shim.triggerPin`) |
| OnOff SHIM | Stromabschaltung | 27 | in der Konfiguration (`shim.cutPin`) |
| OnOff SHIM | Betriebs-LED | 13 | ja, **Einstellungen › Akku & Strom › Ein-/Ausschalter und LED** |
| Lüfter | PWM-Signal | 12 | ja, **Einstellungen › Akku & Strom › Lüfter** |

Die Pin-Nummern in der Tabelle sind die Werte, die nach der Installation eingetragen sind.

> [!WARNING]
> Zwei Geräte dürfen sich **keinen** Pin teilen. Wähle für LED und Lüfter Pins, die oben nicht anderweitig stehen. Die App warnt, wenn du für ein Zubehör einen Pin wählst, den ein aktiviertes anderes Zubehör schon nutzt.

## Wo steht die Pin-Einstellung noch?

Der Pin für das Ausschalten steht an **zwei** Stellen, und beide müssen übereinstimmen:

1. in der Konfiguration der Box: `shim.poweroffPin`,
2. in `/boot/config.txt`: als Parameter `gpiopin=…` des Overlays `gpio-poweroff`.

Mehr dazu und was bei einer doppelten Zeile passiert: [Die Box hängt beim Ausschalten](../fehlerbehebung/haengt-beim-ausschalten.md).
