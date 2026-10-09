# Die App öffnen und anmelden

Die App ist die Oberfläche für Eltern. Sie läuft in jedem Browser, auf dem Handy genauso wie am PC, und ist nur im eigenen Netzwerk erreichbar.

## Die Adresse

Gib in die Adresszeile deines Browsers die Adresse der Box ein, zum Beispiel:

```
http://mupibox.local/
```

oder mit der IP-Adresse der Box:

```
http://192.168.1.50/
```

Die Startseite der Box ist das Anmeldefenster der App. Von dort gelangst du in die App und in die ältere Admin-Oberfläche der Box. Die App liegt unter `/app/`, dieses Handbuch unter `/manual/`.

> [!TIP]
> Setze ein Lesezeichen oder lege die App auf den Startbildschirm deines Handys. Mit eingerichtetem HTTPS lässt sie sich wie eine App installieren ([Passwort und HTTPS](../netzwerk/sicherheit.md)).

## Anmelden

Die App kennt mehrere Wege hinein:

- **Mit Passwort**, das du unter **Einstellungen › Sicherheit › Passwort & Anmeldung** vergibst. Es gilt für die ganze App, am Handy wie am PC.
- **Per QR-Code am Display**: Halte die Statusanzeige oben rechts am Display einige Sekunden gedrückt (die Haltezeit ist einstellbar unter **Einstellungen › Display & Bedienung › Bedienung am Display**). Es öffnen sich die Einstellungen am Display. Tippe dort auf **Parent web app**: Es erscheint ein QR-Code, den du mit dem Handy scannst. Das geht auch ohne Passwort ([Einstellungen am Display](../bedienung/eltern-zugang.md)).
- **Mit einem Link über Telegram**, wenn du den Bot eingerichtet hast ([Telegram](../netzwerk/telegram.md)).

Ist **Anmeldung verlangen** eingeschaltet, schützt die Box auch ihre Display-Seite und ihre Schnittstelle vor Zugriffen aus dem Netzwerk. Die Box selbst, ihr Display und ihre eigenen Dienste sind davon nicht betroffen.

> [!WARNING]
> Solange kein Passwort gesetzt ist und die Anmeldung nicht verlangt wird, kann jeder in deinem Netzwerk die Box einstellen. Vergib bei einem gemeinsam genutzten Netzwerk ein Passwort.

## Aufbau der App

| Bereich | Inhalt |
| --- | --- |
| **Start** | Übersicht und Schnellzugriffe |
| **Hören** | Was läuft gerade, [Hör-Verlauf](../spielzeit/hoer-verlauf.md) |
| **Spielzeit** | [Tageslimits, Ruhezeiten und Schlaftimer](../spielzeit/index.md) |
| **Bibliothek** | [Inhalte hinzufügen und verwalten](../inhalte/index.md) |
| **Einstellungen** | alles andere, geordnet nach Aussehen, Display & Bedienung, Audio, Akku & Strom, Netzwerk, Dienste, Sicherheit und System |

## Sprache

Die App spricht 17 Sprachen. **Einstellungen › System › Sprache** legt die Sprache der App fest („Automatisch“ folgt dem Browser) und getrennt davon die Sprache der Box für die Texte auf dem Display.
