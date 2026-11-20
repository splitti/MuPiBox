# Extensions der MuPiBox – Entwickler-Doku

Stand: Entwurf für 5.1. Die Basis der MuPiBox bleibt, was sie ist; was zusätzlich dazukommt, kommt als **Extension**:
eine einzige Datei, die man (wie eine Chrome-Erweiterung) aus einem Katalog installiert und wieder entfernt. Die erste
Extension ist die **USB-CD-Anbindung** (`cd`), die zweite die **Uhr in der Kopfleiste** (`clock`).

## Die Datei: `<id>-<version>.mpx`

Ein ZIP (wie die `.wsz`-Skins) mit festen Namen:

| Datei | Wohin | Was |
|---|---|---|
| `manifest.json` | alle | Name, Version, Rechte, Einstellungen, Systemschritte (siehe unten) |
| `player.js` | Player (`spotify-control`, Node, CommonJS) | `exports.activate(host)` – Wiedergabe, Geräte, Routen |
| `api.js` | API (`server`, Node, CommonJS) | `exports.activate(host)` – Routen unter `/api/ext/<id>/`, Dienste |
| `display.js` | Display (Chromium, ES-Modul) | `export function activate(api)` – Tabs, Knöpfe, Anzeigen |
| `icon.svg`, weitere Dateien | alle | werden unter `/ext/<id>/…` ausgeliefert (Skripte nur `display.js` und was es lädt; `player.js`/`api.js` nie) |
| `*.py` | vom API-Teil gestartet | Python-Programme (`hostApi` 6), die der API-Teil als Kindprozess startet, wenn Node nicht reicht (SPI zum Beispiel); nie ausgeliefert |

Die Webapp der Eltern führt **keinen Code** einer Extension aus (sie läuft mit der Anmeldung der Eltern): die Einstellungen
beschreibt die Extension im Manifest (`ui`), die Webapp zeichnet sie.

Jeder Teil ist **optional**; eine Extension bringt nur mit, was sie braucht. Entpackt wird nach
`/home/dietpi/.mupibox/data/extensions/<id>/`; welche Extensions an sind, steht in `…/extensions/state.json`
(`{ "cd": { "version": "1.0.0", "enabled": true } }`). Ein defekter Teil legt nur seine Extension still (Fehler im Log),
nie den Kern.

## `manifest.json`

```json
{
  "id": "cd",
  "name": "USB-CD-Laufwerk",
  "version": "1.0.0",
  "description": "Audio-CDs vom USB-Laufwerk abspielen, mit Titelnamen und Cover aus dem Internet.",
  "hostApi": 1,
  "player": "player.js",
  "api": "api.js",
  "display": "display.js",
  "icon": "icon.svg",
  "resources": {},
  "settings": {
    "cdLookup": { "type": "boolean", "default": true, "legacy": "mupibox.cdLookup" },
    "discogsToken": { "type": "secret", "pattern": "^[A-Za-z0-9]{0,80}$", "legacy": "discogs.token" }
  },
  "system": {
    "udev": [{ "name": "99-mpx-cd.rules", "file": "99-mpx-cd.rules" }],
    "groups": ["cdrom"]
  },
  "ui": {
    "title": "Audio-CD",
    "help": "Text über der Karte …",
    "items": [
      { "key": "cdLookup", "label": "Titel und Cover im Internet suchen" },
      { "key": "discogsToken", "label": "Discogs-Token", "dep": "cdLookup", "help": "…" }
    ]
  }
}
```

- `hostApi`: die Nummer der Schnittstelle, für die die Extension geschrieben ist. Der Kern lädt keine Extension mit einer
  höheren Nummer als seiner eigenen.
- `settings`: was die Extension speichert (Typen `boolean`, `string`, `number`, `secret`; optional `pattern`, `options`: die erlaubten Werte eines `string` oder `number`, und `min`/`max` für ein `number`). Der Kern prüft und
  speichert die Werte (`~/.mupibox/data/extensions/settings/<id>.json`); `secret`-Werte gibt er nie zurück, nur ob es einen gibt
  (`<key>Set`). `legacy`: ein Wert der Konfiguration (`mupibox.cdLookup`), der bei der Installation einmal übernommen wird.
- `ui`: die Karte der Extension auf der Seite „Erweiterungen“ der Webapp: Titel, Hilfetext und die Felder (je ein Eintrag aus
  `settings`; `dep` = ein Schalter, von dem das Feld abhängt; `choices`: `[{ value, label }]` für eine Einstellung mit `options`, sie
  erscheint als Auswahl und wird sofort gespeichert). `type: "lookup"` (mit `search: "/api/ext/<id>/<name>"`, nur für ein `string`): ein Suchfeld; die Route des API-Teils bekommt `?q=` und
  antwortet mit `[{ label, values }]`, ein Tipp auf einen Treffer speichert dessen `values` (Einstellungen der Extension).
  Secrets haben einen eigenen „Speichern“-Knopf. Hat die Extension einen
  Display-Teil, lädt das Display nach dem Speichern der Einstellungen neu.
- `system`: was bei der Installation als root eingerichtet wird. **Nur diese vier Arten, jede geprüft:**
  - `udev`: `{ name, file }` – die Regel-Datei aus dem Paket kommt als `99-mpx-<id>….rules` nach `/etc/udev/rules.d/`. Erlaubt
    sind nur Vergleiche (`KERNEL`, `SUBSYSTEM`, `ATTRS{…}` …) und die Zuweisungen `MODE`, `GROUP`, `OWNER`, `TAG`, `SYMLINK`;
    `RUN`, `PROGRAM`, `IMPORT` und `ENV{…}=` lehnt der Kern ab.
  - `units`: `{ name, file }` – systemd-Dienste und -Timer aus dem Paket (höchstens vier). Der Name beginnt mit `mpx-<id>` und endet auf
    `.service` oder `.timer`; die Datei (`units/…`) kommt nach `/etc/systemd/system/`. **Jede Unit muss auch in `resources.services` mit
    `"provides": true` stehen** (damit der Test sie kennt). Die Datei darf nur wenige einfache Schlüssel enthalten (`[Unit]`: Description,
    After, Before, Wants, Requires; `[Service]`: Type, ExecStart…, Restart, RestartSec, WorkingDirectory, Environment, Timeout…, StandardOutput/Error,
    SyslogIdentifier, Nice, KillMode; `[Timer]`: OnCalendar, OnBootSec …, Persistent; `[Install]`: `WantedBy=multi-user.target|timers.target`),
    Programme mit absolutem Pfad (`@EXT_DIR@` = der Ordner der Extension), ohne die Präfixe `+`/`!` und ohne Zeilenfortsetzung. `User`, `Group`,
    Capabilities und alles andere lehnt der Kern ab. Ein Dienst läuft **nicht** als root: der Kern legt ein Drop-in `10-mupibox.conf` mit
    `User=dietpi` und `NoNewPrivileges=yes` dazu. Nach der Installation werden die Units eingeschaltet und (neu) gestartet; beim Ausschalten der
    Extension gestoppt, beim Entfernen samt Dateien gelöscht (ebenso Units, die eine neue Version nicht mehr hat).
  - `groups`: der Benutzer `dietpi` kommt in diese Gruppen; erlaubt nur `cdrom`, `audio`, `video`, `plugdev`.
  - `packages`: Debian-Pakete (`apt-get install`), Namen nach `^[a-z0-9][a-z0-9+.-]{1,60}$`; die Webapp zeigt sie vor
    der Installation.
  Beim Entfernen nimmt der Kern genau das wieder weg, was er angelegt hat (Regel-Dateien und Units; Gruppen und Pakete bleiben, weil
  andere sie brauchen können).
