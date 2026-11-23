# Einschalten und Einstellungen

Die Fotoanzeige schaltest du unter **Einstellungen › Fotos** mit **Fotoanzeige** ein. Danach erscheinen **Fotos** in der Bibliothek der App und die **Bildzeit** unter Spielzeit. Am Display kommt der Reiter **Fotos** dazu, sobald ein Album sichtbar ist.

Beim Einschalten richtet die Box ein Programm ein, das iPhone-Fotos (HEIC) umwandelt. Dafür braucht sie einmal Internet. Klappt das nicht, zeigt die Seite einen Hinweis mit **Erneut versuchen**. Fotos ohne HEIC gehen trotzdem.

Schaltest du die Fotoanzeige wieder aus, verschwinden Fotos aus App und Display. Die Alben und Fotos bleiben auf der Box und sind nach dem Einschalten wieder da.

## Alben und Diashow

| Einstellung | Wirkung |
| --- | --- |
| **Album startet als Diashow** | Für die Kleinsten: Ein Album öffnet sich ohne Bildübersicht direkt als Diashow. |
| **Tempo der Diashow** | wie lange ein Bild stehen bleibt (langsam, mittel, schnell); am Display lässt es sich auch beim Anschauen umstellen |
| **Reihenfolge** | **Gemischt**, **Neueste zuerst** oder **Nach Aufnahmedatum** |

## Videos

Mit **Videos anzeigen** erscheinen auch kurze Clips in den Alben. Die Box richtet dafür ein Programm zur Videoumwandlung ein (ffmpeg, braucht einmal Internet).

- Ein Clip darf höchstens **3 Minuten** lang sein. Längere nimmt die Box nicht an.
- Die Box bringt jeden Clip im Hintergrund auf eine Größe, die das Display gut abspielt. Bis dahin steht im Album **Wird vorbereitet**. Ein langer Clip in 4K kann auf dem Raspberry Pi einige Minuten brauchen.
- Im Album läuft ein Clip mit Ton. Spielt gerade ein Hörspiel oder Musik, bleibt er stumm. In der Diashow laufen Clips immer stumm, und nur solche bis 30 Sekunden; bei längeren zeigt die Diashow ihr Standbild.
- Live-Fotos vom iPhone zeigen nur ihr Standbild.

## Bildschirmschoner

Siehe [Bildschirmschoner](bildschirmschoner.md).
