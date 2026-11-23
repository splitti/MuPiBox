# Installieren und verwalten

Die Seite **Einstellungen › System › Erweiterungen** zeigt die installierten Erweiterungen als Karten und dahinter, was der Katalog sonst noch bietet. Sie ist nur mit der Anmeldung der Eltern erreichbar.

## Aus dem Katalog installieren

1. Öffne **Einstellungen › System › Erweiterungen**. Die Box holt den Katalog aus dem Internet (GitHub).
2. Tippe bei der gewünschten Erweiterung auf **Installieren**.
3. Die App zeigt, **was die Erweiterung auf der Box einrichtet** (zum Beispiel Zugriffsrechte für ein Gerät, einen Dienst oder ein Paket) und **was sie braucht** (Ports, GPIO-Pins, Dienste). Bestätige.

Die Box lädt die Datei, prüft ihre Prüfsumme und installiert sie. Danach starten Player, Server und Display kurz neu. **Eine laufende Wiedergabe bricht dabei ab**; die App sagt das vorher.

> [!NOTE]
> Ist der Katalog nicht erreichbar, braucht die Box Internet. Die installierten Erweiterungen laufen auch ohne weiter.

## Der Test vor der Installation

Bevor etwas installiert wird, prüft die Box, ob das, was die Erweiterung braucht, noch frei ist: Ports, GPIO-Pins und Dienste. Verglichen wird mit der Box selbst (Ein-/Aus-Taster, LED, Lüfter, Drehregler, MuPiHAT), mit der Boot-Konfiguration (zum Beispiel der Soundkarte), mit den anderen Erweiterungen und mit dem, was gerade läuft.

Gibt es eine Überschneidung, wird **nichts installiert**, und die App nennt, wer den Port oder Pin belegt. Derselbe Test läuft, wenn du eine ausgeschaltete Erweiterung wieder einschaltest.

## Einstellungen einer Erweiterung

Über die Karte einer Erweiterung öffnest du ihre Details mit den Einstellungen. Schalter und Auswahlen werden sofort gespeichert, Textfelder mit **Speichern**.

Manche Erweiterungen haben eine **eigene Seite**: Sie steht dann unter **Einstellungen › System** direkt nach **Erweiterungen**, und die Karte führt mit **Zu den Einstellungen** dorthin. So ist es bei [Buttons & GPIO Input](buttons.md).

## Ein- und ausschalten, entfernen, aktualisieren

| Aktion | Wirkung |
| --- | --- |
| **Schalter auf der Karte** | schaltet die Erweiterung aus oder wieder ein. Ihre Einstellungen bleiben erhalten |
| **Entfernen** | löscht die Erweiterung. Die Box nimmt wieder weg, was sie für sie eingerichtet hat (Zugriffsregeln und Dienste; Gruppen und Pakete bleiben, weil andere sie brauchen können) |
| **Neue Version** | bietet der Katalog eine neuere Version, steht das auf der Karte. Schlägt eine Aktualisierung fehl, stellt die Box die vorige Version wieder her |

Auch hier starten Player, Server und Display kurz neu.

## Eigene Dateien: der Entwicklermodus

Eine Erweiterung ist eine einzige Datei mit der Endung `.mpx`. Normalerweise kommt sie aus dem Katalog. Wer selbst eine baut oder eine Datei aus anderer Quelle hat, schaltet auf der Seite den **Entwicklermodus** ein. Dann gibt es den Knopf **Datei hochladen**:

1. **Entwicklermodus** einschalten und die Warnung bestätigen.
2. **Datei hochladen** und die `.mpx`-Datei wählen (höchstens 16 MB).
3. Die Box prüft die Datei, installiert aber noch nichts: Die App zeigt Name, Version, was eingerichtet wird, und die Prüfsumme (SHA-256).
4. Mit **Installieren** bestätigen.

> [!WARNING]
> Eine Erweiterung kann auf der Box alles, auch als Administrator. Lade nur Dateien hoch, die du selbst gebaut hast oder deren Quelle du vertraust. Schalte den Entwicklermodus danach wieder aus.