- `resources` (**Pflicht**, `{}` heißt „braucht nichts“): was die Extension von der Box braucht. Sie sagt es **vorher**, die Box
  prüft es **vor** der Installation gegen das, was schon belegt ist.
  - `ports`: `[{ "port": 9000, "proto": "tcp", "purpose": "…" }]` – Ports, auf denen sie lauscht (ab 1024, `proto` tcp oder udp).
  - `gpio`: `[{ "pin": 17, "purpose": "…" }]` – GPIO-Pins (BCM-Nummer 2–27).
  - `services`: `[{ "name": "foo.service", "provides": true, "purpose": "…" }]` – systemd-Dienste (`.service`, `.socket`, `.timer`).
    `provides: true`: die Extension bringt den Dienst mit (z. B. über ein Paket), er darf noch nicht existieren; sonst (Standard)
    braucht sie ihn nur, er sollte da sein (fehlt er, ist es eine Warnung).

  **Der Test** (`app-api/extension-resources.ts`) vergleicht mit: dem Kern (seine Ports und die Pins der Konfiguration: Netzschalter/
  Shim, LED, Lüfter, Drehgeber und HAT, wenn eingeschaltet), der Boot-Konfiguration (`dtoverlay`/`dtparam`: Pins, I²C, SPI, Soundkarten),
  den anderen Extensions (auch ausgeschalteten), und – soweit die Box hineinsehen kann – dem, was jetzt läuft (`ss`: lauschende Ports,
  `gpioinfo`: belegte Pins, `systemctl`: vorhandene Dienste). Eine Kollision ist ein **Fehler**: die Webapp zeigt sie mit dem
  Verursacher an und installiert nichts (auch nicht beim Einschalten einer ausgeschalteten Extension). Ließ sich ein Teil nicht
  ansehen, steht eine **Warnung** da. Der Test läuft in der Webapp vor der Frage (`POST /api/app/extensions/check`) und
  noch einmal in der Installation selbst, mit dem Manifest des heruntergeladenen Pakets; das muss dasselbe sagen wie der Katalog.
  Bei einer neuen Version zählt, was die alte schon belegt, nicht als Kollision.

  Wichtig: Die Angabe wird gegen die Box **geprüft, nicht erzwungen** – eine Extension ist ein Programm des Benutzers `dietpi`
  (deshalb nur aus dem Katalog oder von Quellen, denen man vertraut).

## Katalog

`catalog.json` liegt im Repository (`extensions/catalog.json`, Adresse einstellbar: `mupibox.extensionCatalog`):

```json
[{ "id": "cd", "name": "USB-CD-Laufwerk", "version": "1.0.0", "description": "…", "hostApi": 1,
   "url": "https://raw.githubusercontent.com/<repo>/<branch>/extensions/dist/cd-1.0.0.mpx",
   "sha256": "…", "size": 12345, "system": { "udev": 1, "units": [], "groups": ["cdrom"], "packages": [] }, "resources": {} }]
```

Die Box lädt die Datei, prüft die Größe (höchstens 16 MB) und die SHA-256, prüft Dateinamen und Manifest, vergleicht es mit dem
Katalogeintrag (Id, Version, Systemschritte, `resources`) und testet die Ressourcen gegen die Box und installiert erst dann (Dateien, Regeln, Units, Gruppen, Pakete; danach starten
`server` und `spotify-control` neu, das Display lädt neu). Gebaut wird mit `node tools/mpx/pack.mjs <id>`:
das macht aus `extensions/<id>/` die `.mpx` in `extensions/dist/` und trägt Größe und Prüfsumme in den Katalog ein.

## Eigene Datei hochladen

Neben dem Katalog gibt es auf der Seite „Erweiterungen“ **„Datei hochladen“** für eine `.mpx` vom eigenen Rechner (höchstens 16 MB).
Die Box liest und prüft die Datei (`POST /api/app/extensions/upload`: Dateinamen, Manifest, Regeln – dieselben Prüfungen wie beim Katalog,
nur ohne Prüfsumme aus dem Katalog), installiert aber noch nichts: die App zeigt Name, Version, die Systemschritte und die SHA-256 und warnt,
dass eine Erweiterung ohne Schutz läuft. Erst nach dem „Installieren“ läuft die Installation (`POST …/install` mit dem Token der Prüfung,
zehn Minuten gültig).

## Installieren und entfernen

Webapp › Einstellungen › System › **Erweiterungen**: Karten wie auf der Erweiterungen-Seite eines Browsers (Suche, Details, Entfernen, Schalter an/aus);
was der Katalog bietet, steht mit „Installieren“ dahinter. Nur mit Anmeldung (Eltern). Nach einer Änderung starten Player, API und Display neu (eine Wiedergabe
bricht dabei ab; die Webapp sagt es vorher).

## Die Schnittstellen (`hostApi` 1 bis 13)

Die Nummer 13 (Fußball) bringt **Einstellungen je Benutzer**: `"perUser": true` an einer Einstellung im Manifest (nicht bei `secret` und `gpio`, die gehören zur Box). Jeder Benutzer der Box (Mehrere Benutzer, 5.1) hat dann seinen eigenen Wert, etwa seinen Lieblingsverein. Gespeichert wird er in derselben Datei `settings/<id>.json` unter `"@users": { "<Benutzer-ID>": { … } }`; was ein Benutzer nicht selbst gesetzt hat, ist der Wert der ganzen Box, sonst der Standard. `host.settings()` im API-Teil, `settings` im Player-Teil und die Einstellungen des Displays (`/api/ext/active`) sind immer die des aktiven Benutzers. Nach einem Benutzerwechsel ruft der Kern `host.onSettings(fn)` mit den Einstellungen des neuen Benutzers auf, und das Display lädt neu. `GET/POST /api/app/ext/<id>/settings?user=<id>` liest und speichert die Werte eines anderen Benutzers, ohne zu wechseln; die Webapp zeigt dafür über dem Formular die Auswahl „Einstellungen von …“ und markiert die Felder mit „je Benutzer“, sobald mehrere Benutzer eingeschaltet sind. Eine Suche (`lookup`) für einen gewählten Benutzer schickt dessen ID als `user=` mit; `host.settings(user)` liefert dann seine Werte (eine unbekannte ID: die des aktiven Benutzers). Ein neuer Benutzer beginnt mit den Werten der Box.

Die Nummer 9 (NFC-Extension 0.7) erlaubt in den udev-Regeln einer Erweiterung **`ENV{ID_INPUT…}` als Vergleich** (`==`, `!=`; zum Beispiel
`ENV{ID_INPUT_KEYBOARD}=="1"`: nur Tastaturen, keine Maus und kein Touch). Setzen lässt sich ein `ENV` weiter nicht (ein `ENV{SYSTEMD_WANTS}` startete
einen Dienst). Nach dem Einsetzen der Regeln stößt die Box auch I2C-Geräte an und, wenn eine Regel `SUBSYSTEM=="input"` hat, die USB-Tastaturen.

