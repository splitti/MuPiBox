# Kacheln mit Tageslimit

Einzelne Kacheln der Startseite bekommen eine eigene Grenze am Tag, zum Beispiel eine Hörspielserie höchstens 30 Minuten. Alles andere läuft im Rahmen der normalen [Tageslimits](tageslimits.md) weiter. Die Minuten einer Kachel zählen auch zur Hörzeit.

Begrenzen lässt sich jede Kachel der Startseite: ein Interpret (auch von Spotify oder TIDAL), ein Podcast, ein Ordner der SD-Karte oder des NAS, eine einzelne Playlist oder ein Radiosender.

## Einstellen

1. Öffne in der App **Bibliothek** und tippe auf die Kachel, zum Beispiel den Interpreten oder den Ordner.
2. Wähle bei **Höchstens am Tag** die Minuten: 15, 30, 45, 60, 90 oder 120. **Kein Limit** nimmt die Grenze wieder weg.

Die Wahl gilt sofort und für alle Tage. Darunter steht, wie viele Minuten heute schon gehört wurden.

> [!NOTE]
> Bei einem NAS-Ordner, dessen Unterordner am Display einzeln stehen, gilt die Grenze für alle Unterordner zusammen.

## Was passiert am Ende?

- Läuft die Zeit einer Kachel ab, endet die Wiedergabe wie beim Tageslimit: sofort, nach dem Titel oder nach dem Album, je nach **Wenn das Limit erreicht ist** ([Tageslimits](tageslimits.md)). Radio stoppt immer sofort.
- Am Display bleibt die Kachel stehen, etwas blasser und mit einem **Schloss**. Ein Tipp darauf öffnet nichts. Oben erscheint kurz „… ist für heute vorbei“.
- Kurz vor Schluss erscheint oben „Noch 5 Minuten …“.
- Andere Kacheln spielen weiter, solange die Hörzeit reicht. Am nächsten Tag (zur Stunde unter **Tageswechsel um** bei den Tageslimits) ist die Kachel wieder frei.

## Die Pille am Display

Oben rechts zeigt die Pille die verbleibende Zeit:

- Auf der **Startseite** steht immer die Hörzeit.
- Ist eine Kachel mit eigenem Limit **geöffnet**, also ihre Alben oder ihr Player, zeigt die Pille ihr kleines rundes Bild und ihre Minuten. Endet die Hörzeit früher, bleibt die Hörzeit stehen.

## Ausnahmen für heute

Unter **Spielzeit › Kacheln mit Limit** stehen alle Kacheln mit Grenze, mit den Minuten von heute:

| Knopf | Wirkung |
| --- | --- |
| **+10 min** | heute 10 Minuten mehr für diese Kachel |
| **Heute frei** | heute keine Grenze für diese Kachel |

Beides gilt nur heute. Auf der Startseite der App steht ein Hinweis, sobald eine Kachel für heute aufgebraucht ist. Über [Telegram](../netzwerk/telegram.md) geht dasselbe mit `/tiles`.

**Sperren aufheben** bei den [Sofort-Aktionen](schlaftimer.md) gibt auch aufgebrauchte Kacheln für diese Zeit frei.

> [!NOTE]
> Gezählt wird, was über das Display, die App oder Home Assistant gestartet wurde. Etwas, das von außen per Spotify Connect auf die Box geschickt wird, zählt nur zur Hörzeit.
