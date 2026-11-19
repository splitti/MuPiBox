# Fußball

Die Erweiterung **Fußball** zeigt auf dem Display, wie **deine Vereine** gespielt haben und wann sie wieder spielen, die Spiele des **aktuellen Spieltags** und die **Tabelle**. Sie richtet auf der Box nichts ein; die Ergebnisse holt die Box im Internet bei **OpenLigaDB** oder, mit einem eigenen Schlüssel, bei **football-data.org**.

Es gibt keine Wetten, keine Werbung, keine Links ins Internet und keine Spielerbilder, nur Wappen, Namen und Zahlen.

## Einrichten

1. Installiere die Erweiterung unter **Einstellungen › System › Erweiterungen** ([Installieren und verwalten](installieren.md)).
2. Öffne die Details ihrer Karte und wähle die **Liga**: Ihr Spieltag und ihre Tabelle stehen auf dem Display.
3. Suche unter **Meine Vereine** nach einem Verein. Ein Tipp auf **＋ Name** folgt ihm. Bis zu fünf Vereine sind möglich, auch Nationalmannschaften wie **Deutschland**.

Das Display zeigt dann oben den Reiter **Fußball** (ein Ball). Ein Tipp darauf öffnet die Seite mit drei Knöpfen:

| Ansicht | Inhalt |
| --- | --- |
| **Mein Verein** / **Meine Vereine** | je Verein das Wappen, der Tabellenplatz, das letzte Spiel mit Ergebnis und das nächste mit Tag und Uhrzeit; läuft gerade ein Spiel, steht das Ergebnis groß darüber. Mehrere Vereine stehen untereinander |
| **Spieltag** | alle Spiele des aktuellen Spieltags; mit den Pfeilen oder mit Wischen kommst du zum Spieltag davor und danach. Deine Vereine sind hervorgehoben |
| **Tabelle** | Platz, Spiele, Tordifferenz und Punkte; beim Öffnen steht dein Verein in der Mitte. Ein farbiger Strich markiert die Plätze für den Aufstieg oder die Champions League (grün), die Relegation (orange) und den Abstieg (rot). Spielen deine Vereine in verschiedenen Ligen, stehen über der Tabelle Knöpfe je Liga, etwa **1. Bundesliga** und **LaLiga**; Wischen wechselt ebenso |

Beim **DFB-Pokal** zeigt die Tabelle die Ligen deiner Vereine. Ohne Verein gibt es die Ansicht **Mein Verein** nicht.

Die Spiele eines Vereins kommen aus **allen Wettbewerben**, die die Quelle kennt: bei Bayern also Bundesliga, DFB-Pokal und Champions League, bei Deutschland Länderspiele und Turniere. Den Tabellenplatz zeigt die Box aus der Tabelle der Liga, in der der Verein spielt. Die Tabellen anderer Ligen holt sie nur bei offener Seite, höchstens stündlich; eine Liga von football-data.org braucht den Schlüssel. Pokale und Nationalmannschaften haben keine eigene Tabelle; die Champions League zeigt ihre Ligaphase, wenn du sie als Wettbewerb wählst.

## Einstellungen

| Einstellung | Wirkung |
| --- | --- |
| **Quelle** | **OpenLigaDB** (frei, ohne Anmeldung, vor allem deutsche Ligen) oder **football-data.org** (mit Schlüssel, siehe unten) |
| **Liga** | 1. Bundesliga, 2. Bundesliga, 3. Liga, DFB-Pokal oder Frauen-Bundesliga |
| **Wettbewerb** und **API-Schlüssel** | nur bei football-data.org, siehe unten |
| **Meine Vereine** | nach dem Namen suchen: **＋** folgt einem Verein, **✕** hört auf – zum Aufhören suchst du also den Namen des Vereins. Bei fünf Vereinen kommt erst wieder ein **＋**, wenn du einen entfernt hast |
| **Ansicht beim Öffnen** | was der Reiter zuerst zeigt |
| **Ergebnis in der Kopfzeile** | während ein Spiel eines deiner Vereine läuft, stehen oben im Display die beiden Wappen und der Spielstand, bei mehreren Spielen nebeneinander; ein Tipp darauf öffnet die Seite (Standard: an) |
| **Tore ansagen** | schießt einer deiner Vereine ein Tor, sagt die Box es mit ihrer Stimme an, etwa „Tor für Bremen! 2 zu 1.“; Musik wird dabei leiser, angehalten wird sie nicht (Standard: aus) |
| **Abfrage** | ob die letzte Abfrage geklappt hat, und wann sie war |