Die Nummer 8 (NFC-Extension 0.4) bringt im Manifest **`type: "list"`** in `ui.items`: eine Liste mit einem Bild je Eintrag (`label`, `list` = die Adresse einer Route
des API-Teils, `/api/ext/<id>/<name>`, mit Anmeldung; optional `empty` = der Text bei leerer Liste und `help`; ohne `key`, `choices`, `extra`, `state`, `post`, `dep`).
Die Route antwortet mit `{ items: [{ id, title, text, image, imageOwn, coverPost, actions }] }` (`text`: eine Liste kurzer Teile, die die Webapp übersetzt und mit „·“
verbindet; `image`: eine Adresse der Box oder `https://`; `coverPost`: eine Route, an die die Webapp `{ id, image }` schickt, wenn der Nutzer ein Bild gewählt hat
(Suche bei iTunes, Deezer, Spotify oder ein eigenes Bild, abgelegt bei den eigenen Bildern der Box); `imageOwn`: das Bild ist ein eigenes, die Webapp bietet „Cover des
Mediums nehmen“ an (`image: ""`); `actions`: bis zu vier Knöpfe `{ label, post, confirm }`, jeder schickt `{ id }` an seine Route). Es wird nichts in den Einstellungen gespeichert.

Die Nummer 7 (NFC-Extension 0.2 und 0.3) bringt zwei Dinge. Erstens **Unterseiten**: Ein Eintrag `{ "type": "heading", "label": "…", "page": true }` in `ui.items` beginnt eine eigene Seite unter der Seite der Erweiterung
(zwei bis sechs; der erste Eintrag der Liste muss die erste sein; nur mit `ui.place: "system"`, ohne `rename`, `optional` und `dep`). Die Seite der Erweiterung zeigt dann nur Titel und `ui.help` und führt zu den Unterseiten;
jede hat die Einträge bis zur nächsten Seitenüberschrift. `GET /api/app/extensions/pages` meldet sie als `pages` (`title`, `help`). Zweitens
im Manifest **`type: "action"`** in `ui.items`: ein Knopf (`label`, `post` = die Adresse einer Route des API-Teils,
`/api/ext/<id>/<name>`, mit Anmeldung; optional `confirm` = eine Frage, die vorher gestellt wird, und `help`, `dep`; ohne `key`, `choices`, `extra`, `state`).
Ein Tipp schickt ein POST an die Route; sie antwortet mit `{ ok, message }`, und die Webapp zeigt `message` (ein fester Satz, den sie übersetzt, wenn sie ihn kennt)
als Hinweis. Es wird nichts in den Einstellungen gespeichert: der Knopf ist für Aufträge („Zuordnung starten“, „Abbrechen“, „Vergessen“), nicht für Werte.

Die Nummer 6 (NFC-Extension) bringt zwei Dinge:

- **`type: "status"`** in `ui.items`: ein Block mit Zeilen, den die Extension selbst meldet (`label`, `state` = die Adresse einer Route ihres API-Teils,
  `/api/ext/<id>/<name>`, mit Anmeldung; ohne `key`, `dep`, `choices`). Die Route antwortet mit `{ rows: [{ label, value, tone }] }` (`tone`:
  `ok`, `warn` oder `error`, sonst keine Farbe, höchstens 12 Zeilen); die Webapp fragt sie alle zweieinhalb Sekunden, solange die Karte offen ist.
  `label` und `value` übersetzt die Webapp, wenn sie den Text genau kennt; also feste Sätze melden, keine zusammengesetzten.
  Eine Zeile kann einen **Knopf** haben (`button: { label, post, confirm }`, rechts neben dem Wert): `post` ist eine Route des API-Teils
  (`/api/ext/<id>/<name>`, nur Buchstaben), die die Webapp mit POST ruft, `confirm` eine Rückfrage vorher. Die Route antwortet wie ein `action`
  mit `{ ok, message }`; der Knopf kommt aus dem Zustand, kann also je nach Zustand wechseln (die NFC-Extension: „SPI einschalten“ / „SPI ausschalten“).
- Dateien **`*.py`** im Paket: Python-Programme, die der API-Teil als Kindprozess startet (wie die Taster `gpiomon`). Sie werden nie ausgeliefert.
  Debian-Pakete dafür (`python3-spidev`) kommen über `system.packages`; den Zugriff auf `/dev/spidev…` gibt eine udev-Regel (`GROUP`, `MODE`).
  Nach dem Einsetzen einer Regel für den SPI-Bus stößt der Kern `udevadm trigger --subsystem-match=spidev` an.

Die Nummer 5 (Taster) bringt im Manifest:

- den Einstellungstyp **`gpio`**: ein Pin, den der Benutzer wählt (`0` = keiner, sonst die BCM-Nummer 2–27; der Standardwert ist `0`, ohne
  `options`, `pattern`, `min`/`max`, `legacy`; höchstens 16 je Extension). Die Webapp zeigt eine Auswahl mit der Nummer am Pfostenstecker und
  sperrt, was schon belegt ist, mit dem Namen dessen, der den Pin hält (`GET /api/app/ext/<id>/gpio` → `{ pins: [{ pin, holders }], hints, blind }`;
  `hints` sind freie Pins, die ein ausgeschalteter Teil des Kerns bräuchte, die Pins des Drehreglers (Vorgabe 26/24/10, in seinen Einstellungen `rotary.pinA/pinB/pinButton` änderbar): wählbar, mit einem Hinweis in der Liste;
  der Kern, die Boot-Konfiguration, die anderen Extensions mit ihren `resources` und ihren gewählten Pins, und was `gpioinfo` als belegt meldet).
  Der Kern prüft beim Speichern noch einmal und antwortet mit 409 `gpio_taken` (`{ key, pin, holders }`) oder `gpio_twice` (derselbe Pin in zwei
  Feldern der Extension). Ein gewählter Pin zählt für alle anderen als belegt: im Ressourcentest anderer Extensions und in der Hardware-Seite des
  Kerns (Drehregler, LED, Lüfter lehnen einen Pin ab, den eine Extension hält).
