# Handoff: MuPiBox – eine App für alles (Admin-Interface + Eltern-App)

## Ziel
Die MuPiBox bekommt **eine einzige Web-App**. Sie ersetzt das heutige **Admin-Interface** (PHP, Port 80) und die heutige **Eltern-App** (Port 8200) vollständig. Erreichbar ist sie wie heute das Admin-Interface direkt unter der Adresse der Box (Port 80). Es gibt ein Login, ein Design, hell und dunkel, für Handy und PC, in den 17 Sprachen der Box.

Maßgeblich für **was wo steht** ist `zielbild/ZIELBILD.md` (mit Herkunft jeder Einstellung: `A:` = Admin-Interface, `E:` = Eltern-App). Die echten Felder, Optionen und Grenzen stehen in `zielbild/bestand-admin.md` und `zielbild/bestand-eltern-app.md`. **Wie es aussieht und sich bedient**, zeigt der Prototyp.

## Über die Design-Dateien
`design-reference/MuPiBox App Prototyp.dc.html` (im Browser öffnen, `support.js` und die Ordner daneben) ist ein **klickbarer Prototyp in HTML**, kein Produktionscode. Oben schaltest du Handy/PC, hell/dunkel und die **Übersicht der Navigation** (Baum) um. Alle Schalter, Regler und Blätter reagieren nur lokal. Die Aufgabe ist, die App **mit den Mitteln des Repositorys** zu bauen und dabei **alle vorhandenen Funktionen** der beiden alten Oberflächen zu übernehmen.

Weitere Referenzen: `Eltern App Entwurf/Frame.dc.html` (21 Bildschirme mit Maßen) und `Admin Interface Entwurf/Frame.dc.html` (Admin-Design, 17 Sprachen). Aus beiden stammt die Designsprache der neuen App. Wo sich Prototyp und ältere Entwürfe unterscheiden, **gilt der Prototyp**.

## Fidelity
**High-Fidelity** bei Farben, Typografie, Abständen, Bausteinen und Navigation. Inhalte (Cover, Namen, Zahlen) sind Beispiele. Die Informationsarchitektur (welche Seite, welche Einstellung wo) ist **verbindlich**. Abweichungen nur mit Begründung in der Abschluss-Meldung.

## Paketinhalt
```
README.md                     diese Datei
PROMPT_FUER_CLAUDE_CODE.md    Auftrag
NAVIGATION.md                 alle 57 Seiten mit jeder Einstellung (Beschriftung, Typ, Optionen, Bereich, Standard)
app-schema.json               dasselbe maschinenlesbar (156 Einstellungen mit Schlüssel) + Suchindex + Theme- und Startbild-Listen
mupi-tokens.css               Farben hell/dunkel, Schriften, Maße (gemeinsam mit den alten Entwürfen)
zielbild/                     ZIELBILD.md (maßgeblich), bestand-admin.md, bestand-eltern-app.md, Original-Auftrag
i18n/admin-17-sprachen/       vorhandene Admin-Übersetzungen (17 Sprachen) als Ausgangspunkt
i18n/eltern-app-i18n.js       vorhandene Eltern-App-Texte (de, en)
design-reference/             Prototyp + ältere Entwürfe + Vorschaubilder (theme-data/, entwurf-boot/, admin-assets/)
vorgaenger/                   READMEs der Einzel-Handoffs (Admin-Interface, Eltern-App, Statusanzeige) für Detailmaße
```
Die Schriften **Fredoka** und **Nunito Sans** (SIL OFL) fehlen im Paket. Claude Code lädt sie als WOFF2 aus google/fonts, legt sie lokal ab und bindet sie mit Lizenz ein. Es gibt keine externen Requests.

---

