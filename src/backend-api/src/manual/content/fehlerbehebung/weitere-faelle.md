# Weitere Fälle

## Das WLAN-Symbol fehlt, obwohl die Box verbunden ist

Die Statusanzeige am Display liest den Online-Zustand der Box aus einer Datei, die ein kleiner Dienst (`mupi_check_internet`) pflegt. In älteren Versionen konnte dieser Zustand auf „offline“ hängen bleiben, obwohl die Box im Netz war. Neuere Versionen gleichen ihn mit dem echten Zustand ab.

- Starte die Box neu ([Neu starten und Ausschalten](../wartung/neustart.md)).
- Prüfe, ob die Box wirklich online ist, zum Beispiel ob Spotify oder ein Podcast lädt.
- Bleibt es dabei, installiere ein [Update](../wartung/updates.md).

## Das Display ist dunkel

- Das Display schaltet sich nach der eingestellten Zeit von selbst aus. Ein Tipp weckt es ([Display](../hardware/display.md)).
- Bleibt es dunkel, prüfe **Display aus nach** und die Helligkeit.
- Das Display zeigt eine **alte Seite** nach einem Update? Starte nur die Anzeige neu: **Einstellungen › System › Neu starten & Ausschalten › Display & Dienste**.

## Cover fehlen

- Siehst du eine **farbige Karte mit dem Ordnernamen**, hat die Box kein Bild gefunden. Das ist gewollt. Lade ein Cover hoch oder aktiviere die Online-Suche ([Cover](../inhalte/cover.md)).
- Ein **falsches** Cover verwirfst du unter **Bibliothek › Cover › Zuletzt gefunden**.

## Ein neues Album erscheint nicht

Eigene Dateien erscheinen von selbst, wenn sie vollständig kopiert sind. Bei einem **NAS** hilft **Index aktualisieren** ([NAS](../inhalte/nas.md)). Liegen die Dateien im falschen Ordner, passt die Kategorie nicht.

## Die Box ist langsam oder die Anzeige ruckelt

- **Unterspannung**: ein zu schwaches Netzteil oder Kabel ist die häufigste Ursache ([System- und Experteneinstellungen](../wartung/system.md)).
- **Temperatur**: zeigt **Zustand der Box** hohe Werte, hilft ein [Lüfter](../hardware/luefter.md) oder ein besseres Gehäuse.
- **Speicherkarte voll**: Der freie Platz steht unter **Über die Box**. Räume auf oder lagere Medien aufs [NAS](../inhalte/nas.md) aus.

## Ein Update ist fehlgeschlagen

Die Box stellt bei einem fehlgeschlagenen Update den vorherigen Stand wieder her. Läuft sie danach nicht normal, spiele das [Backup](../wartung/backup.md) ein, das du vorher gemacht hast, und melde das Problem ([Ein Problem melden](../wartung/problem-melden.md)).

## Die Box meldet sich nicht bei Telegram

Prüfe, ob der **Bot aktiv** ist, der **Token** stimmt und dein Chat unter **Erlaubte Chats** steht ([Telegram](../netzwerk/telegram.md)).