> [!NOTE]
> In der **Ruhezeit** und wenn die Box **gesperrt** ist (Spielzeit aufgebraucht, Pause der Eltern), gibt es keine Ansage und kein Ergebnis in der Kopfzeile. Die Ansage kommt höchstens einmal pro Minute und erst, nachdem die Box das Spiel einmal laufen gesehen hat: Ein Tor von vorhin sagt sie nach dem Einschalten nicht an. Das Display wird dafür nicht geweckt. Wie schnell die Ansage kommt, hängt davon ab, wann die Quelle das Tor einträgt. Fallen zwei Tore kurz nacheinander, kommt das zweite eine Minute später. Die Ansage braucht die **Sprachausgabe** der Box und spricht in ihrer Sprache. Nimmt die Quelle ein Tor zurück und trägt es neu ein, sagt die Box es noch einmal an.

### Mehrere Benutzer

Sind [mehrere Benutzer](../bedienung/mehrere-benutzer.md) eingeschaltet, hat **jeder Benutzer seine eigene Liga, seine eigenen Vereine und seine eigene Ansicht**. Über dem Formular steht dann **Einstellungen von** mit einem Knopf für jeden Benutzer: So stellst du die Vereine eines Kindes ein, ohne die Box umzuschalten. Die so markierten Felder zeigen **je Benutzer**. Nach einem Wechsel des Benutzers zeigt das Display gleich dessen Vereine.

## Andere Ligen: football-data.org

Für die großen Ligen Europas gibt es die zweite Quelle **football-data.org**: Premier League, Championship, Bundesliga, LaLiga, Serie A, Ligue 1, Eredivisie, Primeira Liga, Brasileirão, Champions League sowie Welt- und Europameisterschaft.

1. Melde dich kostenlos auf [football-data.org](https://www.football-data.org) an („Register“). Der Schlüssel kommt per E-Mail.
2. Wähle unter **Quelle** football-data.org, trage den **API-Schlüssel** ein und tippe auf **Speichern**. Der Schlüssel gilt für die ganze Box; die App zeigt ihn danach nicht mehr an.
3. Wähle den **Wettbewerb**. Unter **Meine Vereine** findest du jetzt dessen Vereine.

**Vereine aus beiden Quellen:** Ein Verein bleibt bei der Quelle, bei der du ihm gefolgt bist. Für Bayern, Deutschland und Barcelona folgst du Bayern und Deutschland bei OpenLigaDB, stellst die Quelle kurz auf football-data.org mit dem Wettbewerb **LaLiga**, folgst Barcelona und stellst die Quelle wieder zurück. Liga, Spieltag und Tabelle kommen dann wieder von OpenLigaDB, Barcelona weiter von football-data.org. Barcelona braucht dafür den Schlüssel.

> [!NOTE]
> Die kostenlose Stufe von football-data.org liefert die Ergebnisse **mit Verzögerung**. Unten auf der Seite steht dann **mit Verzögerung**, und auch die Tor-Ansage kommt später. Die Box bleibt dort unter der Grenze von zehn Abfragen pro Minute. Von einem Verein bei football-data.org zeigt sie die Spiele der drei Wochen davor und danach (nimmt football-data.org so viele Tage nicht an, zehn Tage).

## Wie oft die Box fragt

Die Ergebnisse trägt die Gemeinschaft von OpenLigaDB ein, bei der Bundesliga meist wenige Minuten nach dem Tor, bei anderen Ligen manchmal später.

- **Deine Vereine:** jede Minute, während einer spielt (ab kurz vor dem Anstoß; bei football-data.org alle zwei Minuten), bei offener Seite alle zehn Minuten, sonst stündlich.
- **Spieltag und Tabelle der Liga:** bei offener Seite jede Minute, während ein Spiel läuft, an einem Spieltag sonst alle 15 Minuten; bei geschlossener Seite höchstens stündlich.
- **Kein Verein gewählt:** Bei geschlossener Seite fragt die Box gar nicht.

Antwortet die Quelle nicht, bleibt der letzte Stand stehen, und unten steht **Keine Verbindung zur Quelle – letzter Stand**. Die Box versucht es dann in immer größeren Abständen wieder, bis zu 30 Minuten; einen Verein fragt sie nach höchstens fünf Minuten wieder. Die Kopfzeile zeigt ein Spiel nur, solange die letzte Antwort höchstens drei Minuten alt ist.

Unten auf der Seite steht, woher die Daten kommen: **Daten: OpenLigaDB (ODbL)** und, bei football-data.org, **Football data provided by the Football-Data.org API**.

Die **Wappen** holt die Box einmal und hebt sie auf. Das Display fragt nie selbst einen fremden Server. Fehlt ein Wappen, steht dort ein Kreis mit dem Kürzel des Vereins.

## Wenn nichts erscheint

- Ist die Erweiterung unter **Einstellungen › System › Erweiterungen** eingeschaltet?
- Die Ergebnisse und die Vereinssuche brauchen Internet.
- Ist **football-data.org** als Quelle gewählt, aber noch kein Schlüssel gespeichert, gibt es den Reiter nicht, und die Vereinssuche findet nichts.
- In der Sommerpause und zwischen den Runden des Pokals kann der Spieltag leer sein.
- Bei einer Nationalmannschaft stehen Spiele oft erst kurz vorher bei OpenLigaDB: Dann steht dort **Kein Spiel geplant**.