## 1. Vorgehen & Architektur (Claude Code entscheidet im Repo)
1. **Bestand erkunden:** Admin-Interface (PHP-Seiten, `includes/`, JS, die Endpunkte, die Einstellungen schreiben) und Eltern-App (`index.html`, `app.js`, `i18n.js`, Server/API auf Port 8200). Herausfinden, **wo jede Einstellung gelesen und geschrieben wird** (z. B. `mupiboxconfig.json`, Shell-Skripte, Dienste).
2. **Mapping-Datei anlegen:** `docs/app-mapping.md`, eine Zeile je Einstellung aus `app-schema.json`: Seiten-Id · Schlüssel im Prototyp · **echter Konfig-Schlüssel / Endpunkt** · Herkunft (A:/E:) · Lesen/Schreiben · Nebenwirkung (Neustart eines Dienstes o. ä.). **Keine Einstellung aus bestand-*.md darf fehlen.** Lücken markieren.
3. **Technik:** Die neue App baut auf der Eltern-App auf (sie ist schon eine Single-Page-App mit API und i18n) und wird auf **Port 80** ausgeliefert. Die Funktionen des Admin-Interfaces werden als API-Endpunkte bereitgestellt: vorhandene PHP-Logik wiederverwenden oder als Endpunkte kapseln, **nichts neu erfinden**. Wenn der Repo-Aufbau eine andere Lösung klar nahelegt, diese begründen.
4. **Übergang:** Solange nicht alles umgezogen ist, bleiben die alten Oberflächen unter `/legacy/` erreichbar. Der Link steht unter Einstellungen › System › Experten. Wenn die Checkliste erfüllt ist, fallen sie weg. Port 8200 leitet auf die neue App um.
5. **Login:** Aus zwei Passwörtern (Admin + Eltern) wird **eines**. Bei der Migration gilt: Ist nur eines gesetzt, wird es übernommen. Sind beide gesetzt, gilt das Admin-Passwort, und die App zeigt einmal einen Hinweis. Die Anmeldung per QR-Code am Display und per Magic-Link über Telegram bleibt.
6. **Kleine Schritte** (je ein Commit): Gerüst + Tokens + Navigation → Start → Hören → Spielzeit → Bibliothek → Einstellungen je Gruppe → Login/Migration → i18n → Aufräumen.

## 2. Designsprache
- **Tokens:** `mupi-tokens.css`. Nur `--mp-*` verwenden. `<html data-theme="dark|light|auto">`, Standard **dunkel**. Die Wahl wird in `localStorage` gespeichert und vor dem ersten Paint gesetzt (Inline-Skript im `<head>`), damit nichts blitzt.
- **Farbrollen:** **Bernstein `--mp-accent`** = läuft gerade / Hörzeit / Bonus. **Blau `--mp-primary`** = Bedienung, Auswahl, Haupt-Buttons. `--mp-danger` = Löschen, Ausschalten, Zurücksetzen. `--mp-success` = verbunden, ok. `--mp-warn` + `--mp-warn-soft` = Warnhinweise.
- **Schrift:** Fredoka 600 für Titel, Zahlen im Ring und die Marke. Nunito Sans 400–800 für alles andere. Größen: Seitentitel 21, große Titel 28–30, Kartentitel 17/700, Text 15, Unterzeilen 13–14, Etiketten 12/700.
- **Maße:** Tippziel ≥ 44, Felder und Haupt-Buttons 48, Karten Radius 16, große Karten 24, Felder/Buttons 12, Chips 10, Pillen 19. Abstände 14 (Karten), Innenabstand der Karten 16. Inhaltsbreite Handy max. 480, PC max. 1000. **Ab 1200 px** stehen Seiten mit mehreren Karten (z. B. Spielzeit, Akku, Über die Box) **in zwei Spalten** (`grid-template-columns: repeat(2, minmax(0,1fr))`, Abstand 14); breite Bausteine (Theme- und Startbild-Raster, NAS-Ordner, Protokoll, JSON) gehen über beide Spalten. Darunter eine Spalte, max. 760.
- **Bewegung:** 160–220 ms, nur `transform`/`opacity`. `prefers-reduced-motion` wird respektiert.

## 3. Rahmen & Navigation
- **Handy (< 960 px):** untere Leiste 76 hoch (+ `env(safe-area-inset-bottom)`) mit 5 Bereichen **Start · Hören · Spielzeit · Bibliothek · Einstellungen** (`start`, `hoeren`, `spielzeit`, `bibliothek`, `einstellungen`). Jeder Bereich hat ein Symbol 21 in einer Pille 52 × 30 und Text 11. Aktiv: Pille `--mp-primary-soft`, Text `--mp-primary-text`/700.
- **PC (≥ 960 px):** Seitenleiste 248 breit (`--mp-surface`, Rand rechts) mit MuPi + Boxname oben, den 5 Bereichen (44 hoch, Radius 10). Unter „Einstellungen“ klappen die 8 Gruppen auf, wenn der Bereich aktiv ist.
- **Kopfleiste** 70 hoch: auf Unterseiten „Zurück“ 44 × 44. Titel Fredoka 21, einzeilig; auf Start der **Boxname** (leer = „MuPiBox“). Rechts Hell/Dunkel und Abmelden (44 × 44).
- **Höchstens 3 Ebenen:** Bereich › Gruppe › Detailseite. Unterseiten markieren ihren Bereich als aktiv.
- **Einstellungen:** oben ein **Suchfeld** 48. Es sucht über den Suchindex (`app-schema.json › searchIndex`: Begriff → Seite, „wo“-Pfad). Treffer als Liste „Begriff · Bereich › Seite“, Tipp öffnet die Seite. Darunter die 8 Gruppen als Listenzeilen (Symbol 36, Titel, Unterzeile).
- **Toast** nach dem Speichern: unten mittig über der Tab-Leiste. **Blätter** (Sheets) von unten: Radius 24 oben, Griff 40 × 5, Scrim `--mp-scrim`, `Esc`/Scrim schließt, der Fokus bleibt im Blatt.