- **`type: "heading"`** in `ui.items`: eine Zwischenüberschrift (`label`, optional `help` und `dep`; ohne `key`). Mit `hostApi` 5 sind bis zu
  80 Einträge erlaubt (vorher 20), und `dep` darf auch auf eine `gpio`-Einstellung zeigen (das Feld erscheint, sobald ein Pin gewählt ist).
  Ein Feld mit `choices` kann eine zweite Auswahl neben sich haben: **`extra`** = `{ key, label?, when, choices }` – `key` ist eine eigene
  Einstellung mit `options`, `choices` nennt jede davon, und die Auswahl (eine Liste rechts neben dem Feld) steht nur da, solange das Feld
  einen der Werte aus `when` hat (bei den Tastern: der Lautstärke-Schritt neben „Lauter“ und „Leiser“).
  Zwei Angaben, die keine neuere Box brauchen (eine Box, die sie nicht kennt, zeigt gewöhnliche Knöpfe und den Hilfetext unter dem Feld):
  **`image`** an einem Eintrag von `choices` – ein Bild der Erweiterung (`.png`, `.jpg` oder `.svg`, ein Pfad wie `images/mode-full.png`, kein
  `..`), das über dem Knopf steht (die OLED-Erweiterung zeigt so die Anzeige in jeder Betriebsart); und **`tip: true`** an einem Feld mit
  `help` – der Hilfetext steht dann nicht unter dem Feld, sondern als Tooltip an einem „i“ neben der Beschriftung (Schalter).
  Eine Überschrift mit `card: true` und **`core`** (`"brightness"` oder `"evening"`) lässt die Webapp die Karte im Aussehen der Box zeichnen
  – Regler mit dem Wert in einer Kapsel, „Abends dunkler“ mit Sonnenuntergang, Ort und Abdunkeln – statt der Felder der Gruppe, die dann nicht
  gezeichnet werden (eine Box, die `core` nicht kennt, zeigt sie wie gewohnt). `brightness` braucht die Einstellungen `contrast` und `sleepAfter`
  (Zahlen), `evening` die Einstellungen `nightDim` (Schalter) und `nightContrast` (Zahl). Das Zeitfenster des Abends (Sonnenuntergang oder
  Uhrzeiten, Abdunkeln, Ruhezeiten) ist das des Displays und wird hier wie dort eingestellt.
  Eine Überschrift und die Felder bis zur nächsten sind eine Gruppe. Mit **`rename`** (eine `string`-Einstellung) gibt der Benutzer der Gruppe
  einen Namen: die Überschrift ist dann ein Textfeld, `label` steht als Platzhalter darin. Mit **`optional`** (eine `boolean`-Einstellung) ist
  die Gruppe erst da, wenn man sie hinzufügt: aufeinanderfolgende Gruppen mit demselben `label` sind eine Reihe, unter der rechts ein
  „+ label“ steht, und jede hinzugefügte hat einen Knopf zum Entfernen (setzt den Schalter zurück, die Pins der Gruppe auf `0` und den Namen
  auf leer). Eine Gruppe mit gewähltem Pin wird immer gezeigt.
  Mit **`card: true`** (nur auf einer Überschrift, die keine Seite ist) steht die Gruppe in einer eigenen Karte; hat eine Seite solche
  Überschriften, steht ihr Text (Titel und `help` der Seite) in einer Karte für sich, jede Gruppe in ihrer, und das „+“ einer Reihe
  zwischen den Karten. Eine Karte einer Gruppe, die es noch nicht gibt, ist versteckt. Alle Felder der Seite müssen unter einer solchen
  Überschrift stehen.
- **`ui.place: "system"`**: die Einstellungen sind eine eigene Seite unter Einstellungen › System › „Die Box“ (statt nur der Karte auf der Seite
  „Erweiterungen“; `GET /api/app/extensions/pages` nennt der Webapp die Seiten der eingeschalteten Extensions; `ui.heading` ist, was dort über
  der Karte der Einstellungen steht, wenn es nicht der Titel sein soll). Dazu **`ui.adopt`**: Seiten des
  Kerns, die auf dieser Seite mit erscheinen und an ihrem alten Ort verschwinden, solange die Extension eingeschaltet ist. Erlaubt ist bisher nur
  `"rotary"` („Drehregler und Taster“, sonst unter Einstellungen › Audio).
- im API-Teil `host.apiUrl` und `host.onSettings(fn)` (unten).

Die Nummer 2 (Wetter) bringt zum Display `api.overlay`, `api.fetchApi` und im Manifest `lookup`, `options`, `min`/`max`. Ein Paket mit `hostApi: 1` läuft unverändert. Die Nummer 3 (Wetter 1.5) bringt im Manifest `type: "order"`: eine Liste, die man in der Webapp per Drag and Drop sortiert (`choices` = Namen und Beschriftungen, die Einstellung ist ein `string` mit den Namen, durch Komma getrennt; der Standardwert nennt jeden Eintrag einmal). Die Nummer 4 (Benutzer) bringt im Manifest `type: "roster"`: eine Liste, die die Extension selbst führt (Benutzer, zum Beispiel), mit den vier Adressen `list`, `add`, `remove` und `select` und einer fünften, `color`, wenn die Einträge eine Farbe haben, die man in der Webapp ändern kann (`{ id, color }`; die Liste nennt dazu `colors`; Routen mit Anmeldung unter `/api/ext/<id>/…`; ohne Einstellung, ohne `key`), und im API-Teil `host.updateConfig`, `host.paths` und `host.restartServices` (unten).

### Player: `activate(host)`

- `host.id`, `host.dir`, `host.dataDir` (ein Ordner der Extension, der bei Updates bleibt), `host.version`, `host.log.debug/info/warn(text)`
- `host.settings.get(key, fallback)`, `host.settings.set(key, value)` – die Einstellungen der Extension (siehe `settings`)
- `host.config()` – die Konfiguration der Box (ohne Geheimnisse), gelesen
- `host.route(method, subpath, handler)` – Express-Route unter `/ext/<id>/<subpath>` des Players
- `host.on(event, fn)` – Ereignisse: `stop`, `finished` (Liste zu Ende), `track` (Titel gewechselt), `config` (Konfiguration geändert)
- `host.engine` – der Wiedergabeteil (mpv): `command([…])` (fragt mpv, wartet auf die Antwort), `playEntries([{ file, options }])`
  (die Liste ersetzen, der erste spielt), `setVolume(percent)`, `trackIndex()`
- `host.playback.stop()`, `host.playback.generation()` – die Wiedergabe anhalten; zählt bei jedem Start und Stopp hoch („ist es noch die, die ich meine?“)
- `host.meta()` – was der Player über die laufende Wiedergabe sagt (`currentMeta`); `host.setMeta({ … })` setzt erlaubte Felder
  (`album`, `path`, `totalTracks`, `currentTracknr`, `currentTrackname`)
- `host.albums.register(provider)` – eine **Quelle für Alben**, die keine Ordner sind. Ein `provider` hat
  `{ folder, play(), tracklist(), trackName(nr), progress(seconds, index), seek(percent, index), onStop(), onFinished() }`.
  `folder` ist der Name des „Ordners“, den das Display als `libraryPath` kennt (bei der CD `_audio_cd_`). Alles andere
  (Titelliste, Weiter/Zurück, Sprung, Mischen, Wiederholen, die Anzeige im Winamp) macht der Kern wie für jedes lokale Album.

### API: `activate(host)`

- `host.id`, `host.dir`, `host.dataDir`, `host.log`, `host.config()`, `host.settings()` (die Einstellungen als Objekt, mit Secrets – nur
  für den Code der Extension)
- `host.route('get' | 'post', '/sub', handler, { session: true })` – Route unter `/api/ext/<id>/sub`; ohne `session` für das Netz
  der Box, mit `session` nur mit der Anmeldung der Eltern (POST dann mit CSRF-Token). Fehler im Handler werden gefangen (500).
