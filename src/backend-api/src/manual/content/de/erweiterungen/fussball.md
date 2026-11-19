# Fußball

Die Erweiterung **Fußball** zeigt auf dem Display, wie der **eigene Verein** gespielt hat und wann er wieder spielt, die Spiele des **aktuellen Spieltags** und die **Tabelle**. Sie richtet auf der Box nichts ein; die Ergebnisse holt die Box im Internet bei **OpenLigaDB** oder, mit einem eigenen Schlüssel, bei **football-data.org**.

Es gibt keine Wetten, keine Werbung, keine Links ins Internet und keine Spielerbilder, nur Wappen, Namen und Zahlen.

## Einrichten

1. Installiere die Erweiterung unter **Einstellungen › System › Erweiterungen** ([Installieren und verwalten](installieren.md)).
2. Öffne die Details ihrer Karte und wähle die **Liga**.
3. Suche unter **Lieblingsverein** nach dem Namen des Vereins und tippe ihn an.

Das Display zeigt dann oben den Reiter **Fußball** (ein Ball). Ein Tipp darauf öffnet die Seite mit drei Knöpfen:

| Ansicht | Inhalt |
| --- | --- |
| **Mein Verein** | das Wappen, der Tabellenplatz, das letzte Spiel mit Ergebnis und das nächste mit Tag und Uhrzeit; läuft gerade ein Spiel, steht das Ergebnis groß in der Mitte |
| **Spieltag** | alle Spiele des aktuellen Spieltags; mit den Pfeilen oder mit Wischen kommst du zum Spieltag davor und danach. Der eigene Verein ist hervorgehoben |
| **Tabelle** | Platz, Spiele, Tordifferenz und Punkte; beim Öffnen steht der eigene Verein in der Mitte. Ein farbiger Strich markiert die Plätze für den Aufstieg oder die Champions League (grün), die Relegation (orange) und den Abstieg (rot) |

Beim **DFB-Pokal** gibt es keine Tabelle. Ohne Lieblingsverein gibt es die Ansicht **Mein Verein** nicht.

## Einstellungen

| Einstellung | Wirkung |
| --- | --- |
| **Quelle** | **OpenLigaDB** (frei, ohne Anmeldung, vor allem deutsche Ligen) oder **football-data.org** (mit Schlüssel, siehe unten) |
| **Liga** | 1. Bundesliga, 2. Bundesliga, 3. Liga, DFB-Pokal oder Frauen-Bundesliga |
| **Wettbewerb** und **API-Schlüssel** | nur bei football-data.org, siehe unten |
| **Lieblingsverein** | nach dem Namen suchen und den Verein antippen; **Keinen Verein** nimmt ihn wieder weg |
| **Ansicht beim Öffnen** | was der Reiter zuerst zeigt |
| **Ergebnis in der Kopfzeile** | während ein Spiel des Vereins läuft, stehen oben im Display die beiden Wappen und der Spielstand; ein Tipp darauf öffnet die Seite (Standard: an) |
| **Tore ansagen** | schießt der Verein ein Tor, sagt die Box es mit ihrer Stimme an, etwa „Tor für Bremen! 2 zu 1.“; Musik wird dabei leiser, angehalten wird sie nicht (Standard: aus) |
| **Abfrage** | ob die letzte Abfrage geklappt hat, und wann sie war |

> [!NOTE]
> In der **Ruhezeit** und wenn die Box **gesperrt** ist (Spielzeit aufgebraucht, Pause der Eltern), gibt es keine Ansage und kein Ergebnis in der Kopfzeile. Die Ansage kommt höchstens einmal pro Minute und erst, nachdem die Box das Spiel einmal laufen gesehen hat: Ein Tor von vorhin sagt sie nach dem Einschalten nicht an. Das Display wird dafür nicht geweckt. Wie schnell die Ansage kommt, hängt davon ab, wann OpenLigaDB das Tor einträgt. Fallen zwei Tore kurz nacheinander, kommt das zweite eine Minute später. Die Ansage braucht die **Sprachausgabe** der Box und spricht in ihrer Sprache. Nimmt OpenLigaDB ein Tor zurück und trägt es neu ein, sagt die Box es noch einmal an.

### Mehrere Benutzer

Sind [mehrere Benutzer](../bedienung/mehrere-benutzer.md) eingeschaltet, hat **jeder Benutzer seine eigene Liga, seinen eigenen Verein und seine eigene Ansicht**. Über dem Formular steht dann **Einstellungen von** mit einem Knopf für jeden Benutzer: So stellst du den Verein eines Kindes ein, ohne die Box umzuschalten. Die so markierten Felder zeigen **je Benutzer**. Nach einem Wechsel des Benutzers zeigt das Display gleich dessen Verein.

## Andere Ligen: football-data.org

Für die großen Ligen Europas gibt es die zweite Quelle **football-data.org**: Premier League, Championship, Bundesliga, LaLiga, Serie A, Ligue 1, Eredivisie, Primeira Liga, Brasileirão, Champions League sowie Welt- und Europameisterschaft.

1. Melde dich kostenlos auf [football-data.org](https://www.football-data.org) an („Register“). Der Schlüssel kommt per E-Mail.
2. Wähle unter **Quelle** football-data.org, trage den **API-Schlüssel** ein und tippe auf **Speichern**. Der Schlüssel gilt für die ganze Box; die App zeigt ihn danach nicht mehr an.
3. Wähle den **Wettbewerb** und suche den **Lieblingsverein**. Jede Quelle hat ihren eigenen Lieblingsverein: Wechselst du zurück, ist der alte wieder da.

> [!NOTE]
> Die kostenlose Stufe von football-data.org liefert die Ergebnisse **mit Verzögerung**. Unten auf der Seite steht dann **mit Verzögerung**, und auch die Tor-Ansage kommt später. Die Box bleibt dort unter der Grenze von zehn Abfragen pro Minute; bei geschlossener Seite fragt sie höchstens alle zwei Minuten. Als Spiele des Vereins zeigt sie nur die des gewählten Wettbewerbs.

## Wie oft die Box fragt

Die Ergebnisse trägt die Gemeinschaft von OpenLigaDB ein, bei der Bundesliga meist wenige Minuten nach dem Tor, bei anderen Ligen manchmal später.

- **Seite offen:** Während ein Spiel läuft, fragt die Box jede Minute, an einem Spieltag sonst alle 15 Minuten, ansonsten stündlich.
- **Seite zu, Verein gewählt:** Die Box fragt nur nach den Spielen des Vereins: jede Minute, während er spielt, am Tag seines Spiels alle 15 Minuten, sonst stündlich.
- **Kein Verein gewählt:** Bei geschlossener Seite fragt die Box gar nicht.

Antwortet OpenLigaDB nicht, bleibt der letzte Stand stehen, und unten steht **Keine Verbindung zur Quelle – letzter Stand**. Die Box versucht es dann in immer größeren Abständen wieder, bis zu 30 Minuten.

Die **Wappen** holt die Box einmal und hebt sie auf. Das Display fragt nie selbst einen fremden Server. Fehlt ein Wappen, steht dort ein Kreis mit dem Kürzel des Vereins.

## Wenn nichts erscheint

- Ist die Erweiterung unter **Einstellungen › System › Erweiterungen** eingeschaltet?
- Die Ergebnisse und die Vereinssuche brauchen Internet.
- In der Sommerpause und zwischen den Runden des Pokals kann der Spieltag leer sein.