## 4. Die 5 Bereiche
**Start** (`start`): Kopf mit Begrüßung nach Tageszeit. **Läuft gerade** (Karte Radius 24, `--mp-hero`): Cover 96 mit Bernstein-Glow, Label „Läuft gerade“, Titel Fredoka 20, Interpret · Kategorie. Fortschritt 6 in Bernstein mit Zeiten. Knöpfe Zurück / Play-Pause 72 (Bernstein) / Vor / Stopp. Lautstärke 8 hoch mit **roter Markierung der Maximallautstärke** und Wert-Pille. Nichts läuft: MuPi, „Die Box ist ruhig.“, Button „Etwas abspielen“ → Hören. **Hinweis-Karte** nur wenn nötig (Update verfügbar, Akku fast leer, Spotify-Anmeldung abgelaufen), schließbar. **Status-Kacheln** 2 × 2: Akku (%, lädt), Heute gehört (x / y min), Ruhezeit, WLAN. **Schnell:** +15 min, Ruhe sofort, Schlaftimer. PC: 2 Spalten.
**Hören** (`hoeren`): oben die Zeile „Hör-Verlauf · Heute 42 min · 14 Titel“ → `verlauf`. Suche, Filter-Pillen Alle / Hörspiel / Musik / Radio / NAS, Cover-Raster 3 Spalten (PC 5) mit Quell-Etikett. Ordner zeigen Brotkrümel. Tippen spielt auf der Box ab (Toast). Unterseiten: Hör-Verlauf `verlauf`.
**Spielzeit** (`spielzeit`): **Ring** 108 (conic, Bernstein = verbraucht) mit „min übrig“. Daneben „x von y Minuten gehört“, Status (normal / Nachspielzeit / gesperrt) und Ruhezeit-Status. **Sofort-Aktionen:** Bonus-Zeit (Minuten + Schnellwahl +15), Sperren aufheben, Ruhe sofort. **Schlaftimer:** 15–360 min in 15er-Schritten, Start/Stopp, laufender Countdown. **Tageslimits:** Schalter, Minuten je Wochentag (0–1440, 0 = gesperrt) als Wochenbalken, Tipp öffnet ein Blatt; Tageswechsel (0–23 Uhr); „Wenn das Limit erreicht ist“: Sofort stoppen / Titel zu Ende spielen / Album zu Ende spielen. **Ruhezeiten:** Schalter, Regeln als Zeilen (Tag · von–bis · Bezeichnung, über Mitternacht möglich), **Bearbeiten im Blatt `rule`** (von, bis, Bezeichnung, Tage, Löschen), „+ Zeitfenster“; „Wenn eine Ruhezeit beginnt“: dieselben 3 Optionen. Links auf „Texte auf dem Display“ und „Hörschutz“.
**Bibliothek** (`bibliothek`): Button „Hinzufügen“ öffnet das **Blatt `add`** mit 3 Wegen (Auf Spotify suchen → `suche`, Link einfügen → `link`, Vom Gerät hochladen → `upload`). Dazu Suche, Filter Kategorie (Hörspiel / Musik / Sonstiges) und Quelle (manuell / Sync), Zähler und Liste mit Cover, Titel, Interpret, Kategorie-Etikett. Tipp öffnet das **Blatt `edit`** (Bearbeiten, Löschen). Unterseiten: Verwaltete Inhalte `verwaltet` · Auf Spotify suchen `suche` · Link einfügen `link` · Vom Gerät hochladen `upload` · Spotify Smart-Sync `sync` · Sync-Einstellungen `syncopt` · Spotify einrichten `wizard` · NAS `nas` · Cover `cover`.
**Einstellungen** (`einstellungen`): Suchfeld + 8 Gruppen:
- **Aussehen** `g-aussehen`: Theme `theme` · Eigenes Theme `eigenes` · Ansicht `ansicht` · Vorlesen `vorlesen` · Start- und Wartungsbilder `startbilder` · Texte auf dem Display `displaytexte`
- **Display & Bedienung** `g-display`: Display `displaysettings` · Bedienung am Display `bedienung` · Display live `displaylive`
- **Audio** `g-audio`: Lautstärke `lautstaerke` · Soundkarte `soundkarte` · Drehregler und Taster `drehregler` · Bluetooth `bluetooth`
- **Akku & Strom** `g-strom`: Akku `akku` · MuPiHAT & Akku-Profil `mupihat` · Automatisch ausschalten `autoaus` · Ein-/Ausschalter und LED `taster` · Lüfter `luefter`
- **Netzwerk** `g-netz`: WLAN `wlan` · Netzwerk-Optionen `wlanopt` · Freigaben & Fernzugriff `freigaben`
- **Dienste** `g-dienste`: Telegram `telegram` · MQTT / Home Assistant `mqtt` · WLED `wled` · Link „Spotify“ → `spotify` (Bibliothek)
- **Sicherheit** `g-sicherheit`: Passwort & Anmeldung `passwort`
- **System** `g-system`: Über die Box `ueber` · Updates `updates` · Backup `backup` · Neu starten & Ausschalten `neustart` · Protokolle `protokolle` · Systemoptionen `systemopt` · Browser (Chromium) `browser` · Experten `experten` · Sprache `sprache`