- `host.playerUrl` – die Adresse des Players
- `host.updateConfig(mutate)` (`hostApi` 4) – ändert die Konfiguration der Box (`mupiboxconfig.json`) unter ihrer Sperre: `mutate(cfg)` ändert das Objekt, das Ergebnis wird gespeichert. Gehört zu den Dingen, die nur eine Extension tun darf, der man vertraut.
- `host.paths` (`hostApi` 4) – `{ library, data, extensions }`: wo die Box ihre Bibliothek, ihre Daten und die Extensions hält
- `host.restartServices()` (`hostApi` 4) – startet Player und Server neu und lädt danach das Display; der API-Teil läuft im Server, also ist das das Letzte, was er tut
- `host.lockLibrary()` (`hostApi` 4) – nimmt die Sperren der Bibliothek (`data.json` und die Fortsetzen-Liste), wartet bis etwa 10 s und gibt eine Funktion zurück, die sie wieder freigibt (`null`: nicht zu bekommen). Solange sie gehalten werden, schreiben die App und der Smart Sync nicht in die Bibliothek. Wer danach `host.restartServices()` aufruft, behält sie: Sie enden mit dem Prozess des Servers.
- `host.apiUrl` (`hostApi` 5) – die Adresse des Servers selbst (für Routen des Kerns, etwa `/api/audio-output`)
- `host.nightDim()` (`hostApi` 10) – wie weit die Box im Abend von „Abends dunkler“ ist: `{ share, dimmed }`, `share` von 0 (normal hell) über das sanfte Abdunkeln bis 1 (so dunkel wie am Abend). Fenster (feste Zeiten oder Sonnenuntergang bis Sonnenaufgang am Ort der Box), Abdunkeln und Ruhezeiten kommen aus den Einstellungen der Box; ob die Extension abdunkelt, entscheidet ihr eigener Schalter, nicht der des Displays. Für ein eigenes Licht, etwa das OLED-Display (`contrast` = Helligkeit + (Abendhelligkeit − Helligkeit) · `share`)
- `host.say(text)` (`hostApi` 12) – die Box sagt `text` mit ihrer Stimme (Sprachausgabe: Piper oder Google, wie der Benutzer sie eingestellt hat; stumm, wenn die Stimme aus ist). Ohne Gong, und Musik, die gerade läuft, wird währenddessen leiser (sie wird nicht angehalten). Der Text wird bei 300 Zeichen gekürzt; Antwort: ein Promise mit `true`, wenn gesprochen wurde. Die Sprache der Box steht in `host.config().mupibox.ttsLanguage`. Die NFC-Extension sagt damit ihre „Sprachausgabe“-Nachrichten.
- `host.rest()` (`hostApi` 13) – ob die Box gerade ruht: `{ quiet, blocked }` (`quiet`: ein Fenster der Ruhezeit, `blocked`: die Wiedergabe ist gesperrt – Spielzeit aufgebraucht, Ruhezeit, Pause der Eltern). Eine Extension sagt dann nichts an und zeigt weniger (die Fußball-Erweiterung: keine Tor-Ansage, kein Ergebnis in der Kopfzeile).
- `host.onSettings(fn)` (`hostApi` 5) – `fn(settings)` wird aufgerufen, nachdem die Einstellungen der Extension gespeichert wurden; so stellt
  sich ein API-Teil um, ohne dass der Server neu startet (der Kern wartet höchstens drei Sekunden auf die Antwort)

Dazu liefert der Kern selbst: `GET /api/app/extensions` (Katalog und Installiertes), `POST /api/app/extensions/install|remove|enable`,
`GET/POST /api/app/ext/<id>/settings`, `GET /api/app/ext/<id>/info` (eine installierte Extension, wie in der Liste), `GET /api/app/ext/<id>/gpio`,
`GET /api/app/extensions/pages`, die Dateien der Extension unter `/ext/<id>/…` und `GET /api/ext/active` (die Liste für das Display).

### Display: `activate(api)` (ein ES-Modul, kein Angular nötig)

- `api.id`, `api.url(file)` (Adresse einer Datei der Extension), `api.apiUrl`, `api.fetch('/ext/<id>/…')` (GET beim Player, JSON oder `null`)
- `api.every(ms, fn)` – ruft `fn` regelmäßig auf; Fehler werden gefangen
- `api.settings()` – die Einstellungen der Extension (ohne Geheimnisse)
- `api.tabs.set({ id, src, visible, onSelect })` / `api.tabs.remove(id)` – ein Reiter nach den Kategorien (`src`: SVG der Extension)
- `api.header.add({ mount(host) })` – etwas in die Kopfzeile, rechts neben der Akkuanzeige. Die Statusanzeige gibt es auf mehreren
  Seiten (Startseite, Sperrbildschirm …): `mount` wird für jeden Platz mit einem leeren Element aufgerufen und gibt zurück, was den
  Platz wieder aufräumt (Zeitgeber, Beobachter). Farben erbt das Element (`currentColor`).
- `api.fetchApi('/…')` – GET auf den eigenen API-Teil (`/api/ext/<id>/…`), JSON oder `null`
- `api.overlay.open({ title, mount(content), flush })` / `api.overlay.close()` – eine Vollbild-Seite über dem Display mit Zurück-Pfeil
  oben links; `mount` füllt den Inhalt und gibt zurück, was beim Schließen aufräumt. Mit `flush: true` reicht der Inhalt bis zum
  oberen Rand und der Pfeil schwebt darüber (für Seiten, die jeden Pixel Höhe brauchen). Immer nur eine Seite.
- `api.winamp.onEject(fn)` – der Auswurf-Knopf im Winamp-Fenster: gibt `fn()` `true` zurück, ist er erledigt, sonst öffnet er die Bibliothek
- `api.player.open(media)` – öffnet den Player mit diesem Album; `api.player.noResumeFolder(folder)` hält Alben dieses Ordners aus „Fortsetzen“ heraus

## Was der Kern selbst tut

Der Kern bleibt ohne Extensions vollständig; ein Fehler in einer Extension (Ausnahme beim Laden, bei einem Ereignis, in einer Route)
wird gefangen, ins Log geschrieben und schaltet diese Extension in der Sitzung ab. Die Wiedergabe läuft weiter.
Extensions laufen als Programme des Benutzers `dietpi`, **ohne Schutzumgebung**: wer eine installiert, vertraut ihr. Deshalb
kommen sie nur aus dem Katalog, dessen Einträge Prüfsumme und Systemschritte angeben, und die Webapp zeigt vorher, was sie einrichten.

## Reihenfolge der Umsetzung

Fertig: Player (`src/backend-player/src/extensions.js`: Laden, `albums`-Quelle, Ereignisse), API (`app-api/extensions.ts`: Laden,
Einstellungen, Dateien, Installieren/Entfernen, Katalog), Display (`extension-host.service.ts`: Reiter, Auswurf, Player), Webapp (Seite
„Erweiterungen“), `tools/mpx/pack.mjs`, die CD-Anbindung als erste Extension (`extensions/cd/`). Die Uhr in der Kopfzeile ist die zweite
Extension (`extensions/clock/`, `api.header` im Display); sie ist nicht mehr im Kern. Die dritte ist das Wetter (`extensions/weather/`,
`hostApi` 2: `api.overlay`, `api.fetchApi`, `lookup`): Open-Meteo oder MET Norway, die Anzeigen sind die SteelSeries-Messuhren
(BSD-2, im Paket mitgeliefert). Die vierte sind die Benutzer (`extensions/users/`, `hostApi` 4): jeder Benutzer hat seine Einstellungen und seine Bibliothek, gewechselt wird am Display (rundes Zeichen in der Kopfzeile) oder in der Webapp; der Spotify-Login, WLAN, NAS und die Hardware sind für alle gleich. Beim Wechsel sichert die Extension den Stand des bisherigen Benutzers in ihrem Ordner, lädt den des neuen, und die Box startet neu.

