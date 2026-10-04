# Die Box hängt beim Ausschalten

Die Box zeigt beim Ausschalten das Abschiedsbild, fährt aber nicht richtig herunter, und sie lässt sich mit dem Ein-/Aus-Taster nicht mehr starten. Nur das Trennen vom Strom hilft?

## Häufige Ursache: der Pin wird doppelt belegt

Boxen mit einem **OnOff SHIM** oder ähnlichem Taster nutzen das Overlay `gpio-poweroff`, damit der Raspberry Pi beim Herunterfahren ein Signal an die Platine schickt. Steht dieses Overlay in der Datei `/boot/config.txt` **zweimal**, hängt die Box beim Herunterfahren.

Das passiert, wenn du für dein Display einen eigenen Treiber eintragen musstest und die Zeile das Overlay schon enthält, zum Beispiel:

```
dtoverlay=vc4-fkms-v3d,gpio-poweroff,gpiopin=4,active_low=1
```

Frühere Versionen des Updates erkannten diese Zeile nicht und hängten eine **zweite** Definition an:

```
dtoverlay=gpio-poweroff,gpiopin=4,active_low=1
```

> [!NOTE]
> Neuere Versionen der MuPiBox erkennen `gpio-poweroff` in jeder `dtoverlay`-Zeile und fügen es nur hinzu, wenn es noch fehlt. Die doppelte Zeile, die ein früheres Update schon eingetragen hat, entfernt auch das neue Update **nicht** selbst.

## So prüfst und behebst du es

Melde dich per SSH auf der Box an (oder öffne ein Terminal im DietPi-Dashboard) und suche das Overlay:

```
grep -n gpio-poweroff /boot/config.txt
```

- **Eine** Zeile (egal ob eigenständig oder als Parameter eines anderen Overlays): in Ordnung, die Ursache liegt woanders.
- **Zwei oder mehr** Zeilen mit `gpio-poweroff`: Behalte die Zeile, die zu deinem Display gehört, und entferne die zusätzliche, eigenständige Zeile `dtoverlay=gpio-poweroff,gpiopin=4,active_low=1`. Bearbeiten kannst du die Datei mit `sudo nano /boot/config.txt`.

Starte die Box danach neu. Der Pin steht auch in der Konfiguration der Box (`shim.poweroffPin`) und muss zu dem passen, was in der Zeile steht ([GPIO-Belegung](../anhang/gpio.md)).

> [!WARNING]
> Mache vor dem Ändern von `/boot/config.txt` eine Kopie (`sudo cp /boot/config.txt /boot/config.txt.bak`). Eine falsche Zeile kann verhindern, dass die Box startet.

## Wenn es das nicht ist

- Läuft beim Ausschalten noch Musik, wird sie angehalten, bevor der Abschiedston kommt. Bleibt die Box trotzdem hängen, schau in die Protokolle ([Protokolle und Zustand](../wartung/protokolle.md)): Das Log `shutdown_control.log` gehört zum Ausschalten per Taster.
- Prüfe das Netzteil: Spannungseinbrüche beim Herunterfahren können sie hängen lassen.
- Erstelle einen [Problembericht](../wartung/problem-melden.md).