**Jede Detailseite mit jeder Einstellung** (Beschriftung, Typ, Optionen, Bereich, Standard, Hilfetext, Knöpfe) steht in `NAVIGATION.md` bzw. `app-schema.json`. **Diese Liste ist die Abnahme-Grundlage.**

## 5. Bausteine (`itemTypes` in app-schema.json)
- `toggle`: Zeile mit Label 15/700 (+ Hilfe 13 muted) und Schalter 52 × 30 (an `--mp-primary`, Knopf 24 weiß).
- `slider`: Label + Wert-Pille (`--mp-primary-soft`), Spur 8, Knopf 24 mit 3 px Rand. `min/max/step/unit` aus dem Schema.
- `select`: Feld 48 mit Pfeil. Bei langen Listen (Themes 67, Soundkarten 28, Sprachen 17/21) ein durchsuchbares Blatt.
- `seg`: Segment-Umschalter (2–4 Optionen), Höhe 44, aktiv `--mp-primary`.
- `text`: Feld 48 (`kind`: text / password mit Augen-Knopf / number mit Einheit / url), Fokus-Ring `0 0 0 3px var(--mp-primary-soft)`.
- `buttons`: Reihe, `primary` / `sec` (Rand) / `danger` (`--mp-danger-soft`). Gefährliche Aktionen (Ausschalten, Zurücksetzen, Backup einspielen, Passwort entfernen) **immer mit Bestätigungs-Blatt**.
- `nav`: Listenzeile ≥ 56 mit Symbolkachel 36, Titel, Unterzeile, Pfeil.
- `kv`: Detailzeilen Schlüssel/Wert mit Trennlinie. `big`: großer Wert (Fredoka). `bar`: Balken mit Label + Wert. `chart`: Balkendiagramm (7/24 Werte).
- `note` / `warn`: Hinweis (Radius 12, `--mp-primary-soft` bzw. `--mp-warn-soft`, Info-Symbol).
- `rows`: Liste von Einträgen (Geräte, Netze, Chats, Profile) mit Initialen/Symbol, Unterzeile, Chip-Aktion rechts.
- `days`: 7 Wochentage (Balken bzw. Minuten-Felder). `rules`: Ruhezeit-Regeln (s. o.). `checks`: Mehrfachauswahl (z. B. Kategorien ausblenden).
- `file`: Datei-Auswahl + Ablagefläche (gestrichelt, PC Drag & Drop) + Fortschritt.
- `themegrid`: Theme-Raster 3 Spalten (PC 5), Vorschau 5:3 aus dem echten Theme-Hintergrund; gewählt = 3 px `--mp-primary` + Haken.
- `bootgrid`: Startbild-Raster (`bootscreens`: „Zufällig“ + 16 Szenen, „Karte“ = Standard). `bootprev`: Vorschau 800 × 480 mit Auswahl der Art (Update, Installation, neues WLAN, Tschüss, Akku leer) und Boxname/Sprache.
- `dtfields` + `dtprev`: eigene Texte für „Limit erreicht“, „Ruhezeit“, „QR-Code für Eltern“ mit **Live-Vorschau 800 × 480** im gewählten Theme.
- `livescreen`: aktuelles Bild des Displays (Seitenverhältnis 5:3), Aktualisieren, „Fernsteuerung (VNC) öffnen“.
- `versions`: Update-Liste (stabil / Beta / Dev) mit Version, Datum, „Installieren“. `log`: Protokoll-Ansicht (Monospace 13, Auswahl der Datei, Suche, Pause, Download). `json`: JSON-Editor für die Konfiguration (Monospace, **Warnung** oben, Speichern mit Bestätigung).