Die sechste ist die NFC-Extension (`extensions/nfc/`, `hostApi` 6): ein Leser mit dem Chip PN5180 am SPI-Anschluss. Der Treiber (`pn5180.py`, Python mit `python3-spidev` und `python3-lgpio`) spricht den Chip an, wie sein Datenblatt es für die Verbindung vorsieht (BUSY-Handshake, Register, `SEND_DATA`/`READ_DATA`), sucht ISO-14443-A-Tags (Anticollision über die drei Cascade-Stufen, bis zu 10 Byte UID) und ISO-15693-Tags (Inventory) und meldet je eine JSON-Zeile (`ready`, `tag`, `gone`, `error`). Der API-Teil (`api.js`, `runner.js`) startet ihn mit den gewählten Pins (BUSY und RST: Einstellungen vom Typ `gpio`), startet ihn nach einem Ende neu (3 s, dann langsamer bis 60 s) und meldet den Zustand mit einem `status`-Block. Getestet ist alles ohne Hardware: ein Modell des Chips beantwortet die Rahmen des Treibers (`python -m unittest discover -s extensions/nfc/test`, `node --test extensions/nfc/test/nfc.test.js`). Was ein Tag auslösen soll (ein Album starten), ist der nächste Schritt; der API-Teil hat dafür die Stelle (`onEvent`, Berichte `tag` und `gone`).

Die NFC-Extension (Version 0.5, `hostApi` 8) ordnet Tags Medien zu, nach dem Vorbild von TeddyCloud (`content/<uid>.json` je Tag, „der nächste unbekannte Tag bekommt die gewählte Datei“, „Flex-Tonie“). Zugeordnet wird dort, wo man das Medium findet: Die Webapp zeigt in den Fenstern eines NAS- oder SD-Karten-Albums und eines Eintrags der Bibliothek (Spotify, Radio, Podcast, TIDAL) den Knopf „NFC-Tag“ (er öffnet die Tags des Mediums, `POST /api/ext/nfc/tagsfor` mit `{ media }` antwortet wie `GET /tags` nur mit den Tags dieses Mediums, erkannt an Art und Adresse; darin „NFC-Tag hinzufügen“ bzw. „Weiteren NFC-Tag hinzufügen“) und schickt `POST /api/ext/nfc/arm` mit `{ media, image?, cover?, flex? }` (`image`: das gewählte Bild, `cover`: das Bild, das die Webapp für das Medium zeigt – ein Podcast oder ein Spotify-Eintrag hat keins in seinen Daten) (das Medium so, wie die Box es der Anzeige gibt; die Erweiterung behält nur, was zum Starten nötig ist). Das Fenster fragt jede Sekunde `GET /api/ext/nfc/armstate?id=` (`waiting`, `done` mit `uid`, `title`, `previous`, oder `gone`); beim Schließen schickt es `POST /cancel`. Der nächste Tag, der aufgelegt wird, bekommt das Medium (ein vorhandenes wird ersetzt); mit `flex` wird er zum Flex-Tag, und hat die Box schon einen, bekommt der es sofort. `tags.js` hält die Zuordnung ohne Dateien und Zeitgeber (Tag → Medium, Bild; Zustand `unknown`, `play`, `assigned`, `flex`), `api.js` verbindet sie mit dem Leser und speichert `tags.json` im `dataDir`. Die Unterseite „Zugeordnete Tags“ ist ein `list`-Eintrag (`GET /tags`, `POST /tagimage`, `POST /tagremove`); das Bild eines Tags ist `image` des Tags, sonst sein `cover`, sonst `cover` seines Mediums. Ein Podcast ist ein Feed, der Player spielt eine Folge: `api.js` fragt dafür `/api/rssfeed/cached` und gibt dem Display die Folge (`tags.pickEpisode`: begonnen, sonst neueste ungehörte, sonst neueste). Gestartet wird nicht vom Server aus: `display.js` fragt jede Sekunde `GET /api/ext/nfc/pending` (die Antwort gibt es einmal) und ruft `api.player.open(media)` auf, damit Kachel-Zeiten, Spielzeit und „Fortsetzen“ wie bei einem Tipp auf die Kachel gelten. Beim Abnehmen schickt der API-Teil `pause` oder `stop` an den Player und setzt bei demselben Tag mit `play` fort. Getestet ohne Leser: `node --test extensions/nfc/test/nfc.test.js extensions/nfc/test/tags.test.js`.

Die NFC-Extension 0.7 (`hostApi` 9): Beim Abnehmen pausiert sie nur, solange spielt, was der Tag gestartet hat. Dafür merkt sie beim Übergeben an das Display (`GET /pending`) die Herkunft der Wiedergabe (`origin` aus `GET /local` des Players: die Nummer des Starts, die eine nächste Podcast-Folge mit `src=skip` behält) und nimmt die erste neue danach (bis 10 s). Ein Podcast-Tag wählt die Folge unter denen, die die Kachel zeigt (`tags.tileOrder`: `episodePick`, `aPartOfAll`, `sorting` wie das Display und `episode-neighbour.ts` des Servers). Eine Zuordnung gilt nur, solange die App `/armstate` fragt (15 s). Speichern startet den Treiber nur neu, wenn sich Leser oder Pins ändern oder er im Fehler steht; Fehler, die ein Neustart nicht behebt (`no_python`, `no_spi`, `no_i2c`, `no_serial`, `gpio`, `several_devices`), versucht er alle 10 min und nennt sie einmal im Log.

Die NFC-Extension 0.6 kennt vier Leser; die Seite zeigt nur die Felder des gewählten (ein Eintrag in `ui.items` mit **`showIf: { key, is: [...] }`** wird angezeigt, solange die Einstellung `key` – eine Einstellung mit `options` – einen der Werte aus `is` hat; ein Kern, der `showIf` nicht kennt, zeigt das Feld immer, `hostApi` bleibt 8). Jeder hat sein Programm (`logic.js`: `driverScript`, `driverArgs`) und meldet dieselben JSON-Zeilen (`starting`, `ready`, `tag`, `gone`, `error`), die der Läufer (`runner.js`) liest: `pn5180.py`, `rc522.py` (MFRC522 über SPI: Wake-up, Anticollision und Select je Cascade-Stufe, dann Halt; das CRC_A rechnet das Programm selbst; RST freiwillig), `pn532.py` (die Rahmen des Chips, dahinter drei Wege: I2C über `/dev/i2c-1`, SPI mit umgedrehten Bits, die serielle Schnittstelle mit `termios`; nur Python, keine Pakete) und `usbreader.py` (liest `/dev/input/event*` des USB-Geräts, das die Kartennummer tippt, und nimmt es mit `EVIOCGRAB` für sich; den Namen holt es sich aus den Texten des USB-Geräts in `/sys`, sonst von `systemd-hwdb query usb:vXXXXpYYYY` – so wird aus „HID 0581:011c“ der „Tera 5100 dongle“ –, und der Name im Namensfeld darf ein Teil davon, der Hersteller oder die Kennung sein; die Ziffern bis Enter sind die `uid`, Art `HID`). RC522, PN532 und USB-Leser kennen nur ISO 14443 A (kein ISO 15693); der USB-Leser meldet nie `gone`, `api.js` ruft dafür `onGone` nicht auf. Die Udev-Regeln (`99-mpx-nfc.rules`) geben der Gruppe `gpio` den SPI-Bus, den I2C-Bus und die USB-Eingabegeräte (`SUBSYSTEMS=="usb"`; `ENV` ist in Regeln einer Erweiterung nicht erlaubt). Getestet ohne Hardware: `python -m unittest discover -s extensions/nfc/test -p "test_*.py"` (Modelle des Chips und eines Tags) und `node --test extensions/nfc/test/nfc.test.js`.