Wie man eine Erweiterung baut, steht in der Richtlinie für Entwickler im Repository (`extensions/README.md`).

## Nach einem Update der MuPiBox

Eine Erweiterung liegt in deinen Daten (`~/.mupibox/data/extensions/`), nicht im Programm der Box. Ein Update der MuPiBox lässt sie samt Einstellungen und Daten in Ruhe.

Die Box ist nach dem Update aber eine andere: Vielleicht nimmt sie die Beschreibung der Erweiterung nicht mehr an, oder ein Pin ist jetzt belegt. Darum **prüft die Box bei jedem Start** alle eingeschalteten Erweiterungen:

- Die Beschreibung (`manifest.json`) ist da und wird angenommen, und die Erweiterung ist nicht für eine neuere MuPiBox gemacht.
- Die Dateien, die sie nennt, sind da.
- Die Pins und Ports, die sie braucht, hält nicht die Box oder eine andere Erweiterung. Wollen zwei Erweiterungen dasselbe, gibt die zuletzt installierte nach.
- Ihr Programm lässt sich starten, und sie hat die Box nicht mehrmals kurz hintereinander zum Absturz gebracht.

Besteht eine Erweiterung die Prüfung nicht, **schaltet die Box sie aus** und merkt sich den Grund. Alles andere läuft weiter. Beim nächsten Öffnen der App erscheint ein Hinweis, und auf der Karte der Erweiterung unter **Einstellungen › System › Erweiterungen** steht ein gelber Kasten mit der Ursache (darunter in Klammern die technische Zeile, die du bei einer Fehlermeldung weitergeben kannst).

Was du tun kannst:

- **Ursache beheben** (die MuPiBox oder die Erweiterung aktualisieren, die Erweiterung neu installieren, den doppelt belegten Pin freigeben) und dann auf **Erneut versuchen** tippen. Das schaltet die Erweiterung wieder ein; die Box prüft dabei noch einmal.
- Die Erweiterung **entfernen**, wenn du sie nicht mehr brauchst.

**Ein Pin ist belegt?** Liegt der Grund an einem Pin, den du in den Einstellungen der Erweiterung gewählt hast (zum Beispiel ein Taster auf einem Pin, den die MuPiBox-HAT jetzt für sich braucht), fragt die App nach **Erneut versuchen**, was geschehen soll:

- **Auf freien Pin umstellen**: Die Box sucht den niedrigsten freien Pin (ab GPIO 4, ohne die serielle Schnittstelle GPIO 14 und 15), trägt ihn in den Einstellungen ein und schaltet die Erweiterung ein. Danach zeigt dir die App, von welchem Pin auf welchen umgestellt wurde. **Schließe das Gerät (zum Beispiel den Taster) an diesem neuen Pin an.**
- **Anschluss entfernen**: Der Pin wird auf „keiner“ gestellt und die Erweiterung eingeschaltet. Der Taster tut dann nichts, bis du in den Einstellungen einen Pin wählst.

Danach starten die Dienste der Box neu. Ist etwas anderes als ein Pin belegt (ein Port, ein Dienst, ein Pin, den die Erweiterung selbst festlegt), zeigt die App nur die Überschneidung, und du musst sie selbst beheben.

Schaltest du eine Erweiterung selbst aus oder wieder ein, ist der Hinweis weg.

## Wenn etwas nicht klappt

- **„Es läuft gerade etwas anderes"**: Es wird schon eine Erweiterung installiert oder entfernt. Warte, bis das fertig ist.
- **Die Installation meldet eine Überschneidung**: Die App nennt den Port oder Pin und wer ihn belegt. Gib ihn dort frei (zum Beispiel den Lüfter auf einen anderen Pin legen) und versuche es noch einmal.
- **Eine Erweiterung fehlt im Katalog**: Nicht jede Erweiterung steht im Katalog. Eine `.mpx`-Datei aus anderer Quelle installierst du im Entwicklermodus.