## 6. Vorschläge gegenüber dem Zielbild (im Prototyp umgesetzt)
- **Fernsteuerung per IP:** von Dienste nach Netzwerk › Netzwerk-Optionen verschoben, weil es um die Erreichbarkeit der Box geht.
- **Controller-Debugging + PM2-Log:** von Browser nach System › Protokolle verschoben, weil beides der Fehlersuche dient. Chrome-Debugging bleibt beim Browser.
- **Hörschutz:** bleibt unter Audio › Lautstärke und ist zusätzlich aus Spielzeit verlinkt.
- **Spotify an einer Stelle:** Seite `spotify` unter Bibliothek mit Smart-Sync (Status, Jetzt synchronisieren, Playlists, Konflikte, `syncopt`, `wizard`) und darunter „Zugang des Players“ (Client-ID/Secret, Tokens, Playlists verarbeiten, Cache leeren, Zurücksetzen). Unter Dienste nur ein Link.
- **Hör-Verlauf:** als Zeile oben auf „Hören“ statt als eigener Reiter.

## 7. Was wegfällt
Doppelte Einstellungen gibt es nur noch einmal. Das betrifft Spielzeit, Ruhezeiten, Schlaftimer, Theme, Startbilder, Display-Texte, Lautstärke, Display aus, Auto-Shutdown, Akku-Profil, WLAN, Bluetooth, Telegram, Passwort und Neustart. „Reiter im Menü ausblenden“ entfällt. Die Seite „MuPiBox“ (content.php) geht in Hören und Display live auf, „Media“ (media.php) in Bibliothek › Inhalte. Aus zwei Logins wird eines.

## 8. Sprachen
Die App kommt in den **17 Sprachen** der Box (de, en, fr, es, it, nl, sv, da, nb, fi, pl, pt, tr, uk, ru, cs, el). **Einstellungen › System › Sprache** hat zwei Einstellungen: **Sprache der App** (`appLang`: Automatisch (Browser) + die 17) und **Sprache der Box** (`boxLang`, 17: Texte auf dem Display und in den Start- und Wartungsbildern; ersetzt `dt_language` und `bootscreenLanguage`, die heute getrennt sind – beim Einbau auf beide Konfig-Schlüssel schreiben oder zusammenführen). Bei „Texte auf dem Display“ und „Start- und Wartungsbilder“ steht die Sprache nur als Hinweis mit Link. Die **Vorlese-Sprache** (21) bleibt bei Aussehen › Vorlesen. Als Ausgangspunkt dienen `i18n/admin-17-sprachen/*.json` und `i18n/eltern-app-i18n.js`. Daraus entsteht **eine** Textdatei je Sprache mit sprechenden Schlüsseln. Neue Texte aus dem Prototyp kommen auf Deutsch hinzu und werden übersetzt. Unsichere Übersetzungen werden gemeldet. Die Texte auf dem Box-Display (display-texts.json) bleiben unabhängig davon.

## 9. Barrierefreiheit & Qualität
Kontrast Text ≥ 4.5 : 1 in beiden Themes. Tab-Leiste und Seitenleiste als `<nav>` mit `aria-current`. Symbol-Knöpfe mit `aria-label` (i18n). Formulare mit echten `<label>`. Tastatur voll bedienbar (PC). Offline lauffähig. Die App läuft flüssig auf dem Pi-Browser und auf alten Handys: keine großen Frameworks nachladen, Bilder lazy.