Die NFC-Extension 0.7 lässt bis zu **drei Leser gleichzeitig** laufen. Die Einstellungen des ersten Lesers behalten ihre Namen (`reader`, `spiDevice`, `busyPin`, …), die des zweiten und dritten tragen die Nummer dahinter (`reader2`, `spiDevice2`, …, `reader3`, …); eine Box von vorher ist also unverändert. Die Seite hat dafür drei Gruppen mit der Überschrift „Leser“ (die späteren mit `optional`: die Schalter `reader2On` und `reader3On`; die Seite zeigt zuerst nur den ersten Leser und fügt die anderen mit dem „+“ der Gruppenreihe hinzu), jede mit einem `status`-Block (`/stateone`, `/statetwo`, `/statethree`; Routennamen haben nur Buchstaben). Unter einer solchen Überschrift darf keine weitere stehen, sie beendete die Gruppe; die Texte der Unterüberschriften stehen deshalb an den Feldern. `logic.js` liest sie mit `readConfigs(settings)` (`readConfig(settings, slot)` je Leser; der zweite und dritte zählen nur, wenn die Seite sie hat – Schalter an oder einer ihrer Pins gewählt): Ein Leser, der haben will, was ein früherer schon hält (dasselbe SPI-Gerät, den I2C-Bus, dieselbe serielle Schnittstelle, denselben USB-Leser – ein USB-Leser ohne Namen ist „irgendeiner“), bekommt das Problem `conflict` und startet nicht. `api.js` führt eine Liste `readers` mit `config`, `view`, `runner` und dem Tag im Feld je Leser; jeder Leser hat sein eigenes Programm und seinen eigenen Läufer (Neustart und Pausen je Leser), die Zuordnung der Tags und der Spielstand sind gemeinsam. Der Status zeigt bei mehreren Lesern je Leser eigene Zeilen (`statusRowsAll`), `GET /state` antwortet zusätzlich mit `readers`. Ein Tag eines USB-Lesers hat die Art `HID` in `tags.json` (seine Nummer steht ohne Doppelpunkte in der Liste). Die USB-Leser sind die Typen `hid` und `hid2` („USB Reader 1“ und „USB Reader 2“): `usbreader.py --index 1` oder `--index 2` nimmt das erste oder zweite Gerät, das tippt, in der Reihenfolge der Anschlüsse (ihr Pfad in `/sys`; `--list` sagt die Geräte als eine JSON-Zeile). Die Auswahl des Typs folgt dem, was steckt: Ein Eintrag mit **`live`** (eine Route der Erweiterung, `GET /usbstate`, antwortet `{ options: { <wert>: { label?, disabled? } } }`; die Webapp fragt alle vier Sekunden, solange das Feld auf der Seite ist) bekommt den Namen des Geräts und ist grau, solange keines da ist, außer er ist gerade gewählt. Der Kern prüft nur, dass `live` eine Route der Erweiterung ist und zu einem Feld mit `choices` gehört; ein Kern, der es nicht kennt, zeigt die Auswahl, wie sie im Manifest steht. Das Manifest hat dafür 28 Einstellungen (acht je Leser und die beiden Schalter), sechs davon vom Typ `gpio` (BUSY und RST je Leser); `showIf` bezieht sich je Leser auf `reader`, `reader2`, `reader3`.

Ein Feld mit **`hideIf: { key, is: [...] }`** (ab NFC-Extension 0.9.2) wird versteckt, solange das Feld `key` – eine Einstellung mit `options` – angezeigt wird und einen der Werte aus `is` hat (ein Feld, das selbst versteckt ist, zählt nicht); zusammen mit `showIf` lassen sich so Bedingungen wie „nur beim PN532 am SPI-Anschluss“ ausdrücken: Der SPI-Pin (NSS) wird bei einem PN532 an I2C oder seriell nicht gefragt. Ein Kern, der `hideIf` nicht kennt, zeigt das Feld immer, `hostApi` bleibt 9.

Die Nummer 10 (OLED-Display-Extension 0.1.3) bringt im Manifest **`slider: true`** für ein Feld einer Zahl mit `min` und `max`: ein Regler, dessen Wert man auch in das Feld daneben eintippen kann (der Wert wird gespeichert, sobald man den Regler loslässt oder das Feld verlässt – wie bei einem Schalter), und im API-Teil `host.nightDim()` (oben).

Dieselbe Nummer 10 kennt bei einem Knopf (`type: "action"`) statt `post` auch **`download`** und **`upload`** (NFC-Extension 0.10.0; genau eines der drei, jeweils die Adresse einer Route der Erweiterung, `/api/ext/<id>/<name>`). **`download`** (mit **`file`**, dem Anfang des Dateinamens aus Kleinbuchstaben, Ziffern und `-`, höchstens 40 Zeichen) holt die JSON-Antwort der Route per GET und speichert sie als `<file>-JJJJ-MM-TT.json` auf dem Gerät, auf dem die Webapp läuft. **`upload`** lässt den Benutzer eine `.json`-Datei wählen (höchstens 900 kB) und schickt deren Inhalt als `{ file: <JSON> }` per POST an die Route; sie antwortet wie ein Knopf mit `{ ok, message }`, und eine Liste auf derselben Seite zeichnet sich danach neu. Dafür nimmt der Kern JSON-Bodies bis 1 MB an (vorher 100 kB). Die NFC-Extension nutzt das für „Tags exportieren“ (`GET /tagexport`) und „Tags importieren“ (`POST /tagimport`). Außerdem schreibt sie die Zuordnung bei jeder Änderung in `tag-assignments.json` (im Datenordner, mit `.bak` und Tageskopien in `backup/` für 7 Tage); die Datei ist im Backup der Box (`/api/app/backup`) und wird beim Zurückspielen wiederhergestellt, beim nächsten Start der Erweiterung übernommen, wenn sie von `tags.json` abweicht.

Die Nummer 11 (NFC-Extension 0.11.0) bringt für Knöpfe (`type: "action"`) drei Schlüssel: **`ext`** bei einem `download` (zum Beispiel `"csv"`: die Route antwortet `{ text }` statt der JSON-Datei, und die Webapp speichert den Text als `<file>-JJJJ-MM-TT.<ext>`), **`accept`** bei einem `upload` (Dateiendungen wie `".csv,.json"`; eine Datei, die nicht auf `.json` endet, geht als `{ text }` an die Route, sonst wie bisher als `{ file }`) und **`beside: true`**: der Knopf steht neben dem davor (zwei Knöpfe in einer Reihe; davor muss ein Knopf stehen). Die NFC-Extension exportiert die Tags als Tabelle (`GET /tagexportcsv`: Semikolon, UTF-8 mit Byte-Order-Mark, Zellen, die mit `= + - @` beginnen, bekommen ein Hochkomma davor) und nimmt Tabellen und JSON an (`POST /tagimport` mit `{ text }` oder `{ file }`).

