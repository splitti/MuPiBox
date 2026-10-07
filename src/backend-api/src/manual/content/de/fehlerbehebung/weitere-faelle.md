# Weitere Fälle

## Das WLAN-Symbol fehlt, obwohl die Box verbunden ist

Die Statusanzeige am Display liest den Online-Zustand der Box aus einer Datei, die ein kleiner Dienst (`mupi_check_internet`) pflegt. In älteren Versionen konnte dieser Zustand auf „offline“ hängen bleiben, obwohl die Box im Netz war. Neuere Versionen gleichen ihn mit dem echten Zustand ab.

- Starte die Box neu ([Neu starten und Ausschalten](../wartung/neustart.md)).
- Prüfe, ob die Box wirklich online ist, zum Beispiel ob Spotify oder ein Podcast lädt.
- Bleibt es dabei, installiere ein [Update](../wartung/updates.md).

## Das Display ist dunkel

- Das Display schaltet sich nach der eingestellten Zeit von selbst aus. Ein Tipp weckt es ([Display](../hardware/display.md)).
- Bleibt es dunkel, prüfe **Display aus nach** und die Helligkeit.
- Das Display zeigt eine **alte Seite** nach einem Update? Starte nur die Anzeige neu: **Einstellungen › System › Neu starten & Ausschalten › Display & Dienste › Display neu starten**.

## Cover fehlen

- Siehst du eine **farbige Karte mit dem Ordnernamen**, hat die Box kein Bild gefunden. Das ist gewollt. Lade ein Cover hoch oder schalte **Cover online suchen** ein ([Cover](../inhalte/cover.md)).
- Ein **falsches** Cover verwirfst du unter **Bibliothek › Cover** in der Karte **Gefundene Cover** mit **Verwerfen**. Das Album fällt dann auf das Bild des Ordners darüber zurück.

## Ein neues Album erscheint nicht

Eigene Dateien erscheinen von selbst, wenn sie vollständig kopiert sind. Bei einem **NAS** hilft **Index aktualisieren** ([NAS](../inhalte/nas.md)). Liegen die Dateien im falschen Ordner, passt die Kategorie nicht.

## Die Box ist langsam oder die Anzeige ruckelt

- **Unterspannung**: ein zu schwaches Netzteil oder Kabel ist die häufigste Ursache ([System- und Experteneinstellungen](../wartung/system.md)).
- **Temperatur**: zeigt **Zustand der Box** hohe Werte, hilft ein [Lüfter](../hardware/luefter.md) oder ein besseres Gehäuse.
- **USB-Stick am falschen Anschluss**: Läuft die Box von einem USB-Stick oder einer SSD, gehört er in einen blauen USB-3.0-Port. Am schwarzen USB-2.0-Port ist er um ein Vielfaches langsamer, vor allem wenn der Arbeitsspeicher knapp wird. **Über die Box** zeigt dann einen Hinweis.
- **Speicherkarte voll**: Der freie Platz steht unter **Über die Box**. Räume auf oder lagere Medien aufs [NAS](../inhalte/nas.md) aus.

## Ein Update ist fehlgeschlagen

Scheitert schon das Herunterladen oder das Auspacken der neuen Version, bleibt die bisherige Installation erhalten. Einen vollständigen Rückweg auf den alten Stand gibt es sonst nicht. Was passiert ist, zeigt die Seite **Updates** unter **Ausgabe**.

Einstellungen, Bibliothek und Cover hat die Box vor dem Update gesichert: in `/home/dietpi/mupibox-backups/before-update-….zip`. Läuft die Box danach nicht normal, spiele das [Backup](../wartung/backup.md) ein, das du vorher gemacht hast. Hilft das nicht, frag in der Community nach oder melde den Fehler auf GitHub ([splitti/MuPiBox](https://github.com/splitti/MuPiBox/issues)), am besten mit den **Support-Infos** ([Protokolle und Zustand](../wartung/protokolle.md)).

## Die Box meldet sich nicht bei Telegram

Prüfe, ob der **Bot aktiv** ist, der **Token** stimmt und dein Chat unter **Erlaubte Chats** steht ([Telegram](../netzwerk/telegram.md)).
