# Bluetooth

Die Box kann über Bluetooth auf Kopfhörern oder Lautsprechern spielen. Alles dazu steht unter **Einstellungen › Audio › Bluetooth**.

## Einschalten

Der Schalter **Bluetooth** schaltet Bluetooth für Kopfhörer und Lautsprecher ein oder aus. Er wirkt sofort.

Den **Bluetooth-Chip** selbst schaltest du in der Karte **Hardware** (zugeklappt unter **Bluetooth-Chip und Controller**). Ist der Chip aus, ist die Bluetooth-Hardware des Raspberry Pi ganz abgeschaltet: Das kann das Onboard-WLAN stabiler machen (es teilt sich den Funk mit Bluetooth) und spart etwas Strom. Der Chip-Schalter gilt erst nach einem **Neustart**. Dort steht auch die Adresse des Bluetooth-Controllers der Box.

## Ein Gerät koppeln

1. Versetze das Gerät (Kopfhörer, Lautsprecher) in den **Kopplungsmodus**. Meist hältst du dafür eine Taste lange gedrückt.
2. Tippe in der App unter **Neues Gerät koppeln** auf **Suchen**. Die Suche dauert etwa 20 bis 25 Sekunden.
3. Tippe beim Gerät auf **Koppeln**. Es erscheint danach unter **Gekoppelte Geräte**. Dort kannst du es auch **verbinden**, **trennen** oder **entfernen**.

Geräte, die keinen Namen senden, stehen zugeklappt unter „weitere Geräte ohne Namen“.

## Automatisch verbinden

**Automatisch verbinden** verbindet ein bekanntes Gerät von selbst, sobald es an ist. Das hilft, wenn sich Geräte nach dem Einschalten der Box nicht von selbst verbinden.

## Auf welches Gerät spielt die Box?

Ist ein Gerät gekoppelt, wählst du die Ausgabe: die Box selbst (**Lautsprecher**) oder das Bluetooth-Gerät.

- **In der App** auf der Startseite über dem Lautstärkeregler (**Ausgabe**).
- **Am Display** mit einem Tipp auf die Lautstärke oben im Player. Das geht nur, wenn unter **Einstellungen › Display & Bedienung › Bedienung am Display** der Schalter **Box oder Kopfhörer am Display wählen** an ist ([Der Player](../bedienung/player.md)).

Ist das Gerät nicht erreichbar, meldet die Box das, statt einfach still zu bleiben.

## Akkustand der Kopfhörer

Meldet ein verbundener Kopfhörer seinen Akkustand, zeigt die Box ihn an: am Display in **Hören mit** auf seiner Kachel (rot bei 20 % und darunter), in der App neben seinem Namen bei der Ausgabe und unter **Gekoppelte Geräte**. Viele Kopfhörer melden ihn in 10er-Schritten, manche gar nicht (AirPods zum Beispiel). Dann steht dort einfach nichts.

## Lautstärke mit Bluetooth

Für Kopfhörer gibt es ein **eigenes Maximum**. Es gilt für Bluetooth-Geräte und für die Kopfhörerbuchse. So dürfen Kopfhörer leiser bleiben als ein Lautsprecher. Du stellst es in der App unter **Einstellungen › Audio › Lautstärke** mit **Eigene Grenze für Kopfhörer** ein ([Sound und Lautstärke](sound.md)).