**Die Prüfung beim Start** (ohne eigene Nummer; `app-api/extension-health.ts`, `checkInstalledExtensions` in `extensions.ts`). Ein Update der Box lässt `~/.mupibox/data/extensions/` unberührt, aber die Box ist eine andere. Bei jedem Start des Servers werden die eingeschalteten Erweiterungen geprüft: Manifest da und von `checkManifest` angenommen, `hostApi` nicht höher als `HOST_API`, die genannten Dateien da, die deklarierten Ressourcen (GPIO, Ports, Dienste) nicht vom Kern oder einer anderen eingeschalteten Erweiterung belegt (nur die Deklarationen, ohne Blick auf die laufende Box; bei zwei Erweiterungen gibt die zuletzt installierte nach), der API-Teil lässt sich laden (`activate()` wirft nicht) und die Erweiterung hat den Server nicht dreimal in zehn Minuten beendet (ein unbehandelter Fehler, dessen Stack durch ihre Dateien läuft, wird in `extensions/crashes.json` notiert). Besteht sie nicht, wird sie ausgeschaltet (`enabled: false`, ihre systemd-Dienste ebenfalls) und in `state.json` steht `problem: { code, message, detail?, at }` (`code`: `manifest_missing`, `newer_box`, `manifest_invalid`, `files_missing`, `conflict`, `api_failed`, `crashing`; `message` ist einer von festen deutschen Sätzen, die die Webapp übersetzt; `detail` die technische Zeile auf Englisch). `GET /api/app/extensions` liefert `problem` für jede Erweiterung (eine, deren Manifest die Box gar nicht lesen kann, mit `broken: true`), `GET /api/app/extensions/problems` die ausgeschalteten mit Grund (für den Hinweis beim Öffnen der App). `POST /extensions/resolve` (`{ id, action: 'move' | 'remove' }`) löst einen Konflikt, der nur aus Pins der Einstellungen (Typ `gpio`) besteht, in einem Schritt: `move` gibt jeder Einstellung mit belegtem Pin den niedrigsten freien Pin (ab GPIO 4, ohne 14 und 15; belegt ist, was `GET /ext/<id>/gpio` meldet), `remove` setzt sie auf 0, dann wird die Erweiterung eingeschaltet (Antwort `{ ok, changes: [{ key, label, from, to }] }`; `409 { error: 'not_resolvable' }` bei Ports, Diensten oder Pins aus dem Manifest, `409 { error: 'no_free_pin' }`). Die App fragt danach, wenn `POST /extensions/enable` mit `409 { error: 'conflict' }` antwortet und alle Fehler `kind: 'gpio'` sind. `POST /extensions/enable` mit `enabled: true` prüft die Dateien noch einmal (`409 { error: 'problem', problem }`) und löscht `problem` und die notierten Abstürze; eine neue Installation ebenfalls.

Die Nummer 9 trägt auch die **OLED-Display-Extension** (`hostApi` 7 genügt ihr: `status` mit Knopf, `action`, `host.updateConfig`): ein Python-Programm (`oled.py`) schreibt über `/dev/i2c-1` auf einen SSD1306, SH1106 oder SSD1309 (nur Standardbibliothek und `python3-pil`, kein `luma.oled`, kein `RPi.GPIO`, Pi 4 und Pi 5). Der API-Teil startet es als Kindprozess (`driver.js`), liest alle 0,5 s `GET <player>/local` (bei laufendem Spotify höchstens alle 20 s `/state`; nur `/local` alle 1,5 s, solange das Display aus ist, und nichts, solange es nicht bereit ist), `GET /api/audio-output` und `/tmp/mupihat.json` und schickt ihm Zeilen JSON auf stdin (`{"cmd":"state","state":{…}}`, `contrast`, `quit`); es antwortet mit `ready` und `error` (`no_i2c`, `i2c_access`, `no_display`, `no_pil`). Die Einstellung `headless` stellt den Start der Box ohne DSI-Display ein: `host.updateConfig` setzt `mupibox.headless`, `sudo dietpi-autostart 0` (zurück: der gemerkte Wert, sonst `11`) nimmt den Kiosk weg; `wait_display_ready.sh`, `restart_kiosk.sh` und `mupi_start_led.sh` lesen das Flag, und die NFC-Extension (ab 0.9.3) startet das Medium eines Tags dann selbst über den Player, statt auf das Display zu warten (`GET /pending`).

Die fünfte sind die Taster (`extensions/buttons/`, „Buttons & GPIO Input“, `hostApi` 5, nur ein API-Teil): bis zu sechs einzelne Taster und zwei
Tasterpaare an frei wählbaren GPIO-Pins (gegen Masse, der interne Pull-up ist eingeschaltet). Am Anfang steht nur ein Taster da, weitere und die
Paare kommen mit „+“ dazu, und jeder kann einen eigenen Namen bekommen. Ein Taster hat eine Aktion für kurzes Drücken
(beim Loslassen) und wahlweise eine zweite für langes Drücken (sobald die Haltezeit erreicht ist: „Dual Action“). Ein Paar aus zwei Tastern a und b
hat sechs: kurz und lang, je für a, b und beide zusammen; mit „Wiederholen“ wiederholt sich die lange Aktion eines einzelnen Tasters, solange er
gehalten wird (nie die für beide). Die Aktionen: Play/Pause, weiter, zurück, von vorn (`replay`, neu im Player), lauter/leiser in wählbaren
Schritten, 30 s vor/zurück, Mischen, Ausgabegerät wechseln, Stopp, Ausschalten. Gelesen wird mit `gpiomon` (libgpiod 1 und 2), entprellt mit 25 ms;
die Logik (`logic.js`) ist ohne Hardware getestet (`node --test extensions/buttons/test/buttons.test.js`). Das Manifest wird erzeugt:
`node extensions/buttons/test/manifest-source.js --write`. Die Seite steht unter System › „Die Box“ und nimmt „Drehregler und Taster“ mit.

## Offen (für Foto/Immich, NFC)

Was eine Foto- oder Immich-Extension noch bräuchte (Ruhezustand im Display, eigene Nutzungsdauer, ein `lookup` ohne Suchwort) und was NFC
noch bräuchte (der Zugriff auf SPI läuft über die udev-Regel, nicht über `system.groups`; ein Tag startet ein Album: gelöst in 0.2 über `display.js` und `api.player.open`), steht mit dem Abgleich zu Waldemars Zweig `layout` in `docs/5.1-abstimmung.md`.
Dort steht auch, dass `EXT_DIR` (API und Player) beim Umzug auf die vier Ordner von 5.1 über `paths.ts` gehen soll.

## Eine Extension bauen

Die Richtlinien für Autoren (auf Englisch, mit Checkliste) stehen in [`extensions/README.md`](../extensions/README.md); die Webapp verlinkt sie auf der Seite „Erweiterungen“.

`extensions/<id>/` mit `manifest.json` und den Teilen, dann `node tools/mpx/pack.mjs <id>` (packt nach `extensions/dist/`, trägt den Katalog
ein) und beides einchecken. Tests der Extension (`extensions/<id>/test/*.test.js`) kommen nicht ins Paket: `node --test extensions/cd/test/*.test.js`.
