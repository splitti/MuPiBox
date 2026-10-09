# Eigene Hörspiele und Musik

Dateien, die auf der Speicherkarte der Box liegen, spielen auch ohne Internet. Es gibt zwei Wege dorthin.

## Aus der App hochladen

**Bibliothek › Vom Gerät hochladen**:

1. Wähle die **Kategorie**: Hörspiele, Musik oder Radio & Podcasts.
2. Trage **Interpret** und **Album** ein. Daraus bildet die Box die Ordner.
3. Wähle mit **Titel wählen**, **Ordner wählen** oder **Cover wählen** die Dateien, oder ziehe Dateien und Ordner auf das Fenster.
4. Tippe auf **Hochladen**. Ein Balken zeigt den Fortschritt, darunter steht, wie viel Platz auf der Speicherkarte frei ist.

Die Titel werden auf die Speicherkarte kopiert und erscheinen danach von selbst auf dem Display.

## Über das Netzwerk kopieren

Schalte **Samba** ein (**Einstellungen › Dienste › Freigaben & Fernzugriff**), dann lässt sich die Speicherkarte im Heimnetz als Laufwerk öffnen. Du kopierst dann Ordner wie auf einen USB-Stick. Alternativ gibt es einen FTP-Server, den du bei Bedarf einschaltest ([Freigaben und Fernsteuerung](../netzwerk/freigaben.md)).

> [!NOTE]
> Auf diesem Weg legst du die Ordner selbst an. Hältst du dich an „Interpret/Album/Titel“, sortiert die Box sie sauber ein. Die Upload-Seite der App nimmt dir das Anlegen der Ordner ab.

## Von der Box herunterladen

Unter **Bibliothek › SD-Karte** holst du Inhalte wieder von der Box, etwa aufs Handy oder für eine Sicherung:

- In einem **Album** steht jeder Titel mit Größe und einem Download-Knopf. **Album als ZIP herunterladen** holt das ganze Album.
- In einem **Ordner** stehen Titelzahl und Größe jedes Albums. **Ordner als ZIP herunterladen** holt alles darin, mit Unterordnern und Covern.

Die Box packt das ZIP während des Herunterladens, ohne es zu komprimieren. So hat der Raspberry Pi kaum zu tun, und die Box spielt währenddessen weiter. Ab etwa 1 GB fragt die App vorher nach, weil das über WLAN eine Weile dauert und auf dem Gerät entsprechend Platz braucht. Inhalte von Spotify oder vom NAS lassen sich hier nicht herunterladen.

## Cover für eigene Dateien

Liegt im Albumordner ein Bild oder ist es in den Dateien eingebettet, nimmt die Box es als Cover. Sonst kann sie ein Online-Cover suchen oder zeigt das Ersatzbild des Themes ([Cover](cover.md)).

## Platz auf der Karte

Eigene Medien belegen die Speicherkarte. Wie viel frei ist, steht unter **Einstellungen › System › Über die Box**. Wenn der Platz knapp wird, lagere Medien auf ein [NAS](nas.md) aus oder nimm Spotify.