## 10. Abnahme
- [ ] Alle 57 Seiten aus `NAVIGATION.md` vorhanden und erreichbar, jede Einstellung dort, wo das Schema sie zeigt.
- [ ] `docs/app-mapping.md` vollständig. **Jede** Einstellung aus `bestand-admin.md` und `bestand-eltern-app.md` hat einen Platz, und jede speichert wirklich (gleiche Wirkung wie vorher).
- [ ] Handy: untere Leiste. PC ≥ 960: Seitenleiste mit aufklappenden Gruppen. Nichts läuft horizontal über (320 bis 1920 px).
- [ ] Suche in den Einstellungen findet z. B. „WLAN“, „Lüfter“, „Passwort“, „Hörschutz“, „Soundkarte“.
- [ ] Hell/Dunkel ohne Blitzen und gespeichert. Alle 17 Sprachen ohne fehlende Schlüssel, lange Texte (de, fi, ru, el) brechen sauber um.
- [ ] Ein Login, Migration beider Passwörter, QR-/Telegram-Anmeldung funktioniert.
- [ ] Gefährliche Aktionen fragen nach. Aktionen, die einen Neustart eines Dienstes brauchen, sagen das im Toast.
- [ ] Port 80 liefert die neue App, Port 8200 leitet um, `/legacy/` bis zum Abschluss erreichbar.
- [ ] Keine externen Requests (Schriften lokal).

## 10. Korrekturen Runde 2 (verbindlich)
1. **Spotify an einer Stelle:** `spotify` unter Bibliothek (Smart-Sync oben, „Zugang des Players“ darunter). Die frühere Seite „Spotify-Zugang des Players“ unter Dienste entfällt, dort steht nur ein Link. `syncopt` und `wizard` hängen unter `spotify`.
2. **Ein Name der Box** (`boxName`, max. 14 Zeichen, leer = „MuPiBox“) unter System › Über die Box. Er erscheint im Startbild, als Titel auf dem Start der App und in der PC-Seitenleiste und ist der Vorschlag für den **Playlist-Präfix** (`prefix` in `syncopt` und Assistent Schritt 5, vorbelegt, änderbar). Der **Hostname** (`host`) steht getrennt unter Experten mit dem Hinweis „Name der Box im Netzwerk, nur Buchstaben, Ziffern und Bindestrich“ (Eingabe entsprechend prüfen, Neustart nötig). Bei „Start- und Wartungsbilder“ nur ein Hinweis mit Link.
3. **Bluetooth:** ein Hauptschalter „Bluetooth“ (`btOn`). Aus = Bluetooth-Chip aus (spart Strom). Beim Einbau schreibt er Funk an/aus **und** „Deactivate Bluetooth-Chip“ zusammen.
4. **Sprachen:** siehe Abschnitt 8.
5. **Zurücksetzen** (System › Experten), jeweils mit Bestätigungs-Blatt, das sagt, was verloren geht:
   - „Box-Konfiguration zurücksetzen“ → `mupiboxconfig.json` auf Werkseinstellung (alle Einstellungen der Box; Bibliothek bleibt). Im alten Interface stand der Knopf fälschlich unter „Reset Spotify-Connection“.
   - „Medien-Datenbank zurücksetzen (data.json)“ → alle Einträge der Bibliothek außer lokalen Ordnern.
   - „Server-Konfiguration zurücksetzen (config.json)“ → Server-Konfiguration, der Player startet neu.
   - Zusätzlich in `spotify`: „Spotify-Zugang zurücksetzen“ (nur Zugangsdaten des Players).
6. **Echte Werte:** Drehregler `rotary.enabled`, `rotary.step` (Regler 1–10 %, Standard 5), `rotary.button` (`off` Aus · `playpause` Play/Pause · `next` Nächster Titel · `ffwd` Vorspulen). WLED: `wled.active`, `wled.com_port`, `wled.baud_rate`, `wled.main_preset`, `wled.boot_active` + `wled.boot_preset`, `wled.shutdown_active` + `wled.shutdown_preset`, `wled.brightness_default` und `wled.brightness_dimmed` (je 0–255). Vollständige Listen: Soundkarten 28, Protokolle/Dienste 25, Vorlese-Sprachen 21, Themes 67 (siehe `app-schema.json` und `zielbild/bestand-admin-voll.md`).
7. **PC:** ab 1200 px zwei Spalten (Abschnitt 2).
8. **Beispieldaten:** nur neutrale Namen („Kinderkopfhörer“, Platzhalter „z. B. Mias Box“). Aus den Quelltexten keine echten Namen übernehmen.
