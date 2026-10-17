# Sofort-Aktionen und Schlaftimer

Beides steht oben auf der Seite **Spielzeit** und wirkt sofort.

## Sofort-Aktionen

Trage zuerst die **Minuten** ein (1 bis 1440). Dann:

| Aktion | Wirkung |
| --- | --- |
| **+ Bonus-Zeit** | gibt für heute diese Minuten zum Tageslimit dazu |
| **Sperren aufheben** | hebt Limit und Ruhezeit für diese Minuten auf, die Box spielt frei |
| **Ruhe sofort** | stoppt die Wiedergabe für diese Minuten |

Die Aktionen ändern weder die Tageslimits noch die Ruhezeiten selbst. Nach Ablauf der Minuten gilt wieder, was eingestellt ist.

## Schlaftimer

Der **Schlaftimer** schaltet die Box nach Ablauf einer Zeit **komplett aus**, egal ob gerade etwas läuft. Er ist für das Einschlafen gedacht: Hörspiel starten, Timer auf 60 Minuten, fertig.

1. Wähle die **Minuten** (15 bis 360, in Schritten von 15).
2. Tippe auf **Starten**. **Stoppen** bricht ihn ab.

In den letzten 20 Sekunden vor dem Ende blendet die Box die Lautstärke langsam aus, die Wiedergabe endet dann leise statt abrupt. Danach stellt sie die Lautstärke für den nächsten Start wieder her und fährt ganz normal herunter, mit Abschiedsbild und Ton.

### Ein Timer für alle Wege

Die Box hat immer **genau einen** Schlaftimer. Die App, Telegram (`/sleep` und die Knöpfe), das alte Admin-Interface und [Home Assistant](../netzwerk/home-assistant.md) stellen alle denselben Timer und sehen dieselbe Restzeit:

- **Ein neuer Timer ersetzt den laufenden.** Stellst du 30 Minuten und danach 60, gilt nur noch die 60. Der alte Timer kann die Box nicht mehr ausschalten.
- **Stoppen** bricht ihn ab, egal wo er gestellt wurde. Auch zweimal hintereinander ist kein Fehler. Kurz vor dem Ende, während der Ausblendung, kommt die Lautstärke wieder auf den Wert davor.
- **Ist die Zeit abgelaufen**, beginnt das Ausschalten. Ab dann lässt sich der Timer nicht mehr stoppen, die App meldet das.
- Der Timer läuft **unabhängig** von der App, von Telegram und von Home Assistant. Ein Neustart der App oder eine getrennte Verbindung zu Home Assistant ändert nichts an ihm. Nach dem Einschalten der Box ist kein alter Timer mehr da.

### Unterschied zu den anderen Zeiten

| Was | Wirkung |
| --- | --- |
| **Schlaftimer** | schaltet die **ganze Box aus**, wenn die Zeit um ist |
| **Ruhe sofort**, Ruhezeiten, Tageslimit | stoppen nur die **Wiedergabe**, die Box bleibt an |
| **Box aus nach … ohne Wiedergabe** | schaltet aus, wenn **länger nichts** gehört wurde |

### Wenn es nicht klappt

Für Fortgeschrittene, per SSH auf der Box:

- `sudo /usr/local/bin/mupibox/sleep_timer.sh status` zeigt, ob ein Timer läuft und bis wann.
- `journalctl -u mupi-sleep-timer` zeigt, was der Timer getan hat (gestartet, ersetzt, gestoppt, abgelaufen).
- `sudo /usr/local/bin/mupibox/sleep_timer.sh stop` stoppt ihn von Hand.

> [!NOTE]
> Auch nach dem Ausschalten durch den Timer muss die Box am Gerät wieder eingeschaltet werden ([Neu starten und Ausschalten](../wartung/neustart.md)).

## Automatisch ausschalten und Display

Unabhängig vom Schlaftimer schaltet sich die Box aus, wenn lange nichts gehört wird. Das und **Display aus nach** stellst du gleich hier auf der Seite **Spielzeit** in der Karte **Ausschalten** ein, damit alle Zeiten an einem Ort sind. Dieselben Einstellungen stehen auch unter **Einstellungen › Akku & Strom › Automatisch ausschalten** und **Display & Bedienung › Display**.

- **Box aus nach … ohne Wiedergabe**: bis 300 Minuten, 0 = nie (so ist es nach der Installation eingestellt) ([Akku, MuPiHAT und Ausschalter](../hardware/strom.md)).
- **Display aus nach**: so lange ohne Bedienung am Display, dann wird es dunkel. 0 = nie.
