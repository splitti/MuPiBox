# App-Mapping: jede Einstellung der neuen MuPiBox-App → heutiger Code

Stand 28.09.2026, Code auf `upstream-v5-pr`. Grundlage sind die Unterlagen unter [`docs/eine-app/`](eine-app/)
(`NAVIGATION.md`, `app-schema.json`, `ZIELBILD.md`). Diese Datei ist die **Abhakliste für den Umbau**: Jede Zeile
sagt, wo eine Einstellung, Aktion oder Anzeige der neuen App heute steckt, wo sie gespeichert wird, wie sie gelesen
und geschrieben wird und was dabei sonst passiert. Umgeschaltet wird erst, wenn jede Zeile in der neuen App
funktioniert und getestet ist.

**Status je Zeile:** `✓ API` Node-Endpunkt vorhanden · `✓ API°` Endpunkt vorhanden, aber nur für die Box selbst
freigegeben (`localOnly`) – Guard umstellen · `⚙ PHP` kann heute nur das PHP-Admin – neuer Endpunkt nötig ·
`＋ neu` gibt es heute nirgends · `— statisch` reiner Hinweistext / reine Client-Funktion · 🔒 sicherheitsrelevant.

## Überblick

| Teil | Seiten | ✓ API | ✓ API° | ⚙ PHP | ＋ neu | — statisch |
| --- | --- | --- | --- | --- | --- | --- |
| 1 Start, Hören, Spielzeit, Bibliothek | 14 | 142 | – | 1 | 4 | – |
| 2 Aussehen, Display, Audio, Akku & Strom | 18 | 73 | – | 0 | 2 | – |
| 3 Netzwerk, Dienste, Sicherheit, System | 16 | 25 | – | 75 | 2 | 5 |
| **Summe** | **48** | **240** | **–** | **76** | **8** | **5** |

Alle 156 Schlüssel aus `app-schema.json` (157 Einstellungen, der Playlist-Präfix steht zweimal), alle Aktionen und
Anzeigen sind zugeordnet; keine Zeile ist unklar. Die Bereiche Start, Hören, Spielzeit und Bibliothek laufen schon
weitgehend über die Node-API der Eltern-App; die Einstellungen der „Werkstatt“ (Hardware, Netzwerk-Optionen, MQTT,
WLED, Updates, Backup, Protokolle, Systemoptionen, Browser, Experten) kann heute fast nur PHP.

## Was für die neue App gebaut werden muss

1. **Guards umstellen:** erledigt – die NAS-Verwaltung (`/api/nas/profiles*`, `login`, `index/*`, `browse`,
   `selection`, `mark`, `download/*`, `covers/refresh`) und `/api/online-covers*` nehmen `localOrElternSession`.
2. **Neue Endpunkte für heutige PHP-Funktionen (⚙ PHP, 76 Zeilen)**, jeweils mit der Logik und den Skripten, die PHP
   heute nutzt (Details in den Tabellen):
   - Bibliothek: „Update verfügbar“
   - Netzwerk & Dienste: Netzwerk-Optionen (Onboard-WLAN, USB-Treiber, Stromsparen, DHCP, Wächter, neu verbinden,
     IP-Steuerung), Freigaben (Samba, FTP, VNC), Telegram-Chat-ID ermitteln, MQTT, WLED
   - System: Neuigkeiten, Support-Infos, Updates (MuPiBox, Betriebssystem), Backup/Einspielen, Neustart von
     Display/Diensten, Protokolle, Systemoptionen, Browser, Hostname, JSON-Editor, Zurücksetzen
3. **Neu zu bauen (＋ neu, 8 Zeilen):**
   Kategorie und Fortschritt im „Läuft gerade“ auch für lokal/NAS/Radio, nächstes Ruhezeit-Fenster, ein
   Bluetooth-Schalter (Funk + Chip), „Sprache der Box“ (setzt `displayLanguage` und `bootscreenLanguage`), App in
   17 Sprachen, ein gemeinsamer Login.
4. **Doppelte Wege vereinheitlichen** (heute speichern PHP und Node dieselbe Einstellung verschieden):
   - `mupibox.maxVolume` als Zahl lesen und schreiben (PHP speichert Text → Node ignoriert den Hörschutz)
   - Startlautstärke: ein Schlüssel statt `startVolume` (PHP) und `startupVolume` (Node)
   - `timeout.idleDisplayOff` / `idlePiShutdown`: gleiche Bereiche, `setting_update.sh` nach dem Speichern,
     „0 = nie“ auch im Display-Frontend
   - Akku-Profil: gleiche Prüfungen (Reihenfolge, Bereiche) und `mupi_hat`-Neustart wie im PHP
   - `POST /bootscreen` und `/display-texts` nur die geschickten Felder ändern
   - Telegram: Dienst beim Aktivieren auch `enable`n
   - Passwortregeln (Länge, aktuelles Passwort nötig)

## Entscheidungen (28.09.2026)

1. **Smart-Sync aus** stoppt nur den automatischen Sync. „Jetzt synchronisieren“, Telegram `/resync` und Inhalte
   aus der Suche funktionieren weiter.
2. **Spotify-Anmeldung** läuft über HTTPS (Zertifikat von lighttpd; einmalige Warnung des Browsers beim Einrichten).
3. **Ein Passwort** für die ganze App. Das bisherige Admin-Passwort bleibt gültig (ist nur das Eltern-Passwort
   gesetzt, gilt dieses). Mindestens 6 Zeichen, Ändern nur mit dem alten Passwort. Node prüft bcrypt (PHP) und
   scrypt (Eltern-App) und schreibt beim nächsten Ändern scrypt.
4. **QR-Code- und Telegram-Link** öffnen die ganze App. Kritische Aktionen (Update, Backup einspielen,
   JSON-Editor, Zurücksetzen) fragen zusätzlich nach dem Passwort.
5. **Anmeldung bleibt abschaltbar** (Schalter „Anmeldung verlangen“ wie heute). Ist ein Passwort gesetzt, fragen die
   kritischen Aktionen auch bei abgeschalteter Anmeldung danach.
6. **Sitzung 24 Stunden.**
7. **Updates und Reparatur-Skripte** kommen aus dem installierten Stand bzw. dem Paket der gewählten Version, nicht
   mehr live von Upstream-`main`. Welche Versionen angeboten werden, wird mit splitti abgestimmt.

Ohne Rückfrage festgelegt: Standardwerte kommen aus dem Code bzw. der Konfig-Vorlage (nicht aus dem Prototyp);
NAS-Feld „Freigabe“ entfällt; „Ausgewählte herunterladen“ bekommt eine Rückfrage; „Strg+Alt+Entf senden“ entfällt.

## Vor dem Bau zu entscheiden (Stand vor den Entscheidungen oben)

- **Login:** ein Passwort für alles. Vorschlag: Node prüft beide Hash-Formate (bcrypt aus PHP, scrypt aus der
  Eltern-App) und schreibt beim nächsten Ändern scrypt; Mindestlänge 6; Ändern nur mit aktuellem Passwort. Offen:
  Darf ein Magic Link (QR am Display, Telegram) auch die 🔒-Aktionen (Update, Backup einspielen, JSON-Editor,
  Zurücksetzen) freischalten, oder verlangen diese eine erneute Passworteingabe? Soll „Anmeldung aus“ weiter
  möglich sein? Sitzungsdauer (heute 60 min Leerlauf gegen 24 h fest).
- **Spotify-Anmeldung:** Spotify nimmt für Redirect-URIs außer Loopback nur noch HTTPS an. Für die App auf Port 80
  klären (HTTPS über lighttpd, das heute schon ein Zertifikat hat, oder Loopback-Umweg).
- **Smart-Sync aus:** Heute ist dann auch der manuelle Sync aus, und Such-Hinzufügungen kommen nie an. Gewollt?
- **NAS:** Feld „Freigabe“ streichen (WebDAV kennt keine); Profile speichern kein Passwort; „Ausgewählte
  herunterladen“ löscht nicht angehakte lokale Kopien → Rückfrage nötig.
- **Updates/Treiber/Reset** laden heute Skripte live vom Upstream-`main` und führen sie als root aus: künftig
  lokale Skripte bzw. die eigene Versionsquelle.
- **Standardwerte:** Prototyp und Code weichen ab (u. a. Lüfter-Pin 17 = Trigger-Pin des OnOffShim!). Es gelten die
  Werte aus dem Code bzw. der Konfig-Vorlage.
- „Strg+Alt+Entf senden“ (Display live) gibt es nur in noVNC: streichen oder noVNC einbetten.

## Heute schon fehlerhaft (unabhängig von der neuen App)

**Sicherheit 🔒**
- Stored XSS in der Log-Anzeige: `logviewer.php` setzt Log-Text per `innerHTML` ein, `POST /api/logs` nimmt
  ohne Anmeldung Text aus dem ganzen Heimnetz an → JavaScript in der Admin-Oberfläche.
- Ohne Anmeldung aus dem Heimnetz erreichbar: `/api/reboot`, `/api/shutdown`, `/api/addwlan`,
  `/api/wifi/configured/*`, `/api/add`, `/api/edit`, `/api/delete`, `/api/bluetooth/*`.
- VNC ohne Passwort, Samba mit festem Passwort `mupibox`, FTP im Klartext.
- Support-ZIP enthält Salt und Hash des Eltern-Passworts; JSON-Editor schützt `eltern.password` nicht.
- `chromium.cachesize` ungeprüft in Bash-Arithmetik; `chromium.gpu/kiosk/…` werden als Befehl ausgeführt.
- Reset setzt `chmod 777` auf die Konfiguration; Update/Treiber/Reset führen Skripte von Upstream-`main` als root aus.

**Funktion**
- Hörschutz in der Eltern-App wirkungslos, sobald MuPi-Conf `maxVolume` gespeichert hat (Text statt Zahl).
- „SD übertakten“ bzw. „Warnungen ausblenden“ ausschalten löscht die **letzte Zeile** von `/boot/config.txt`.
- Admin „Einstellungen übernehmen“ bricht mit einem PHP-Fehler ab; „Spotify-Dienste neu starten“ ruft wegen eines
  Tippfehlers ein nicht vorhandenes Skript auf; „PM2 neu starten“ startet nur den Server.
- HDMI-Spiegeln nicht einstellbar (`intval` macht 0 daraus); „Display aus = 0“ bedeutet im Display trotzdem 1 min.
- Spotify-Assistent der Eltern-App überschreibt das Client Secret mit leer (auf der Box prüfen); Node-Wege rufen
  weder `setting_update.sh` noch `spotify_restart.sh` auf.
- Bibliothek bearbeiten/löschen nutzt das Feld `index`, das neue manuelle Einträge nicht haben (auf der Box prüfen).
- „Link einfügen“: meldet bei Fehlern Erfolg (HTTP 200) und schreibt https- in http-Links um.
- `/api/eltern/wlan/remove` verliert die Bandwahl aller Netze; `POST /bootscreen` setzt fehlende Felder zurück.
- Telegram per Eltern-App nur neu gestartet, nie eingeschaltet; MQTT stürzt ohne `mqtt.name` ab; WLED-Speichern
  ohne erreichbares Gerät setzt alles auf 0/aus.
- „Metadaten-Cache leeren“ löscht den ganzen `cache/`-Ordner (auch Cover, Online-Cover-Index, NAS-Liste).
- PHP-Schlaftimer startet einen zweiten Timer, ohne den alten zu beenden.
- Die Eltern-App nutzt einen echten Boxnamen als Beispiel und Standardwert (Platzhalter, Playlist-Präfix im
  Assistenten, Hilfetexte, Kommentare im Sync-Code) → durch neutrale Beispiele ersetzen.

## Im Prototyp fehlt oder weicht ab

- Vorhandene Funktionen, die fehlen: Konflikt „Vom Sync verwalten lassen“, NAS über HTTPS / „Anmeldung merken“ /
  Zertifikat bestätigen, Cover „Übrige gefundene speichern“, NAS-Download mit Fortschritt und Abbrechen, Auswahl
  „Wenn das Limit erreicht ist / eine Ruhezeit beginnt“ ist im Prototyp da, in der heutigen Eltern-App nicht.
- „Folge von/bis“ ist die Position nach Erscheinungsdatum, nicht die Folgennummer; „Titel +“ fügt das ganze Album
  hinzu; ein NAS-Profil speichert kein Passwort.
- Redirect-URI im Assistenten stimmt nicht mit dem Code überein; es gibt 16 Startbild-Szenen (nicht 15); die
  Haltezeit öffnet die Einstellungsseite der Box (mit QR-Kachel), nicht direkt den QR-Code.

---

# Detailtabellen

## Teil 1: Start, Hören, Hör-Verlauf, Spielzeit, Bibliothek, Verwaltet, Suche, Link, Upload, Spotify, Sync-Einstellungen, Assistent, NAS, Cover

Stand: Code auf Branch `upstream-v5-pr` (28.09.2026), nur gelesen, nichts auf der Box ausgeführt.

**Abkürzungen**
- `r.ts` = `src/backend-api/src/eltern/routes.ts` (Router `/api/eltern/*`, Session + CSRF) · `up.ts` = `src/backend-api/src/eltern/upload.ts` · `oauth.ts` = `src/backend-api/src/eltern/oauth.ts`
- `s.ts` = `src/backend-api/src/server.ts` (Port 8200, `/api/*`) · `ss.ts` = `src/backend-api/src/spotify-sync/routes.ts` (`/api/spotify-sync/*`) · `sched.ts` = `spotify-sync/scheduler.ts`
- `app.js` / `html` = `src/backend-api/src/eltern-webapp/app.js` / `index.html` (heutige Eltern-App, `/parents` auf Port 8200)
- `sc.js` = `src/backend-player/src/spotify-control.js` (Player, Port 5005)
- PHP-Dateien = `AdminInterface/www/*.php` (Port 80)
- `cfg` = `/etc/mupibox/mupiboxconfig.json` · `data.json` = `~/.mupibox/Sonos-Kids-Controller-master/server/config/data.json` (`active_data.json` = Symlink darauf, offline auf `offline_data.json`, gepflegt von `check_network.sh`)
- `cache/` = `~/.mupibox/Sonos-Kids-Controller-master/cache/` (Arbeitsverzeichnis des Backends)

**Schreibwege**
- Node schreibt `cfg` immer über `updateMupiboxConfig()` (`s.ts:1552`): flock `/tmp/.mupiboxconfig.lock` (derselbe wie PHP `save_mupiboxconfig()`), atomar ersetzt, **kein** `setting_update.sh`. Der Player liest `cfg` live per fs.watch (`sc.js:80`), ohne Neustart.
- PHP schreibt über `save_mupiboxconfig()` (`includes/save_config.php`) und ruft danach meist `sudo setting_update.sh` auf.

**Status**
- `✓ API` = Es gibt einen Node-Endpoint, den die neue App so nutzen kann (oder es ist reine Client-Logik).
- `✓ API°` = Der Node-Endpoint existiert, ist aber `localOnly` (`request-guard.ts:108`, nur Loopback; heute ruft ihn nur PHP per curl auf). Für die neue App den Guard auf `localOrElternSession` umstellen, sonst bleibt alles gleich.
- `⚙ PHP` = Das kann heute nur das PHP-Admin → neuer Endpoint nötig.
- `＋ neu` = Gibt es heute nirgends.
- `? unklar` = Ließ sich nicht klären.

---

### Start [start]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `◉ Läuft gerade` | Cover, Titel, Interpret | E: Startseite `loadPlayback` app.js:2157 / `renderPlayback` app.js:2181, fragt alle 5 s ab | Laufzeit des Players (`sc.js` `/local`, `/state`) | GET `/api/eltern/playback` r.ts:1114 (Proxy auf :5005 `/local` + `/state`) | — | liefert `playing, player, source, title, artist, album, coverUrl, progressMs, durationMs, volume`; Cover bei NAS/lokal über `playingTrackCover`/`playingAlbumCover` | ✓ API |
| `◉ Kategorie` | „Interpret · Kategorie“ | – | – | /playback liefert nur `source` (spotify/nas/local/radio/rss), keine Kategorie | — | Kategorie im Client aus data.json nachschlagen oder `source` anzeigen | ＋ neu |
| `◉ Fortschritt (Spotify)` | Balken + Zeiten | E: `renderPlayback` app.js:2263 (nur Balken, keine Zeiten) | Spotify `/state` | /playback `progressMs`/`durationMs` (r.ts:1170) | — | Zeiten im Client formatieren | ✓ API |
| `◉ Fortschritt (lokal/NAS/Radio)` | Balken + Zeiten | – | mplayer | /playback liefert bei mplayer weder Position noch Dauer | — | Player-`/local` um Position/Dauer erweitern | ＋ neu |
| `▶ Zurück / Play-Pause / Vor / Stopp` | Knöpfe | E: `playbackAction` app.js:2274 | — | — | POST `/api/eltern/playback/{previous,play,pause,next,stop}` r.ts:1215 → :5005 `/<action>?src=eltern` | 423 + `playtime_limit_reached`/`quiet_hours_active` bei Limit/Ruhe | ✓ API |
| `◉/S Lautstärke-Regler` | Lautstärke | E: `loadPlaybackVolume` app.js:2102, `setPlaybackVolume` app.js:2132 (200 ms entprellt) | ALSA `Master` (live, nicht gespeichert) | GET `/api/eltern/audio` r.ts:779 (`amixer sget`) + `volume` aus /playback | POST `/api/eltern/audio/volume` r.ts:812 (`amixer sset`, auf `maxVolume` begrenzt, `capped`) | 503 wenn `cfg` gerade nicht geladen ist (Client versucht es erneut) | ✓ API |
| `◉ Maximallautstärke-Markierung` | rote Marke | E: app.js:2121 | `mupibox.maxVolume` | GET `/api/eltern/audio` → `maxVolume` | (Einstellung: Seite Lautstärke) | **Bug:** PHP `mupi.php:501` speichert `maxVolume` als String → r.ts:800/827 werten nur Zahlen → Cap = 100, keine Marke, keine Begrenzung | ✓ API |
| `◉ Nichts läuft` | „Etwas abspielen“ → Hören | E: app.js:2241 (Leerlauf-Text) | — | /playback `playing=false` und kein Titel | Navigation | reine Client-Logik | ✓ API |
| `◉ Kachel Akku` | %, lädt | E: `loadStatusBand` app.js:3437 | `/tmp/mupihat.json` (MuPiHAT-Dienst) | GET `/api/mupihat` s.ts:1444 → `Bat_Percent` (Fallback `Bat_SOC`), lädt = `IBus>0` | — | „lädt“ besser aus `Charger_Status` ableiten | ✓ API |
| `◉ Kachel Heute gehört` | x / y min | E: app.js:3462 (zeigt nur „x m“) | `/tmp/playtime.json` (vom Player geschrieben, `sc.js` ~785–825) | GET `/api/playtime` s.ts:1466 → `playtime.usedSeconds`, `limitMinutes` (inkl. Bonus) | — | ohne Limit: `playtime.enabled=false` | ✓ API |
| `◉ Kachel Ruhezeit (aktiv)` | aktiv / frei | E: app.js:3478 | `/tmp/playtime.json` | /api/playtime → `quiet.enabled/state/inWindow/label` | — | | ✓ API |
| `◉ Ruhezeit „ab …“` | nächster Beginn | – | `quietHours.schedule` | nicht geliefert | — | im Client aus GET `/api/eltern/caps-config` ausrechnen oder `/tmp/playtime.json` um `nextWindow` erweitern | ＋ neu |
| `◉ Kachel WLAN` | Netzname | E: app.js:3498 | `/tmp/network.json` (`get_network.sh` → `.wifi`, `check_network.sh` → `.onlinestate`) | GET `/api/network` s.ts:2014 | — | 404, solange die Datei fehlt | ✓ API |
| `▶ +15 min` | Schnell | E: nur Spielzeit (`capsExtend` app.js:973 mit beliebigen Minuten) | `playtimeLimit.todayBonus {date, minutes}` | /api/playtime | POST `/api/playtime/extend {minutes:15}` s.ts:1858 (Session + CSRF) | Player live per fs.watch; wird aufsummiert (max. 1440); verfällt am logischen Tageswechsel (`resetHour`) | ✓ API |
| `▶ Ruhe sofort` | Schnell | E: `capsQuietNow` app.js:999 | `playbackOverride.forceBlockUntil` (+ `allowUntil=0`) | /api/playtime `override` | POST `/api/quiethours/now {minutes}` s.ts:1960 (ohne Angabe 60 min) | stoppt sofort, Kind sieht das Overlay | ✓ API |
| `▶ Schlaftimer` | Schnell | E: `startSleepTimer` app.js:3352 | `/tmp/.time2sleep` | GET `/api/eltern/sleeptimer` r.ts:710 | POST `/api/eltern/sleeptimer/start {minutes}` r.ts:732 | Minuten müssen gewählt werden (Blatt/Standard) | ✓ API |
| `◉ Hinweis: Update verfügbar` | Hinweis-Karte | A: `index.php:34` (GitHub `version.json`, 1 h Cache per `mupibox_cached_url` index.php:10) gegen `mupibox.version` | PHP-Cache + `mupibox.version` | nur PHP | — | Endpoint mit derselben Abfrage und Cache anlegen (GitHub raw, Timeout) | ⚙ PHP |
| `◉ Hinweis: Akku fast leer` | Hinweis-Karte | (Box-Display) | `/tmp/mupihat.json` `Bat_Stat` = OK/LOW/SHUTDOWN (`mupihat_bq25792.py:317`) | GET `/api/mupihat` | — | | ✓ API |
| `◉ Hinweis: Spotify-Anmeldung abgelaufen` | Hinweis-Karte | E: Hub-Karte Sync app.js:3400 | `spotify.*` + `/tmp/.spotify_sync_state.json` | GET `/api/spotify-sync/status` ss.ts:34 → `token.configured`, `token.scopes_ok`, `state.last_sync_status` = `AUTH_FAILED`/`AUTH_NEEDS_REAUTH` | — | `token.valid` heißt nur „Access-Token noch >5 min gültig“ und ist **kein** Signal für „abgelaufen“ | ✓ API |
| `▶ Hinweis schließen` | × | – | – | – | – | nur im Client (z. B. localStorage je Hinweis) | ＋ neu |

### Hören [hoeren]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `◉ Hör-Verlauf-Zeile` | Heute x min · n Titel | E: Hub-Kachel mit statischem Text (html:161) | `~/.mupibox/play_log.jsonl` | GET `/api/eltern/playlog?range=today` r.ts:1365 → `totalMinutes`, `trackCount` | — | | ✓ API |
| `S Suche` | Suchfeld | E: `#play-search`, `renderPlay` app.js:2462 | — | im Client über artist/title (inkl. `*_override`) | — | NAS: filtert nur die aktuelle Ebene | ✓ API |
| `S Filter-Pillen` | Alle / Hörspiel / Musik / Radio / NAS | E: html:1146, app.js:2477 | `category`/`type` in data.json | — | — | Radio = `category='radio'` **oder** `type='radio'`; reine Künstler-Abos (nur `artistid`) werden ausgeblendet (app.js:2486) | ✓ API |
| `◉ Cover-Raster` | Kacheln + Quell-Etikett | E: `loadPlay` app.js:2442, `playTypeLabel` app.js:2535 | data.json | GET `/api/data` s.ts:1121; Cover `cover_override`/`cover`, sonst GET `/api/spotify/cover-for/:kind/:id` s.ts:1407 | — | „Alle“ zeigt zusätzlich die NAS-Ordner der obersten Ebene | ✓ API |
| `◉ NAS-Ordner + Brotkrümel` | Ordner-Navigation | E: `loadNasLevel` app.js:2308, `renderNasCrumbs` app.js:2330 | `nas.artistFolders`/`hiddenFolders` | GET `/api/nas/artists` s.ts:5255, `/api/nas/children?path=` s.ts:5293 (nur ausgewählte Ordner) | — | 503, wenn das NAS nicht erreichbar ist | ✓ API |
| `◉ Lokale Ordner` | (Hörspiel/Musik vom SD) | nur Box-Display: GET `/api/library/artists?category=` s.ts:6858, `/api/library/children?path=` s.ts:6887 | `/home/dietpi/MuPiBox/media/<cat>/…` | Endpoints vorhanden (ohne Login) | — | Neue App: Ordner-Kacheln „SD-Karte“ je Kategorie, Unterordner mit Brotkrümeln; die `library`-Einträge aus data.json blendet sie wie die Box aus | ✓ API |
| `▶ Tippen (Eintrag aus data.json)` | spielt auf der Box | E: `playLibraryItem` app.js:2553 → `startPlayback` app.js:2560 (fragt nach, wenn schon etwas läuft) | — | — | POST `/api/eltern/library/play {index}` r.ts:1241 → :5005 `/current/<spotify…/radio…/rss…/musicsearch/library…>` | `index` = Position in `active_data.json`; 423 bei Limit/Ruhe | ✓ API |
| `▶ Tippen (NAS-Album)` | spielt | E: `onNasTile` app.js:2428 | — | — | POST `/api/eltern/library/play-nas {path}` r.ts:1334 | nur ausgewählte, nicht versteckte Ordner (403 `nas_path_not_selected`) | ✓ API |
| `▶ Tippen (lokaler Ordner)` | spielt | nur Box: `player.service.ts:104` `musicsearch/library/album/<Pfad mit ":">` | — | — | POST `/api/eltern/library/play-local {path}` (Kategorie geprüft, Ordner muss existieren) | wie die Box (`musicsearch/library/album/<Pfad mit ":">`) | ✓ API |

### Hören › Hör-Verlauf [verlauf]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `◉ big` | Heute: min · Titel · meistgehört | E: `renderHistoryToday` app.js:2612 | `/home/dietpi/.mupibox/play_log.jsonl` (Poller `s.ts:1583`, fragt alle 10 s :5005 ab, schreibt start/stop, wird gekürzt ab s.ts:1655) | GET `/api/eltern/playlog?range=today` r.ts:1365 → `totalMinutes`, `trackCount`, `topArtists[0]` | — | „Heute“ zählt ab Mitternacht, **nicht** ab `resetHour` → kann von „x von y“ der Spielzeit abweichen | ✓ API |
| `◉ chart` | Letzte 7 Tage (min) | E: `renderHistoryWeek` app.js:2619 | dto. | `?range=week` → `timeline[{date, minutes}]` | — | letzte 168 h, auf 7 Kalendertage verteilt → der erste Tag ist unvollständig | ✓ API |
| `◉ note` | Insgesamt x Minuten in y Titeln | E: app.js:2649 | dto. | week → `totalMinutes`, `trackCount` | — | | ✓ API |
| `◉ Top-Künstler` | 5 Zeilen | E: app.js:2651 | dto. | week → `topArtists[{name, minutes, count}]` (höchstens 5) | — | Start ohne Stopp zählt höchstens 10 min | ✓ API |
| `◉ Top-Titel` | 5 Zeilen | E: app.js:2665 | dto. | week → `topTitles[{title, artist, minutes, count}]` | — | | ✓ API |

### Spielzeit [spielzeit]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `◉ Ring / x von y / Status / Ruhezeit-Status` | Heute | E: `loadCapsStatus` app.js:699; A: parental.php:243 (nur ENABLED/DISABLED) | `/tmp/playtime.json` (Player) | GET `/api/playtime` s.ts:1466 → `playtime.usedSeconds/remainingSeconds/limitMinutes/state` (normal/grace/blocked), `quiet.*` | — | | ✓ API |
| `capMin` | Minuten (1–1440) | E: `#caps-override-minutes` html:555, `getCapsOverrideMinutes` app.js:964 | — (nur Parameter) | — | geht als `{minutes}` an die drei Sofort-Aktionen | Client 1–1440; Server >0 und ≤1440 | ✓ API |
| `▶ + Bonus-Zeit` | Sofort-Aktion | E: `capsExtend` app.js:973 (Telegram `/extend`) | `playtimeLimit.todayBonus {date, minutes}` | /api/playtime `limitMinutes` (inkl. Bonus) | POST `/api/playtime/extend` s.ts:1858 (Session + CSRF) | live per fs.watch, kein Neustart; wird aufsummiert; verfällt am logischen Tageswechsel | ✓ API |
| `▶ Sperren aufheben` | Sofort-Aktion | E: `capsRelease` app.js:986 | `playbackOverride.allowUntil` (= jetzt + N min), `forceBlockUntil=0` | /api/playtime `override` | POST `/api/playtime/release` s.ts:1889 | hebt Limit **und** Ruhezeit auf | ✓ API |
| `▶ Ruhe sofort` | Sofort-Aktion | E: `capsQuietNow` app.js:999 | `playbackOverride.forceBlockUntil`, `allowUntil=0` | dto. | POST `/api/quiethours/now` s.ts:1960 | stoppt sofort; die letzte Eltern-Aktion gewinnt | ✓ API |
| `sleepMin` | Minuten 15–360 | A: parental.php:177 (`powerofftimer`, Regler 15–360/15); E: html:541 (15–360/15) | — (Laufzeit `/tmp/.time2sleep`) | — | Parameter für Start | Server erlaubt 1–1440 (parental.php:25, r.ts:735) | ✓ API |
| `▶ Starten` | Schlaftimer | A: parental.php:17 (`sudo nohup sleep_timer.sh <s> &`); E: `startSleepTimer` app.js:3352 | `/tmp/.time2sleep` (Restsekunden, jede Sekunde neu geschrieben) | GET `/api/eltern/sleeptimer` r.ts:710 | POST `/api/eltern/sleeptimer/start` r.ts:732 (erst `sudo pkill -f sleep_timer.sh`, dann `spawn sudo sleep_timer.sh <s>`) | nach Ablauf `poweroff` (`scripts/mupibox/sleep_timer.sh`), egal ob gerade etwas läuft; PHP beendet einen laufenden Timer **nicht** (zwei Timer möglich) | ✓ API |
| `▶ Stoppen` | Schlaftimer | A: parental.php:7; E: `stopSleepTimer` app.js:3371 | dto. | – | POST `/api/eltern/sleeptimer/stop` r.ts:764 (pkill + `rm /tmp/.time2sleep`) | | ✓ API |
| `◉ Countdown` | läuft noch … | A: parental.php:569ff (JS-Ring); E: `loadSleepTimer` app.js:3315 (5 s/30 s) | `/tmp/.time2sleep` | GET `/api/eltern/sleeptimer` → `remaining_seconds`, `until_iso` | — | | ✓ API |
| `limitOn` | Tageslimits aktiv | A: parental.php:246/247 (verstecktes Feld + Umschalt-Knopf) → Handler :60–89; E: `#caps-playtime-toggle`, `saveCapsConfig` app.js:936 | `playtimeLimit.enabled` | GET `/api/eltern/caps-config` r.ts:449 | POST `/api/eltern/caps-config` r.ts:478 | live per fs.watch; PHP ruft zusätzlich `setting_update.sh` (parental.php:137, hier unnötig); Vorlage: `false` (Prototyp: an) | ✓ API |
| `◉ days (lim0–lim6)` | Wochenbalken Mo–So | A: parental.php:282 (`playtime_limit_<day>`, 0–1440); E: `renderCapsDayGrid` app.js:749 | `playtimeLimit.limitsMinutes.{mon,tue,wed,thu,fri,sat,sun}` | GET /caps-config (Standard 60) | POST /caps-config (alle Tage) oder POST `/api/playtime/limit {day, minutes}` s.ts:1924 (ein Tag) | 0 = gesperrt; `lim0..6` über **Namen** zuordnen (der Player nutzt `getDay()` mit So=0) | ✓ API |
| `resetHour` | Tageswechsel um (0–23) | A: parental.php:252 → :76 (auf 0–23 begrenzt); E: nur gelesen (r.ts:457) | `playtimeLimit.resetHour` | GET /caps-config | POST /caps-config `playtimeLimit.resetHour` (ganze Zahl 0–23, sonst 400) | Player liest live (`sc.js:595`) | ✓ API |
| `limitGrace` | Wenn das Limit erreicht ist | A: parental.php:258 → :77 (stop/track/album); E: nur Anzeige `#caps-overrun-info` app.js:746 | `playtimeLimit.graceMode` (altes `maxOverrunMinutes` wird gelöscht) | GET /caps-config (`graceModeOf` r.ts:160) | POST /caps-config nimmt `graceMode` an (r.ts:545) | Nachspielzeit höchstens 30 min (Titel) / 3 h (Album) (`sc.js:591`); Podcast darf die Folge beenden, Radio stoppt sofort; die Eltern-App hat dafür keine Auswahl | ✓ API |
| `quietOn` | Ruhezeiten aktiv | A: parental.php:318/319 → :101; E: `#caps-quiet-toggle` → saveCapsConfig | `quietHours.enabled` | GET /caps-config | POST /caps-config | live | ✓ API |
| `◉ rules` | Tag · von–bis · Bezeichnung | A: parental.php:388–560 (Tabelle + Popup, versteckte Felder `quiet_windows[day][n][from/to/label]` → :104–129); E: `renderQuietSchedule` app.js:778 | `quietHours.schedule.{mon..sun}[] = {from, to, label?}` | GET /caps-config | POST /caps-config (HH:MM geprüft, `label` auf 80 Zeichen gekürzt, r.ts:510–539; je gesendeter Tag wird ersetzt) | Fenster gehört zum Starttag, `from>to` läuft über Mitternacht, `from==to` wird ignoriert (`sc.js:662`). PHP: 15-min-Raster, Label ≤60, from≠to, kein Duplikat; Node prüft from≠to (400), die App bietet das 15-min-Raster an. Blatt „rule“ mit mehreren Tagen → Client legt je Tag einen Eintrag an | ✓ API |
| `▶ + Zeitfenster` | Ruhezeiten | A: parental.php:491 (Popup, speichert sofort per Submit); E: app.js:795 (Vorgabe 20:00→07:00) | dto. | — | POST /caps-config | | ✓ API |
| `quietGrace` | Wenn eine Ruhezeit beginnt | A: parental.php:325 → :102; E: keine Auswahl | `quietHours.graceMode` | GET /caps-config | POST /caps-config nimmt `graceMode` an (r.ts:559) | wie `limitGrace` | ✓ API |

### Bibliothek [bibliothek]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `◉ Liste` | Cover, Titel, Interpret, Kategorie-Etikett, Sync | E: `loadLibrary` app.js:316, `renderLibrary` app.js:349; A: media.php (nur Übersicht von data.json) | data.json | GET `/api/data` s.ts:1121 | — | Resume-Einträge werden ausgeblendet; Cover wie beim Hören | ✓ API |
| `◉ Lokale Ordner in der Liste` | alle Inhalte inkl. lokal | – | `media/<cat>/…` (Dateisystem) | `/api/library/artists` s.ts:6858 + `/api/library/children` s.ts:6887 | — | Neue App: Liste mit Filter „SD-Karte“, Tippen zeigt die Alben des Ordners | ✓ API |
| `S Suche` | Suchfeld | E: `#library-search` → renderLibrary | — | Client (artist/title inkl. `_override`) | — | | ✓ API |
| `S Filter Kategorie` | Hörspiel / Musik / Sonstiges | E: html:311 | `category` | Client | — | filtert auf `category`, nicht auf `category_override` (Anzeige nutzt Override) | ✓ API |
| `S Filter Quelle` | manuell / Sync | E: html:317 | `source` = manual / spotify-sync (Phase 14a) | Client | — | ohne `source` = manual | ✓ API |
| `◉ Zähler` | n Einträge | E: app.js:367 | — | Client | — | | ✓ API |
| `▶ Hinzufügen (Blatt add)` | 3 Wege | E: `openLibraryChooseSheet` app.js:585 (html:356) | — | — | Navigation zu suche/link/upload | | ✓ API |
| `▶ Blatt edit: Speichern` | Bearbeiten | E: `openLibraryEditSheet` app.js:420 | data.json: manuell die Grundfelder `artist/title/cover/artistcover/category`; Sync-Einträge nur `*_override` + `category_override` | — | POST `/api/edit {index, data, original}` s.ts:2974 (Lock `/tmp/.data.lock`, atomar, 409 bei verschobenem Eintrag) | **kein Login/CSRF** (offene /api); `index` kommt aus dem Feld in data.json (s. Lücken); die Box lädt über `/api/data-version` neu | ✓ API |
| `▶ Blatt edit: Löschen` | Löschen | E: app.js:519 (nur manuelle Einträge) | data.json | — | POST `/api/delete {index, original}` s.ts:2936 | `splice` ohne neue Nummerierung; Sync-Einträge nur über Abo/Playlist entfernbar | ✓ API |
| `▶ Lokalen Ordner löschen/bearbeiten` | (lokale Einträge) | nur Box-Display: Player `deletelocal/<cat>:<artist>:<title>` sc.js:2540 | Dateisystem | — | POST `/api/eltern/local/delete {path}` up.ts (Kategorie geprüft, keine ganze Kategorie, leere Elternordner gehen mit, `changed()` → das Display lädt neu) | ganzer Interpret oder ein Album; mit Rückfrage | ✓ API |
| `▶ Jetzt synchronisieren` | (Bibliothek-Kopf) | E: `manualSyncNow` app.js:3679 | — | GET /api/spotify-sync/status (Polling bis fertig) | POST `/api/spotify-sync/trigger?source=webapp` ss.ts:54 | s. Seite Spotify | ✓ API |

### Bibliothek › Verwaltete Inhalte [verwaltet]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `◉ Künstler-Abos` | Liste | E: `loadSubscriptions` app.js:1195, `renderSubscriptions` app.js:1201 | `spotify_sync.artists[] {id, name, category, range_from, range_to, exclude_album_ids}` | GET `/api/eltern/library/subscriptions` r.ts:2075 | — | Alben kommen erst nach einem Sync als `source='spotify-sync'` in data.json | ✓ API |
| `epFrom` / `epTo` (+ Übernehmen) | Folge von / bis | E: Felder in renderSubscriptions, `applyArtistRange` app.js:1302 | `spotify_sync.artists[].range_from` / `range_to` | subscriptions | POST `/api/eltern/library/subscribe-artist {artistId, name, category, range_from, range_to}` r.ts:2030 (ersetzt den Eintrag, `exclude_album_ids` bleibt) | „Folge“ = **Position nach Erscheinungsdatum** (1-basiert, ss.ts:213), nicht die Folgennummer im Titel; leer = offen; danach `fireSyncTrigger` app.js:3645 | ✓ API |
| `inc12` / `inc99` | Album ein/aus | E: `toggleArtistAlbums` app.js:1330, `setExclude` app.js:1391 | `spotify_sync.artists[].exclude_album_ids[]` | GET `/api/spotify-sync/artist-albums?artistId=` ss.ts:188 → `position, inRange, excluded` | POST `/api/eltern/library/artist-exclude {artistId, albumId, excluded}` r.ts:2125 | braucht Spotify-Token (409/502); Alben außerhalb des Bereichs sind nicht schaltbar; danach Sync | ✓ API |
| `▶ Abo entfernen` | danger | E: `unsubscribeArtist` app.js:1278 | `spotify_sync.artists` | — | POST `/api/eltern/library/unsubscribe-artist {artistId}` r.ts:2085 | der nächste Sync entfernt die Alben als Waisen | ✓ API |
| `◉ Einzelne Alben` (+ Entfernen) | Liste | E: renderSubscriptions app.js:1260, `removeAlbum` app.js:1290 | `spotify_sync.explicit_albums[] {id, name, category}` | subscriptions | POST `/api/eltern/library/remove-album {albumId}` r.ts:2102 | | ✓ API |

### Bibliothek › Auf Spotify suchen [suche]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `sq` | Auf Spotify suchen | E: `#search-query`, `doSearch` app.js:1129 | — | GET `/api/spotify/search?q=&types=&limit=8` s.ts:3160 | — | mindestens 2 Zeichen; ohne Login (offene /api); nutzt `spotifyApiService` | ✓ API |
| `sType` | Suchen in: Alle/Künstler/Alben/Titel | E: Pillen `data-stype` html:432 | — | `types=artist,album,track` | — | | ✓ API |
| `sCat` | Hinzufügen als | E: `#search-add-category` html:439 | `category` im Abo/Album | — | Parameter von add-album / subscribe-artist | erlaubt: audiobook/music/other | ✓ API |
| `▶ Suchen` | | E: doSearch | — | s.o. | — | | ✓ API |
| `◉ Künstler` (+) | Liste | E: `subscribeArtistFromSearch` app.js:1157 | `spotify_sync.artists` | — | POST `/api/eltern/library/subscribe-artist` r.ts:2030 + Sync-Trigger | ist Smart-Sync **aus**, antwortet der Trigger `disabled` → nichts kommt auf die Box | ✓ API |
| `◉ Alben` (+) | Liste | E: `addAlbumFromSearch` app.js:1053 | `spotify_sync.explicit_albums` | — | POST `/api/eltern/library/add-album {albumId, category, name}` r.ts:1997 + Sync-Trigger | wie oben | ✓ API |
| `◉ Titel` (+) | Liste | E: app.js:1096 | dto. | — | „+“ fügt das **ganze Album** des Titels hinzu (app.js:1101) | ein einzelner Titel geht nicht | ✓ API |

### Bibliothek › Link einfügen [link]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `lType` | Typ | E: `#library-add-type` html:382, `onAddTypeChange` app.js:591 (auch Box-Display Add-Seite, Telegram) | data.json `type` = spotify / radio / rss | — | Teil von POST `/api/add` | Eltern-App: Radio/RSS setzen die Kategorie auf `other` | ✓ API |
| `lUrl` | URL | E: `submitLibraryAdd` app.js:608 | Spotify: `spotify_url` + ID aus `playlist/`→`playlistid`, `artist/`→`artistid`, `album/`→`id`, `show/`→`showid`, `audiobook/`→`audiobookid`; Radio/RSS: `id` = URL | — | POST `/api/add` s.ts:2583 | Spotify-Link muss mit `https://open.spotify.com/` beginnen; Radio/RSS: **`https://` wird zu `http://`** (app.js:638/643) | ✓ API |
| `lLabel` | Künstler/Show-Name | E: `#library-add-label` | `artist` (Standard „Radio“/„Podcast“) | — | dto. | | ✓ API |
| `lTitle` | Titel (Radio) | E: `#library-add-title` (nur Radio) | `title` (Standard „Stream“) | — | dto. | | ✓ API |
| `lCat` | Kategorie | E: `#library-add-category` | `category` audiobook/music/other | — | dto. | | ✓ API |
| `▶ Hinzufügen` | primary | E: app.js:646 | data.json (+ `source:'manual'`) | GET /api/data | POST `/api/add` (Lock, atomar) | **kein Login/CSRF**; Antwort ist auch bei `locked`/`error` HTTP 200 → Eltern-App meldet dann trotzdem Erfolg (app.js:652); die Box lädt über `/api/data-version` neu | ✓ API |

### Bibliothek › Vom Gerät hochladen [upload]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `uCat` | Kategorie | E: `#upload-category` html:461 | Ordner `/home/dietpi/MuPiBox/media/<cat>/` | — | Parameter `category` | audiobook/music/other | ✓ API |
| `uArtist` | Interpret | E: `#upload-artist` (+ Vorschläge) | `media/<cat>/<artist>/` | GET `/api/eltern/local/folders?category=` up.ts:86 | Parameter `artist` | Pflichtfeld; Name wird bereinigt (`cleanName` up.ts:39) | ✓ API |
| `uAlbum` | Album | E: `#upload-album` (+ Vorschläge `?artist=`) | `…/<album>/` | dto. | Parameter `album` | leer = direkt beim Interpreten; ein gewählter Ordner gibt den Albumnamen vor | ✓ API |
| `▶ Titel wählen` | | E: `initUpload` app.js:1863 (Datei-Input) | — | — | Client | Audio + Bilder | ✓ API |
| `▶ Ordner wählen` | | E: dto. (`webkitdirectory`) | — | — | Client | ohne `webkitdirectory` (iPhone) versteckt | ✓ API |
| `▶ Cover wählen` | | E: dto. | wird zu `cover.<ext>` im Album- bzw. Interpretenordner | — | Client | | ✓ API |
| `◉ note` | Dateien hierher ziehen | E: `#upload-drop`, `droppedEntries` app.js:1760 | — | — | Client | | ✓ API |
| `◉ bar` | Hochladen-Fortschritt | E: `startUpload` app.js:1810 (XHR-Fortschritt) | — | — | Client | | ✓ API |
| `◉ kv Frei auf der SD-Karte` | | E: `renderUpload` app.js:1717 | Dateisystem | GET `/local/folders` → `free` (statfs) − `reserve` (512 MB, up.ts:29) | — | | ✓ API |
| `▶ Auswahl leeren` | | E: app.js:1910 | — | — | Client | | ✓ API |
| `▶ Hochladen` | primary | E: `uploadOne` app.js:1793 | `media/<cat>/<artist>/<album>/<pfad>` | — | PUT `/api/eltern/local/upload?category&artist&album&path` up.ts:110 (eine Datei je Request, `.part` + rename) | mp3/flac/wav/wma/ogg/m4a + jpg/jpeg/jfif/png/webp; höchstens 4 GB je Datei; 507 unter 512 MB Reserve; `changed()` → `/api/data-version.local` → das Display lädt neu; **kein** data.json-Eintrag; A: keine Entsprechung (nur Samba/FTP) | ✓ API |

### Bibliothek › Spotify [spotify]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `◉ kv Status (Verbindung)` | ✓ Verbunden | E: `loadSync` app.js:3515 | `spotify.clientId/refreshToken/tokenScopes` | GET `/api/spotify-sync/status` ss.ts:34 → `token.configured/scopes_ok` | — | Token-Store = **dieselben** `spotify.*`-Tokens wie beim Player (`config-loader.ts:51`) | ✓ API |
| `▶ Trennen` | ghost | E: `disconnectSpotify` app.js:3760 | `spotify.accessToken/refreshToken=''`, `tokenScopes=[]` | — | POST `/api/eltern/spotify-oauth/disconnect` r.ts:388 → `clearSpotifyTokens` oauth.ts:188 | trennt auch den **Player**: beim nächsten `setting_update.sh` und Player-Neustart bekommt `spotifycontroller-main/config/config.json` leere Tokens | ✓ API |
| `▶ Smart-Sync deaktivieren` | ghost | E: `toggleSync(false)` app.js:3739 | `spotify_sync.enabled` | /status `enabled` | POST `/api/spotify-sync/config {enabled:false}` ss.ts:138 | sperrt auch den manuellen Sync (sched.ts:97) | ✓ API |
| `◉ kv Letzter Sync / Status / Nächster Sync / Präfix / Zuletzt` | | E: loadSync app.js:3523–3538 | `/tmp/.spotify_sync_state.json` (`state-file.ts:9`, nach Neustart weg) + `spotify_sync.playlist_prefix` | /status → `state.last_sync_end`, `last_sync_status`, `next_scheduled_sync`, `playlist_prefix`, `additions/updates/removals_count` | — | | ✓ API |
| `▶ Jetzt synchronisieren` | primary | E: `triggerSync` app.js:3715 (Telegram `/resync`) | — | /status | POST `/api/spotify-sync/trigger?source=webapp` ss.ts:54 | 202 `queued`/`scheduled` (60 s Sperre, danach läuft er von selbst), 409 läuft schon, 400 `disabled` | ✓ API |
| `◉ Gefundene Playlists` | Liste | E: app.js:3561 | Sync-State | /status `state.playlists_seen[{name, items}]` | — | | ✓ API |
| `◉ Konflikte` | Liste | E: app.js:3571 | Sync-State `state.conflicts[]` | /status | „Vom Sync verwalten lassen“: POST `/api/spotify-sync/conflicts/promote` ss.ts:86 (data.json `source`→spotify-sync) | im Prototyp fehlt der Knopf dafür | ✓ API |
| `spId` | Client ID | A: spotify.php:154 → `saveIDs` :93 (+ `setting_update.sh` :121); E: nur im Assistenten | `spotify.clientId` | GET `/api/spotify/config` s.ts:3019 (`clientId`) | POST `/api/eltern/spotify-credentials` r.ts:1763 (16–64 Zeichen, nur Buchstaben/Ziffern) | Node ruft **kein** `setting_update.sh` auf → der Player bekommt die ID erst beim nächsten `setting_update.sh` + Neustart | ✓ API |
| `spSecret` | Client Secret | A: spotify.php:163 (steht im Klartext da) → :93; E: /spotify-credentials (optional) | `spotify.clientSecret` | über Node nicht lesbar (`/api/config` blendet Geheimnisse aus) → nur „gesetzt / nicht gesetzt“ zeigen | POST /spotify-credentials | ein leerer Wert **überschreibt** das Secret mit `''` (r.ts:1782) | ✓ API |
| `spAcc` | Access Token | A: spotify.php:201 (nur lesen); gesetzt nur über OAuth: Link :189 → Callback :31–80 | `spotify.accessToken` (+ `tokenExpiresAt`, `tokenUpdatedAt`) | nicht über Node (ausgeblendet) | E: GET `/api/eltern/spotify-oauth/init` r.ts:305 → `/callback` r.ts:351 | Prototyp: Eingabefeld → der Code erlaubt keine Eingabe, nur anzeigen/neu anmelden. PHP-Callback setzt `spotify.active=true` und ruft `setting_update.sh` + `spotify_restart.sh` auf; der Node-Callback tut **beides nicht** | ✓ API |
| `spRef` | Refresh Token | A: spotify.php:210 (nur lesen), s.o. | `spotify.refreshToken` (+ `tokenScopes`) | dto. | dto. | dto. | ✓ API |
| `spPl` | Playlists verarbeiten | A: spotify.php:237 → :100 (Umschalt-Knopf, **umgekehrt**) | `spotify.disableScraperForPlaylists` (true = aus) | PHP / `/api/config` | POST `/api/eltern/spotify-access/playlists {enabled}` (GET `/spotify-access` → `processPlaylists`) | wird pro Request live gelesen (s.ts:3048), kein Neustart | ✓ API |
| `▶ Metadaten-Cache leeren` | ghost | A: spotify.php:12/252 `sudo rm -r …/Sonos-Kids-Controller-master/cache/*` | `cache/` | — | POST `/api/eltern/spotify-access/clear-cache` | PHP löscht das **ganze** Cache-Verzeichnis (auch `online-covers/` mit Funden und Verworfen-Liste, `nas-folders.json`, `cover-shapes.json`); die App löscht nur die Spotify-Teile `spotify/`, `spotify-api/`, `covers/`, `home-lists.json` | ✓ API |
| `▶ Spotify-Zugang zurücksetzen` | danger | A: spotify.php:106/268 | `spotify.username/password/deviceId/accessToken/refreshToken/clientId/clientSecret=''`; `cache/*`; Inhalt von `spotify.cachepath` (`/home/dietpi/.cache/spotify`, u. a. librespot `credentials.json`) | — | POST `/api/eltern/spotify-access/reset` (+ `setting_update.sh`, Neustart nur des Players) | Spotify Connect braucht danach eine neue librespot-OAuth-Anmeldung | ✓ API |

### Bibliothek › Spotify › Sync-Einstellungen [syncopt]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `prefix` | Playlist-Präfix | E: `#settings-prefix`, `loadSettings` app.js:3780 / `saveSettings` app.js:3800 | `spotify_sync.playlist_prefix` (Standard „MuPiBox“, types.ts:77) | GET `/api/spotify-sync/config` ss.ts:69 | POST `/api/spotify-sync/config` ss.ts:138 | Server: mindestens 2 Zeichen; Client: 2–30 | ✓ API |
| `◉ Vorbelegung mit dem Box-Namen` | (Hilfetext) | – | `mupibox.boxName` | GET `/api/eltern/bootscreen` r.ts:1675 (liefert `boxName`) | — | Neue App: leerer Präfix wird mit dem Box-Namen vorbelegt | ✓ API |
| `syncInt` | Minuten zwischen Syncs 5–60 | E: `#settings-interval` (Zahl 5–60) | `spotify_sync.polling_interval_seconds` = min×60 (Standard 900) | GET /config | POST /config | Server begrenzt auf 300–3600 s (types.ts:113); gilt ab dem **nächsten** Scheduler-Durchlauf | ✓ API |
| `syncOn` | Automatischer Sync | E: `#settings-enabled` | `spotify_sync.enabled` (Standard false) | GET /config | POST /config | Prototyp sagt „manuell bleibt möglich“ → **falsch**: aus sperrt auch Knopf und Telegram-`/resync` (sched.ts:97) | ✓ API |

### Bibliothek › Spotify › Spotify einrichten [wizard]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `▶ developer.spotify.com öffnen` | Schritt 1 | E: Assistent Schritt 1 (html:1025, Link im i18n-Text); A: spotify.php Schritt 1 | — | — | Link | | ✓ API |
| `◉ kv App name / Description / Redirect URI` | Schritt 2 | E: html:1034–1052, `updateWizardRedirectUri` app.js:3855 | — | App name = `#wizard-box-name` (fester Beispiel-Boxname als Standard), Description fest „MuPiBox Smart-Sync“, URI = `<protocol>//<host>/api/eltern/spotify-oauth/callback` | — | Prototyp-URI `http://mupibox.local/api/spotify/callback` gibt es **nicht**. Mit der App auf Port 80 ändert sich die URI (in der Spotify-App neu eintragen). PHP nutzt `https://<host>/spotify.php`. Spotify nimmt für Nicht-Loopback-URIs nur noch HTTPS an → prüfen | ✓ API |
| `▶ Kopieren` | Schritt 2 | E: `.copy-btn` (Zwischenablage) | — | — | Client | | ✓ API |
| `wzClient` | Client ID | E: `#wizard-client-id`, `wizardSaveClientId` app.js:3868 | `spotify.clientId` | — | POST `/api/eltern/spotify-credentials {clientId, clientSecret:''}` r.ts:1763 | schickt **immer** `clientSecret:''` (app.js:3877) → ein vorhandenes Secret wird gelöscht; s. Lücken | ✓ API |
| `▶ Speichern + weiter` | Schritt 3 | E: dto. → Schritt 4 | dto. | — | dto. | | ✓ API |
| `▶ Mit Spotify verbinden` | Schritt 4 | E: `wizardConnectSpotify` app.js:3889 → `connectSpotify` app.js:3749 | `spotify.accessToken/refreshToken/tokenExpiresAt/tokenUpdatedAt/tokenScopes` | — | GET `/api/eltern/spotify-oauth/init` r.ts:305 → Spotify → GET `/callback` r.ts:351 → Redirect `?spotify_connected=1` | ohne Client ID: 400 `no_client_id`; `state` ist 10 min gültig (oauth.ts:28); kein `setting_update.sh`/Player-Neustart | ✓ API |
| `prefix` | Schritt 5 | E: `#wizard-box-name` | `spotify_sync.playlist_prefix` | — | mit „Fertig“ | Client: mindestens 2 Zeichen | ✓ API |
| `▶ Fertig` | Schritt 5 | E: `wizardFinish` app.js:3893 | `spotify_sync.enabled=true`, `playlist_prefix` | — | POST `/api/spotify-sync/config {enabled:true, playlist_prefix}` | schaltet Smart-Sync gleich mit ein | ✓ API |

### Bibliothek › NAS [nas]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `nasProf` | Profil | A: nas.php:243 (`#nas-profile-select`, gefüllt über `?profile_api=list` :73) | `nas.profiles{name:{created, address, account, artistFolders, hiddenFolders, downloadFolders}}`, `nas.activeProfile` (Standard `standard`) | GET `/api/nas/profiles` s.ts:4768 | — | ein Profil speichert **Ordnerauswahl + Adresse/Konto, kein Passwort** (Prototyp-Text falsch); Laden nur bei gleichem NAS/Konto | ✓ API |
| `▶ Profil anlegen` | ghost | A: nas.php:244/865 | dto. | — | POST `/api/nas/profiles/create {name, overwrite?}` s.ts:4799 | Name 1–40 Zeichen (Buchstaben/Ziffern/` .()-`) | ✓ API |
| `▶ Laden` | ghost | A: nas.php:866 | setzt `nas.artistFolders/hiddenFolders/downloadFolders` | — | POST `/api/nas/profiles/load {name}` s.ts:4829 (braucht NAS-Login; fehlende Ordner → `remove-missing` s.ts:4876, nas.php:1023) | `different_login`, wenn anderes NAS/Konto | ✓ API |
| `▶ Löschen` | danger | A: nas.php:867 | dto. | — | POST `/api/nas/profiles/delete {name}` s.ts:4914 | `standard` ist nicht löschbar | ✓ API |
| `nasHost` | Server | A: nas.php:292 (`nas_address`) + Checkbox HTTPS :310 | `nas.address` (z. B. `10.4.1.51:5005`, WebDAV), `nas.https` | PHP aus `cfg` (`$lastNas`) | POST `/api/nas/login` s.ts:4945 | Prototyp ohne HTTPS-Schalter, „Anmeldung merken“ (:316) und Zertifikats-Bestätigung (`certFingerprint`, :331) | ✓ API |
| `nasShare` | Freigabe | – | gibt es nicht: Anmeldung per WebDAV mit Adresse + Konto; Freigaben sind die obersten Ordner im Baum | — | — | Neue App: Feld entfällt (die Adresse enthält Port und ggf. Pfad) | ✓ API |
| `nasUser` | Benutzer | A: nas.php:298 | `nas.account` | PHP | /api/nas/login | | ✓ API |
| `nasPw` | Passwort | A: nas.php:304 | `nas.password` (AES-256-GCM `enc:v1:`, Schlüssel aus der CPU-Seriennummer, s.ts:4604ff) – nur mit `rememberMe` | wird nie zurückgegeben | /api/nas/login | eine Backup-Kopie auf einer anderen Box kann es nicht entschlüsseln | ✓ API |
| `▶ Anmelden` | primary | A: nas.php:116–150 (`nas_signin`) | Sitzung im RAM (`nasSessionCache`); mit `rememberMe` Login in `cfg.nas` | — | POST `/api/nas/login {address, https, account, password, rememberMe, certFingerprint}` s.ts:4945 | Timeout 25 s; bei selbstsigniertem Zertifikat kommt ein Fingerprint zur Bestätigung zurück | ✓ API |
| `▶ Abmelden` | ghost | A: nas.php:434 `?relogin=1` zeigt nur das Login-Formular | — | — | – | POST `/api/nas/logout` verwirft die Sitzung **und** das gespeicherte Passwort (sonst meldet sich die Box sofort wieder an); Adresse und Konto bleiben. Neue App: GET `/api/nas/state` für den Anmeldestand | ✓ API |
| `nasFilter` | Ordner filtern | A: nas.php:265, JS `runIndexSearch` :601 | Index `/home/dietpi/.mupibox/nas-folder-index.json` (ohne Knopf täglich neu) | GET `/api/nas/index/search?q=` s.ts:5115; ohne Index: Baum über `/api/nas/browse` durchsuchen | — | | ✓ API |
| `◉ checks` | Baum: Anzeigen / Ausblenden / Herunterladen | A: nas.php:715–850 (`artist_folders[]`, `hide_folders[]`, `download_folders[]`) | `nas.artistFolders`, `nas.hiddenFolders`, `nas.downloadFolders` | GET `/api/nas/browse?path=` s.ts:5142 → `isMarked, isHidden, isDownload, isDownloaded` | (über „Auswahl speichern“) | Anzeigen und Ausblenden schließen sich aus (Ausblenden gewinnt) | ✓ API |
| `▶ Index aktualisieren` | ghost | A: nas.php:268/705 | Index-Datei (s.o.) | GET `/api/nas/index/status` s.ts:5088 | POST `/api/nas/index/refresh` s.ts:5105 | läuft im Hintergrund | ✓ API |
| `▶ Nur Auswahl anzeigen` | ghost | A: nas.php:409/644 | — | Client (lädt die Pfade der gespeicherten Auswahl über browse nach) | — | | ✓ API |
| `▶ Alle` / `▶ Keine` | ghost | A: nas.php:410/411 | — | — | Client (Häkchen „Anzeigen“) | | ✓ API |
| `▶ Auswahl speichern` | primary | A: nas.php:412 → Handler :155–174 | `nas.artistFolders/hiddenFolders/downloadFolders` + aktives Profil (`nasTrackActiveProfile`) | — | POST `/api/nas/selection {shown, show, hide, download}` s.ts:5183 (ein einziger Config-Write) | der NAS-Reiter der Box liest live | ✓ API |
| `▶ Alle Downloads` / `▶ Keine Downloads` | ghost | A: nas.php:413/414 | — | — | Client (Häkchen „Herunterladen“) | | ✓ API |
| `▶ Ausgewählte herunterladen` | ghost | A: nas.php:415 → Speichern + :176 | Ziel `/home/dietpi/MuPiBox/media/NAS` (s.ts:3931, Marker `.mupibox-nas-download`) | GET `/api/nas/download/status` s.ts:6432 (nas.php:1157); Abbrechen POST `/api/nas/download/cancel` s.ts:6326 | POST `/api/nas/selection` + POST `/api/nas/download/sync` s.ts:6337 | löscht **lokale Kopien** der nicht angehakten Ordner (Rückfrage :415); 512 MB Reserve | ✓ API |
| `▶ Cover neu laden` | ghost | A: nas.php:416/1104 | Thumbnails + Cover heruntergeladener Ordner | — | POST `/api/nas/covers/refresh` s.ts:6411 (PHP-Timeout 240 s) | | ✓ API |

### Bibliothek › Cover [cover]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `◉ file Bild` | Datei wählen | A: cover.php:204 | — | — | Client | | ✓ API |
| `▶ Hochladen` | primary | A: cover.php:119–193 | `/var/www/cover/<name>` (lighttpd: `http://<host>/cover/<name>`) | — | PUT `/api/eltern/covers/upload?name=` (eltern/covers.ts, gleiche Prüfungen; Größe aus dem Dateikopf) | Dateiname nur `[A-Za-z0-9._-]`; jpg/jpeg/png/gif/webp; quadratisch; 300–1200 px; gleicher Name wird überschrieben. Endpoint mit denselben Prüfungen nötig; Ablage/Ausliefern klären, wenn lighttpd wegfällt | ✓ API |
| `◉ rows` (URL + Löschen) | radio-teddy.png | A: cover.php:296–316 (glob), Löschen :101 (`sudo rm`, Namensprüfung) | `/var/www/cover/*` | GET `/api/eltern/covers` (+ Vorschau `/covers/file/:name`) | POST `/api/eltern/covers/delete {name}` | Adresse wie bisher `http://<host>/cover/<name>` | ✓ API |
| `covOn` | Cover online suchen | A: cover.php:236 → Handler :45–72 | `mupibox.onlineCovers` (Standard false) | PHP / `/api/config` | POST `/api/eltern/online-covers-settings {onlineCovers}` (die App startet danach `/scan`) | beim Einschalten ruft PHP nach 1 s POST `/api/online-covers/scan` auf; das Backend liest die Config live (fs.watch) | ✓ API |
| `covSave` | Auch als cover.jpg speichern | A: cover.php:239 → :45–72 | `mupibox.onlineCoversSave` | dto. | POST `/api/eltern/online-covers-settings {onlineCoversSave}` | beim Einschalten POST `/api/online-covers/save-all` s.ts:1368; nur in Ordner ohne Bild; NAS braucht Schreibrecht | ✓ API |
| `◉ kv Gefunden / Kein Treffer / Verworfen` | | A: cover.php:212–245 (zählt `entries.status`, dazu „Noch zu suchen“) | `cache/online-covers/index.json` (s.ts:91) | GET `/api/online-covers` s.ts:1346 → `entries, pending, scanning` | — | | ✓ API |
| `covDiscarded` | Auch verworfene erneut suchen | A: cover.php:249 | — (nur Parameter) | — | `alsoRejected` bei retry | | ✓ API |
| `▶ Ohne Treffer erneut suchen` | ghost | A: cover.php:251 → :85 | dto. | — | POST `/api/online-covers/retry {alsoRejected}` s.ts:1399, danach `/scan` | | ✓ API |
| `▶ Alle Alben jetzt suchen` | primary | A: cover.php:255 (nur wenn `covOn`) → :93 | dto. | — | POST `/api/online-covers/scan` s.ts:1354 | Hintergrund-Scan, schickt Ordnernamen an iTunes/Deezer; läuft auch 3 min nach dem Start und alle 6 h (s.ts:1343f) | ✓ API |
| `◉ Zuletzt gefunden` (+ Verwerfen) | Liste | A: cover.php:267–290 | dto. (`status='found'`, nach `at` sortiert, online-covers.ts:215) | Bild GET `/api/online-cover/:file` s.ts:1217 (ohne localOnly) | Verwerfen POST `/api/online-covers/reject {key}` s.ts:1358 (löscht auch ein gespeichertes cover.jpg) | | ✓ API |
| `▶ (fehlt im Prototyp) Übrige gefundene speichern` | | A: cover.php:261 → :78 | dto. | — | POST `/api/online-covers/save-all` | nur sichtbar, wenn `covSave` an ist und noch Cover fehlen | ✓ API |

---

### Lücken und Auffälligkeiten (Teil 1)

**⚙ PHP → neuer Endpoint nötig**
1. `start ◉ Update verfügbar`: Abfrage von GitHub `version.json` mit 1-h-Cache (index.php:10/34) als Endpoint, gegen `mupibox.version` vergleichen.
2. `spielzeit resetHour`: POST `/api/eltern/caps-config` (r.ts:478) um `playtimeLimit.resetHour` (ganze Zahl 0–23) erweitern. GET liefert den Wert schon.
3. `spotify spPl`: Endpoint schreibt `spotify.disableScraperForPlaylists` (umgekehrt). Kein Neustart nötig.
4. `spotify ▶ Metadaten-Cache leeren`: Endpoint anlegen und dabei **nur** `cache/spotify` + `cache/spotify-api` leeren. Das heutige `rm -r cache/*` löscht zu viel (s. Auffälligkeiten).
5. `spotify ▶ Zugang zurücksetzen`: Logik aus spotify.php:106–127 übernehmen (Felder leeren, `remove_config_cache_dir(spotify.cachepath)`, `setting_update.sh`, `spotify_restart.sh`).
6. `cover ◉ Bild / ▶ Hochladen / ◉ rows+Löschen`: Upload-, Liste- und Lösch-Endpoint für `/var/www/cover`. Prüfungen aus cover.php:119–171 übernehmen.
7. `cover covOn / covSave`: Endpoint schreibt `mupibox.onlineCovers` / `onlineCoversSave`. Beim Einschalten `scan` bzw. `save-all` anstoßen, wie PHP.

**✓ API° → nur den Guard umstellen (`localOnly` → `localOrElternSession`)**
8. Alle NAS-Endpoints (`/api/nas/profiles*`, `login`, `index/*`, `browse`, `selection`, `mark`, `download/*`, `covers/refresh`) und alle `/api/online-covers*`. `/api/nas/artists|children` und `/api/online-cover/:file` sind schon offen.

**＋ neu**
9. `start ◉ Kategorie` im „Läuft gerade“: /playback liefert nur `source`. Kategorie im Client aus data.json ermitteln oder den Endpoint erweitern.
10. `start ◉ Fortschritt lokal/NAS/Radio`: mplayer liefert keine Position/Dauer (r.ts:1135–1152). Player-`/local` erweitern.
11. `start ◉ Ruhezeit „ab …“`: Den nächsten Fensterbeginn liefert niemand. Im Client aus caps-config ausrechnen oder `/tmp/playtime.json` erweitern.
12. `start ▶ Hinweis schließen`: nur Client (localStorage).
13. `hoeren ◉ Lokale Ordner` + `▶ lokalen Ordner abspielen`: Daten über `/api/library/*` einbinden, dazu eine neue Route `/api/eltern/library/play-local {path}` → Player `musicsearch/library/album/<a:b:c>`.
14. `bibliothek ◉ Lokale Ordner in der Liste` + `▶ Lokalen Ordner löschen/bearbeiten`: Liste aus `/api/library/*` zusammenführen. Löschen über eine Proxy-Route auf den Player (`deletelocal`, sc.js:2540). Umbenennen gibt es nirgends.
15. `syncopt ◉ Präfix mit Box-Namen vorbelegen`: `mupibox.boxName` gibt es schon (r.ts:1690). Im Client vorbelegen.
16. `nas nasShare`: kein Gegenstück, WebDAV-Login ohne Freigabe. Empfehlung: streichen.
17. `nas ▶ Abmelden`: echter Logout-Endpoint fehlt. PHP zeigt nur das Formular neu, Sitzung und gespeichertes Passwort bleiben.

**Bugs / Widersprüche im heutigen Code**
- **Hörschutz-Cap:** mupi.php:501 speichert `mupibox.maxVolume` als String (`$_POST`). r.ts:800/827 akzeptiert nur Zahlen → Cap = 100 %. Die Eltern-App begrenzt dann nicht und zeigt keine Marke. Dazu kommen zwei Schlüssel für den Startwert: PHP nutzt `mupibox.startVolume` (mupi.php:616), Node `mupibox.startupVolume` (r.ts:801, s.ts:~7200).
- **Spotify-Tokens gemeinsam:** Smart-Sync und Player nutzen dieselben `spotify.clientId/clientSecret/accessToken/refreshToken`. Der Player liest aber seine Kopie `spotifycontroller-main/config/config.json` nur beim Start ein (`sc.js:175`, kopiert von `setting_update.sh`). Node-Schreibwege (Assistent, OAuth-Callback, Trennen) rufen weder `setting_update.sh` noch `spotify_restart.sh` → der Player merkt die Änderung erst später. „Trennen“ legt beim nächsten `setting_update.sh` den Player lahm.
- **Assistent löscht das Client Secret:** `wizardSaveClientId` schickt immer `clientSecret:''` (app.js:3877) → r.ts:1782 überschreibt ein vorhandenes Secret. Danach tauscht `exchangeCodeForTokens` ohne Secret und ohne PKCE-`code_verifier` (oauth.ts:132–137). Spotify dürfte das mit `invalid_client` ablehnen (**? auf der Box prüfen**). Auch das PHP-OAuth braucht das Secret.
- **Redirect URI:** Der Prototyp nennt `http://mupibox.local/api/spotify/callback`, der Code nutzt `http(s)://<host>/api/eltern/spotify-oauth/callback` (Node) bzw. `https://<host>/spotify.php` (PHP). Spotify nimmt für Nicht-Loopback-URIs nur noch HTTPS an → für die Port-80-App klären.
- **Sync aus = auch manuell aus:** `triggerManualSync` gibt `disabled` zurück (sched.ts:97). Die Prototyp-Texte „manuell bleibt möglich“ und „Manuell (Knopf oder Telegram /resync) geht immer“ stimmen nicht. Folge: Mit Sync aus landen Such-Hinzufügungen und Abos **nie** auf der Box, und die App meldet nur „deaktiviert“.
- **„Metadaten-Cache leeren“ löscht zu viel:** spotify.php:13 `rm -r cache/*` leert auch Cover-Cache, Online-Cover-Index (inkl. verworfener Cover, die danach wiederkommen), `home-lists.json`, `nas-folders.json`, `cover-shapes.json`.
- **Bibliothek bearbeiten/löschen per `index`:** Die Eltern-App schickt das in data.json gespeicherte Feld `item.index` (app.js:513/528). `/api/add` setzt kein `index` (s.ts:2604), `/api/delete` nummeriert nicht neu (s.ts:2961), nur der Smart-Sync nummeriert (`apply.ts:148`) → neue manuelle Einträge scheitern mit „bad index“, nach einem Löschen gibt es 409 bis zum nächsten Sync (**? auf der Box prüfen**). Besser die Array-Position senden.
- **Link einfügen meldet falschen Erfolg:** `/api/add` antwortet bei `locked`/`error` mit HTTP 200. `submitLibraryAdd` prüft nur `res.ok` (app.js:652).
- **Link einfügen schreibt https auf http um:** Radio-/RSS-URLs werden von `https://` auf `http://` umgeschrieben (app.js:638/643). Das bricht Streams, die nur HTTPS können.
- **Offene Schreib-Endpoints:** `/api/add`, `/api/edit`, `/api/delete` und `/api/spotify/search` haben keine Session- und CSRF-Prüfung. Sie sind nur über `browserGuard` geschützt. Die neuen Bibliotheks-Aktionen sollten über `/api/eltern/*` laufen.
- **Schlaftimer:** PHP startet einen zweiten Timer, ohne den alten zu beenden (parental.php:28, Node macht es richtig: r.ts:744). Prototyp 15–360 min, der Code erlaubt 1–1440.
- **Ruhezeit-Regeln:** Node prüft weniger als PHP: from≠to, Duplikate und 15-min-Raster fehlen, Label ≤80 statt ≤60. `from==to` wird vom Player still ignoriert.
- **Hilfetexte in parental.php:235/308:** „the player is restarted automatically“ stimmt nicht mehr (fs.watch). Jeder Parental-Save ruft trotzdem `setting_update.sh` (parental.php:137), unnötig.
- **Hör-Verlauf „Heute“:** zählt ab Mitternacht, die Spielzeit ab `resetHour` → die Zahlen können sich widersprechen. Die Woche besteht aus 168 h auf 7 Kalendertagen, der erste Balken ist deshalb zu klein.
- **Verwaltet „Folge von/bis“:** bedeutet die Position nach Erscheinungsdatum (ss.ts:213), nicht die Folgennummer. Das sollte im Hilfetext stehen.
- **Suche „Titel +“:** fügt das ganze Album hinzu (app.js:1101). Einen einzelnen Titel hinzuzufügen gibt es nicht.
- **NAS-Profil:** Laut Prototyp speichert ein Profil „Server, Freigabe und Zugangsdaten“. Tatsächlich speichert es nur die Ordnerauswahl plus Adresse/Konto, ohne Passwort. Laden geht nur beim selben NAS-Login.
- **NAS-Download:** „Ausgewählte herunterladen“ löscht lokale Kopien der nicht angehakten Ordner. Dafür braucht es eine Rückfrage wie in nas.php:415.
- **Im Prototyp fehlen vorhandene Funktionen:** Konflikt „Vom Sync verwalten lassen“ (ss.ts:86), NAS-HTTPS/„Anmeldung merken“/Zertifikat bestätigen, NAS `remove-missing` beim Profil-Laden, Cover „Übrige gefundene speichern“ (save-all), Download-Fortschritt/-Abbrechen.
- **Eltern-App zeigt keine Grace-Auswahl:** `limitGrace` und `quietGrace` sind nur im PHP wählbar, obwohl der Node-Endpoint sie annimmt.

## Teil 2: Aussehen, Display & Bedienung, Audio, Akku & Strom

Abkürzungen: `A:` = alte Admin-Oberfläche (PHP, Port 80), `E:` = Eltern-WebApp (Port 8200, `app.js`). Routen der WebApp liegen unter `/api/eltern/*` in `src/backend-api/src/eltern/routes.ts` (hier kurz `routes.ts:NNN`), übrige unter `/api/*` in `server.ts`. Konfig = `/etc/mupibox/mupiboxconfig.json`. PHP-Speicherstufen: `change=1` = `save_mupiboxconfig` + `setting_update.sh` + `restart_kiosk.sh`, `change=2` = speichern + `setting_update.sh` (mupi.php:706–718). Node schreibt über `updateMupiboxConfig()` (server.ts:1552): nur Konfig, **kein** `setting_update.sh`, kein Kiosk-Neustart.

### Einstellungen › Aussehen › Theme [theme]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| ◉ themegrid | Theme-Kacheln | A: mupi.php:736 (Select + Vorschaubild :767); E: `loadTheme()` app.js:2683 | `mupibox.installedThemes`, Namen aus `/home/dietpi/MuPiBox/themes/km-themes.json` | GET `/theme` routes.ts:1503 (current, available, labels/labelsDe, stage), Bild GET `/theme-preview/:name` routes.ts:1644 (`/var/www/images/<n>.png` bzw. `km/<n>.svg`) | — | Liste = installierte Themes (Repo: 68 css, km-themes.json 67) | ✓ API |
| `theme` | Alle 67 Themes | A: mupi.php:736 → Handler :348 (`mupiset`); E: `applyTheme()` app.js:2939 | `mupibox.theme` + Symlink `www/active_theme.css` → `themes/<t>.css` | GET `/theme` | E: POST `/theme` routes.ts:1550 (Whitelist installedThemes, Symlink selbst); danach optional POST `/display/reload-theme` routes.ts:1620 → Player `/display/reload-theme`. A: change=1 → setting_update.sh (setzt Symlink) + restart_kiosk | A: voller Display-Neustart. E: weicher Stylesheet-Tausch beim nächsten /local-Poll (2–10 s). Wechsel von/zu `coverflow` braucht vollen Reload (swiper.component.ts:191 liest Theme nur einmal) | ✓ API |

> Neue App (eltern/display.ts): GET/POST `/api/eltern/display-options` (Ansicht, Bedienung, Auflösung, Helligkeit
> `mupibox.displayBrightness` + beim Start gesetzt in mupi_startup.sh, Drehung, Vorlese-Sprache), PUT `/display/background`,
> GET `/display/screenshot`, GET `/display/vnc`. Statt des Kiosk-Neustarts lädt das Display seine Seite neu
> (Player `/display/reload-page` → `pageReloadAt`); nur die Auflösung startet den Kiosk neu. `POST /bootscreen` ändert
> nur die gesendeten Felder.

### Einstellungen › Aussehen › Eigenes Theme [eigenes]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| ◉ Bild (Datei) | Hintergrundbild | A: mupi.php:911 (file input `fileToUpload`) | `/home/dietpi/MuPiBox/themes/custom-bg.jpg` (Symlink `www/theme-data/custom/custom-bg.jpg`, start_mupibox_update.sh:547) | kein Lesen/Vorschau heute | — | Wirkt nur mit Theme `custom` (custom.css:36) | ✓ API |
| ▶ Bild hochladen | Bild hochladen | A: mupi.php:912 → Handler :623 (`submitfile`) | wie oben | — | PHP: nur JPEG (getimagesize), ≠800×480 → per GD auf ≥800×480 skaliert (:644–670), `sudo mv` nach themes/ | `change=3` → kein Speichern/Kiosk-Neustart; Display zeigt Bild erst nach Reload. Neu: Upload-Endpoint (multipart, JPEG-Prüfung, Skalierung z. B. sharp) + `/display/reload-theme` | ✓ API |

### Einstellungen › Aussehen › Ansicht [ansicht]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `stage` | Cover-Flow-Ansicht (Bühne) | A: mupi.php:797 → :375 (nur wenn `kmStageShown`); E: `showThemeStage()`/`saveThemeStage()` app.js:2913/2927 | `mupibox.themeStage` (bool) | GET `/theme` (`stage`) | E: POST `/theme-stage` {stage} routes.ts:1588 → Player reload-theme; A: change=1 | Nur für Kinder-(km-)Themes wirksam/angezeigt (A: km + legacy, E: nur km-Labels). Box: km-theme.service.ts:47 `refresh()` – live | ✓ API |
| `names` | Ordner- und Albumnamen anzeigen | A: mupi.php:788 → :364 | `mupibox.coverflowShowNames` (bool) | `/api/config` (Box, swiper.component.ts:194) | nur PHP, change=1 | Nur beim Theme `coverflow` sichtbar/wirksam (swiper.component.html:16); Box liest nur beim Start → Kiosk-Reload nötig. Prototyp-Standard „an“, Code-Standard false. Neu: Endpoint (z. B. `/theme-stage` um `names` erweitern) + Display-Reload | ✓ API |
| `hideScroll` | Horizontale Scrollleiste ausblenden | A: mupi.php:781 → :354 | `mupibox.hideScrollbar` (bool) | `/api/config` (swiper.component.ts:193) | nur PHP, change=1 | Box liest nur beim Start → Kiosk-Reload. Prototyp-Standard „an“, Code false. Neu: wie `names` | ✓ API |

### Einstellungen › Aussehen › Vorlesen [vorlesen]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `tts` | Namen beim Anhalten vorlesen | A: mupi.php:803 → :375; E: app.js:2924 (`theme-autoread-toggle`) | `mupibox.themeStageAutoRead` (bool) | GET `/theme` (`stageAutoRead`) | E: POST `/theme-stage` {autoRead} routes.ts:1588; A: change=1 | Wirkt nur wenn `themeStage` an **und** km-Theme (km-theme.service.ts:27). Prototyp zeigt es unabhängig | ✓ API |
| `ttsLang` | Vorlese-Sprache | A: mupi.php:833 → :388 | `mupibox.ttsLanguage` (ISO 639-1); Liste `mupibox.googlettslanguages` (21 Einträge ✓) | PHP aus Konfig | PHP: speichern, `sudo rm /home/dietpi/MuPiBox/tts_files/*.mp3`, change=1 → setting_update.sh kopiert nach spotifycontroller `config.json .ttsLanguage` | Player liest `config.json` nur beim Start (spotify-control.js:160) → `pm2 restart spotify-control` nötig (PHP sagt „reboot“). Neu: Endpoint mit Whitelist, Cache löschen, setting_update, pm2-Restart | ✓ API |

### Einstellungen › Aussehen › Start- und Wartungsbilder [startbilder]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| ◉ bootgrid | Startbild | A: mupi.php:965 → :546 (`bootscreen_save`); E: `loadBootscreen()`/`saveBootscreen()` app.js:2735/2894 | `mupibox.bootscreen` ('' = Standard `karte`, `random`, Szenen-Id) | GET `/bootscreen` routes.ts:1675; Bilder GET `/bootscreen-scene/:id/scene` routes.ts:1739 | POST `/bootscreen` routes.ts:1699 → `sudo bootscreen_update.sh` im Hintergrund | Sichtbar ab nächstem Start. bootscreens.json hat **16** Szenen (+Zufall), Prototyp sagt 15 | ✓ API |
| `maint` | Wartungsbild | A: mupi.php:984; E: `#bs-maint` | `mupibox.maintenanceScreen` ('same' \| Id) – 17 Optionen ✓ | GET `/bootscreen` | POST `/bootscreen` | ⚠ POST setzt immer alle 4 Felder: fehlt `boxName`/`bootscreenLanguage` im Body → Name wird '' und Sprache 'en'. Neue App muss Name ([ueber]) + Sprache ([sprache]) mitsenden oder Endpoint auf Teil-Update umbauen | ✓ API |
| `bsKind` | Vorschau | A: mupi.php:997 (nur Vorschau); E: `#bs-kind`, `bsUpdate()` app.js:2869 | — (nicht gespeichert) | Texte aus `screens.texts[kind][lang]` (GET `/bootscreen`), Bild `/bootscreen-scene/:id/{maintenance\|goodbye\|battery}` | — | reine UI-Auswahl (update/install/wlan/goodbye/battery) | ✓ API |
| ◉ bootprev | Vorschau Start-/Wartungsbild | A: mupi.php:1007/1009 + JS :1016; E: `bsPlaceName`/`bsPlaceMaint` app.js:2826/2845 | — | GET `/bootscreen` + `/bootscreen-scene` | — | Client-seitig gerendert | ✓ API |

### Einstellungen › Aussehen › Texte auf dem Display [displaytexte]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `dtScreen` | Bildschirm | A: mupi.php:1132 (`dt_screen`, nur UI); E: keine Auswahl (alle 8 Felder untereinander, im Caps-Screen) | — (nicht gespeichert) | — | — | reine UI (blocked/quiet/parents) | ✓ API |
| ◉ dtprev | Vorschau | A: iframe `http://<host>:8200/text-preview?screen=…` + postMessage `mupibox-display-texts` (mupi.php:1139/1178); E: keine Vorschau | — | Box-Frontend-Route `/text-preview` (frontend-box app.routes.ts:14, app.component.ts:36) | — | Gleicher Origin wie neue App (8200) → direkt einbettbar | ✓ API |
| ◉ dtfields | Textfelder (8) | A: mupi.php:1150; E: `loadDisplayTexts()` app.js:867 | `displayTexts.{blockedHeading, blockedSubheading, quietHeading, quietSubheading, parentsTitle, parentsHint, parentsCountdown, parentsClose}` (max. 120 Z.) | GET `/display-texts` routes.ts:399; Platzhalter aus `/assets/i18n/display-texts.json` | — | Sprache der Platzhalter = `displayLanguage` (neu auf [sprache]) | ✓ API |
| ▶ Texte speichern | Texte speichern | A: mupi.php:1210 → :577 (`displaytexts_save`, change=2); E: `saveDisplayTexts()` app.js:922 | `displayTexts`, `displayLanguage` | — | POST `/display-texts` {texts, language?} routes.ts:409 | ⚠ `texts` ersetzt das ganze Objekt (routes.ts:434) → immer alle 8 Felder senden, sonst gehen die anderen Bildschirme verloren. Wirkt beim nächsten Overlay | ✓ API |

### Einstellungen › Display & Bedienung › Display [displaysettings]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `bright` | Helligkeit | A: mupi.php:1248 → :288 (`displayset`) | `/sys/class/backlight/*/brightness` (0–255), **nicht** in Konfig | `cat /sys/class/backlight/*/brightness` (mupi.php:1222) | `sudo su - -c 'echo N > …/brightness'` (:318) | Nur 6 Stufen 0/20/…/100 % → 0/51/…/255; andere Werte (Prototyp Schritt 5) → 255. Geht beim Neustart verloren. Neu: Endpoint (linear 0–100→0–255) + Konfig-Key + Wiederherstellen beim Boot | ✓ API |
| `dispOff` | Display aus nach | A: mupi.php:1335 → :512 (0–120, Schritt 1); E: `savePowerConfig()` app.js:3285 (Akku-Screen, 0–1440) | `timeout.idleDisplayOff` (String, Minuten) | GET `/power-config` routes.ts:580 | POST `/power-config` {idleDisplayOff} routes.ts:610 (0–1440). A: change=2 → setting_update.sh schreibt X-`BlankTime` in 98-dietpi-disable_dpms.conf (:119) | E: **kein** setting_update → BlankTime bleibt alt; Box-DisplayManager liest nur beim Start (display-manager.service.ts:31) → Kiosk-Reload nötig, obwohl WebApp „greift sofort“ meldet. 0 = „nie“ klappt im Frontend nicht (0 → 1 min) | ✓ API |
| `hdmiRot` | HDMI-Drehung | A: mupi.php:1264 → :35 | `/boot/config.txt` `display_hdmi_rotate=` | `sed -n …display_hdmi_rotate=` (mupi.php:27) | `sudo su - dietpi -c ". dietpi-globals && G_SUDO G_CONFIG_INJECT 'display_hdmi_rotate=' …"` (:40) | Neustart nötig. ⚠ Optionen „Horizontal/Vertikal spiegeln“ (0x10000/0x20000) scheitern: `intval()` → 0 (:37) | ✓ API |
| `lcdRot` | LCD-Drehung | A: mupi.php:1285 → :45 | `/boot/config.txt` `lcd_rotate=` (0 \| 2) | `sed` (:25) | G_CONFIG_INJECT (:50) | Neustart nötig | ✓ API |
| `dlcdRot` | Display-LCD-Drehung | A: mupi.php:1306 → :55 | `/boot/config.txt` `display_lcd_rotate=` (0 \| 2) | `sed` (:26) | G_CONFIG_INJECT (:60) | Neustart nötig | ✓ API |
| `resX` | Breite X in Pixel | A: mupi.php:1344 → :604 | `chromium.resX` (String) | Konfig | PHP change=1 → setting_update + restart_kiosk | Gelesen von chromium-autostart.sh:25. Keine Zahlenprüfung in PHP | ✓ API |
| `resY` | Höhe Y in Pixel | A: mupi.php:1352 → :610 | `chromium.resY` | Konfig | wie resX | chromium-autostart.sh:26 | ✓ API |

### Einstellungen › Display & Bedienung › Bedienung am Display [bedienung]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `hideA` | Hörspiele ausblenden | A: admin.php:476 (Checkbox `hide_categories[]`) → :199 (`display_cats_save`) | `mupibox.hiddenCategories` ∋ `audiobook` | `/api/config` (home.page.ts:108) | PHP: Whitelist, mind. 1 sichtbar, change=1 → Kiosk-Neustart | Box liest nur beim Start der Home-Seite | ✓ API |
| `hideM` | Musik ausblenden | wie oben | ∋ `music` | wie oben | wie oben | – | ✓ API |
| `hideN` | NAS ausblenden | wie oben | ∋ `nas` | wie oben | wie oben | – | ✓ API |
| `hideO` | Sonstiges ausblenden | wie oben | ∋ `other` | wie oben | wie oben | Neu für alle 4: ein Endpoint `hiddenCategories` (Array) + Display-Reload | ✓ API |
| `resume` | Anzahl der Fortsetzen-Einträge | A: mupi.php:859 → :397 (1–99) | `mupibox.resume` (int) | Konfig | PHP change=1 (Kiosk-Neustart, unnötig) | Live gelesen von remove_max_resume.sh:7 (Player-Befehl `maxresume`). Template-Standard 9 ✓ | ✓ API |
| `listTimer` | Haltezeit für die Titelliste | A: mupi.php:874 → :404 (0,5–5 / 0,5) | `mupibox.listviewTimer` (float) | `/api/config` (player.page.ts:267, bei Seitenaufbau) | PHP change=1 | Template-Standard 2.5, Prototyp 2 | ✓ API |
| `setTimer` | Haltezeit für den Einstellungszugang | A: mupi.php:889 → :411 (1–10) | `mupibox.settingsAccessTimer` (float) | `/api/config` (home.page.ts:103) | PHP change=1 | Öffnet die Box-Einstellungsseite (home.page.ts:237), dort Kachel „Eltern“ mit QR – nicht direkt den QR (Prototyp-Hilfetext ungenau). Template 3, Prototyp 5 | ✓ API |

### Einstellungen › Display & Bedienung › Display live [displaylive]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| ◉ livescreen | Aktuelles Bild | A: index.php:168 (Home, „Current Screen“) | `/var/www/images/screenshot.png` | bei jedem Aufruf von index.php: `sudo -H -u dietpi DISPLAY=:0 scrot /tmp/screenshot.png` + mv (index.php:42–43) | — | Kein Node-Endpoint (scrot nur für Telegram, telegram_notify_screen.py:27). Neu: GET-Endpoint, der scrot ausführt und PNG liefert (Rate-Limit) | ✓ API |
| ▶ Aktualisieren | Aktualisieren | A: nur durch Neuladen von index.php | — | — | scrot wie oben | – | ✓ API |
| ▶ Fernsteuerung öffnen | Fernsteuerung (VNC) | A: vnc.php:14 (`<embed>` + Link `http://<host>:6080/vnc_lite.html?host=<host>&port=5900`) | Dienste `mupi_vnc` + `mupi_novnc` (an/aus in service.php:25–46, `tweaks.vnc`) | — | nur Link | Neue App: Link öffnen + Dienststatus abfragen (Endpoint `systemctl is-active mupi_novnc` fehlt) | ✓ API |
| ▶ Strg+Alt+Entf senden | Strg+Alt+Entf senden | nirgends in MuPiBox-Code; nur noVNC-eigene Oberfläche (vnc_lite) | — | — | — | Neu: eigener noVNC-Client (RFB `sendCtrlAltDel()`) in der App oder weglassen | ＋ neu |

> Neue App (eltern/hardware.ts): GET `/api/eltern/hardware`, POST `/soundcard` (dietpi-set_hardware, Neustart
> angeboten), `/rotary`, `/mupihat` (enable/disable_mupihat.sh + Neustart), `/battery` (+ mupi_hat-Neustart),
> `/mupihat/restart` (nach dem Profil), `/shim` (pressDelay, ledPin, LED-Helligkeit), `/fan` (Reihenfolge und Pins geprüft,
> `systemctl restart` statt `start`). Startlautstärke: `/audio/config` schreibt jetzt `startupVolume` **und**
> `startVolume` (nur das lesen die Skripte; vorher wirkte die Einstellung der Eltern-App nicht), „aus“ entfernt beide.

### Einstellungen › Audio › Lautstärke [lautstaerke]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `vol` | Lautstärke jetzt | A: mupi.php:1404 → :274 (`audioset`); E: `loadAudio()`/`setLiveVolume()` app.js:1952/1991 | ALSA Master (live, nicht gespeichert) | E: GET `/audio` routes.ts:779 (`amixer sget Master`); A: amixer (mupi.php:1399) | E: POST `/audio/volume` routes.ts:812 → `amixer sset Master N%`, auf maxVolume gekappt; A: `pactl set-sink-volume` (:282) **ohne** maxVolume-Kappung | Display-Lautstärkeanzeige wird nicht sofort nachgeführt (PHP-Hinweis :1397) | ✓ API |
| `volMax` | Maximum (Hörschutz) | A: mupi.php:1429 → :499 (0–100/5); E: `saveAudioConfig()` app.js:2019 (10–100) | `mupibox.maxVolume` | GET `/audio` | POST `/audio/config` {maxVolume} routes.ts:846 (10–100, Zahl); A: String, change=2 | Player liest live (fs.watch, spotify-control.js:80/2161). ⚠ PHP speichert String ("80"), Node prüft `typeof === 'number'` (routes.ts:800/827) → nach PHP-Speichern meldet WebApp 100 % und kappt nicht (Hörschutz umgangen) | ✓ API |
| `volFix` | Beim Start auf festen Wert setzen | E: `#audio-startup-enable` app.js:1975; A: kein Schalter (immer fest) | E: `mupibox.startupVolume` = null ⇒ aus; A: `mupibox.startVolume` immer gesetzt | GET `/audio` (`startupVolume`) | POST `/audio/config` {startupVolume:null\|n} | ⚠ zwei Keys: chromium-autostart.sh:106 setzt beim Boot **immer** `startVolume` (pactl); Node setzt zusätzlich `startupVolume` 1,5 s nach Start (server.ts:7197). „Aus“ in der WebApp wirkt also nicht | ✓ API |
| `volStart` | Wert beim Start | A: mupi.php:1416 → :506 (0–100/5, auf ≤ maxVolume gekappt :616); E: `#audio-startup` | A: `mupibox.startVolume` (String); E: `mupibox.startupVolume` (Zahl) | GET `/audio` | POST `/audio/config` {startupVolume} (0–100) | Auch gelesen von off_trigger.sh:18, mupi_shutdown.sh:10, shutdown_sound.sh:7. Neue App sollte beide Keys vereinheitlichen | ✓ API |

### Einstellungen › Audio › Soundkarte [soundkarte]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `sound` | Soundkarte | A: mupi.php:1372 → :326 (`audioset`) | `/boot/dietpi.txt` `CONFIG_SOUNDCARD=` + `mupibox.physicalDevice`; Liste `mupibox.AudioDevices` (28 ✓, `tname`/`ufname`) | `sed … CONFIG_SOUNDCARD=` /boot/dietpi.txt (mupi.php:1374) | `sudo /boot/dietpi/func/dietpi-set_hardware soundcard '<tname>'` (Whitelist gegen AudioDevices), change=2 | Neustart nötig. MuPiHAT an/aus überschreibt die Soundkarte (enable/disable_mupihat.sh). Vergleich nutzt `physicalDevice`, Anzeige dietpi.txt → können auseinanderlaufen. Neu: Endpoint mit Whitelist + dietpi-set_hardware | ✓ API |

### Einstellungen › Audio › Drehregler und Taster [drehregler]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `rotary` | Drehregler für die Lautstärke | A: mupi.php:1495 (Knopf `rotary_toggle`) → :435 | `rotary.active` (bool) + Dienst `mupi_rotary` | Konfig | `sudo systemctl enable`+`restart mupi_rotary` bzw. `stop`+`disable`, change=2 | GPIO 26/24 (Encoder), 10 (Taster) | ✓ API |
| `rotStep` | Schritt pro Raste | A: mupi.php:1503 → :457 (1–10, nur sichtbar wenn aktiv) | `rotary.step` (int) | rotary_control.py:56/69 (mtime-Cache → live) | PHP clamp 1–10, change=2 | live, kein Neustart | ✓ API |
| `btnFn` | Funktion des Tasters an GPIO 10 | A: mupi.php:1506 → :460 | `rotary.button` ∈ off/playpause/next/ffwd | rotary_control.py (live) | PHP Whitelist, change=2 | Code-Standard `off`, Prototyp „Play/Pause“. Neu für alle 3: Endpoint `rotary` (+ systemctl) | ✓ API |

### Einstellungen › Audio › Bluetooth [bluetooth]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `btOn` | Bluetooth | A: **zwei** Schalter: Funk an/aus bluetooth.php:173 → :83/:99, Chip bluetooth.php:254 → :106; E: nur Funk `btSetPower()` app.js:1449 | Funk: bluez-Zustand (`Powered`); Chip: `hciuart.service` maskiert/aktiv | Funk: `bluetoothctl show` (GET `/bluetooth` routes.ts:1794); Chip: `systemctl is-enabled hciuart` = masked (bluetooth.php:239) | Funk: POST `/bluetooth/power` routes.ts:1815 → start_bt.sh/stop_bt.sh; Chip: `sudo set_bluetooth_chip.sh on\|off` (mask/unmask) | Chip-Änderung braucht Neustart; ohne Chip hängt bluetoothctl (PHP prüft `/sys/class/bluetooth/hci*`, Node nur 8-s-Timeout). Controller-Name/MAC (Hinweistext) liefert nur PHP (`bluetoothctl list`, :133). Neu: kombinierter Endpoint (Chip + Funk + Neustart-Hinweis + Controller-Info) | ＋ neu |
| `btAuto` | Automatisch verbinden | A: bluetooth.php:262 → :26; E: `btSetAutoconnect()` app.js:1461 | Dienst `mupi_autoconnect_bt` | GET `/bluetooth` (`systemctl is-active`) | POST `/bluetooth/autoconnect` {enable} routes.ts:1865 (systemctl enable+start / stop+disable) | – | ✓ API |
| ◉ Gekoppelte Geräte | Gekoppelte Geräte | A: bluetooth.php:205 (+ Entfernen :214 → :44); E: `renderBtPaired()` app.js:1423, `btRemove()` :1531 | bluez | GET `/bluetooth` (`bluetoothctl devices` + `info` → connected) | Entfernen: POST `/bluetooth/remove` routes.ts:1852 (remove_bt.sh + stop/start_bt.sh) | Liste nur wenn Funk an. `devices` listet alle bekannten, nicht nur gekoppelte | ✓ API |
| ▶ Suchen | Suchen | A: bluetooth.php:179 → :75; E: `btScan()` app.js:1467 | `/tmp/bt_scan` | — | POST `/bluetooth/scan` routes.ts:1824 → scan_bt.sh (`hcitool scan`, 30-s-Timeout) | ca. 10 s | ✓ API |
| ◉ Gefundene Geräte | Neue Geräte koppeln | A: bluetooth.php:180 (Select) + Koppeln :198 → :61; E: `renderBtScan()`/`btPair()` app.js:1486/1513 | `/tmp/bt_scan` | Antwort von `/bluetooth/scan` (`found`) | Koppeln: POST `/bluetooth/pair` {mac} routes.ts:1841 → pair_bt.sh | MAC-Regex geprüft | ✓ API |

### Einstellungen › Akku & Strom › Akku [akku]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| ◉ big | Akku-Stand | A: mupihat.php:208 (Bat_SOC/Bat_Stat, 5-s-Poll über update_mupihattable.php); E: `loadPowerLive()` app.js:3209 | `/tmp/mupihat.json` (Dienst `mupi_hat`, mupihat.py) | GET `/api/mupihat` server.ts:1444 (`Bat_Percent`, Fallback `Bat_SOC`; laden = `IBus>0`; `Bat_Stat`) | — | – | ✓ API |
| ◉ kv | Akku-Spannung / USB-Spannung / Akku-Strom / Temperatur / Ladegerät | A: mupihat.php:202–210; E: app.js:3229–3234 | `/tmp/mupihat.json` (`Vbat`, `Vbus`, `Ibat`, `Temp`, `Charger_Status`) | GET `/api/mupihat` | — | – | ✓ API |
| ◉ chart | Verlauf (24 h) | E: `loadBatteryChart()` app.js:3149; A: – | `/home/dietpi/.mupibox/battery_log.jsonl` (Poller server.ts:1770, alle 60 s, 8 Tage) | GET `/battery-history?hours=24` routes.ts:1077 (auf ~120 Punkte ausgedünnt) | — | Schreibt jede Minute auf die SD-Karte (SD-Verschleiß) | ✓ API |
| ◉ note | Messpunkte / zuletzt | E: app.js:3203 (`chart.info`) | wie chart | wie chart | — | – | ✓ API |

### Einstellungen › Akku & Strom › MuPiHAT & Akku-Profil [mupihat]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `hatOn` | MuPiHAT aktiv | A: mupihat.php:224 → :96 (`activate_the_hat`) | `mupihat.hat_active` (bool) | Konfig | `sudo enable_mupihat.sh` / `disable_mupihat.sh` (config.txt-Overlays, i2c-Module, Dienste `mupi_hat`+`mupi_hat_control`, Soundkarte via `/boot/run_once.sh`), change=2 + `$reboot=1` → Neustart (footer.php:183) | Box startet neu, Soundkarte wird umgestellt. Neu: Endpoint, der die Skripte + Neustart ausführt | ✓ API |
| `battery` | Akku | A: mupihat.php:238 → :116 (`save_battery`); E: nur Anzeige `#power-profile-name` (app.js:3241) | `mupihat.selected_battery` (Name aus `mupihat.battery_types[].name`) | GET `/power-config` (`battery.selected`) | PHP: **ohne** Prüfung übernommen; bei HAT aktiv `sudo service mupi_hat restart` (change=5) | Namen im Code: „Ansmann 2S1P“, „ENERpower 2S2P 10.000mAh“, „ENERpower 2S3P 15.000mAh“, „USB-C mode (no battery)“, „Custom“. Neu: Endpoint mit Whitelist + mupi_hat-Restart | ✓ API |
| `v100` | v_100 (100 %) | A: mupihat.php:263 (nur Profil „Custom“) → :8; E: `#pwr-prof-v100` app.js:3244 | `mupihat.battery_types[<gewählt>].config.v_100` (String, mV) | GET `/power-config` (`battery.profile`) | POST `/power-config` {batteryProfile} routes.ts:610 (5000–9000) | ⚠ API ändert das **aktive** Profil (auch Standardprofile), PHP nur „Custom“ (4000–12600, streng absteigend). API: kein mupi_hat-Restart → wirkt erst nach Dienst-/Box-Neustart | ✓ API |
| `v75` | v_75 (75 %) | A: mupihat.php:281; E: nicht im UI | `…config.v_75` | GET `/power-config` | POST `/power-config` (API nimmt es an, 5000–9000) | WebApp-UI zeigt nur v_100/Warnung/Abschalten/VREG. Keine Prüfung auf absteigende Reihenfolge in der API | ✓ API |
| `v50` | v_50 (50 %) | A: mupihat.php:287; E: – | `…config.v_50` | wie oben | wie oben | wie oben | ✓ API |
| `v25` | v_25 (25 %) | A: mupihat.php:293; E: – | `…config.v_25` | wie oben | wie oben | wie oben | ✓ API |
| `v0` | v_0 (0 %) | A: mupihat.php:299; E: – | `…config.v_0` | wie oben | wie oben | wie oben | ✓ API |
| `thWarn` | Warnung (th_warning) | A: mupihat.php:305; E: `#pwr-prof-warn` | `…config.th_warning` | wie oben | POST `/power-config` (5500–8000) | PHP verlangt th_warning ≥ th_shutdown, API streng > (routes.ts:665) | ✓ API |
| `thShut` | Abschalten (th_shutdown) | A: mupihat.php:311; E: `#pwr-prof-shut` | `…config.th_shutdown` | wie oben | POST `/power-config` (5000–7500, < Warnung) | Von mupihat_bq25792.py:262 nur beim Dienststart gelesen | ✓ API |
| ◉ warn | Warnhinweis VREG | A: Hilfetext mupihat.php:317; E: Rückfrage bei > 8400 mV (app.js:3261) + `power.vregNote` | — | — | — | statischer Text, kein Endpoint nötig | ✓ API |
| `vreg` | Ladeschluss VREG (optional) | A: mupihat.php:324 (3000–18800); E: `#pwr-prof-vreg` | `…config.vreg` (leer = Chip-Standard) | GET `/power-config` | POST `/power-config` (6000–8500) | Wird beim Start von mupi_hat ins Register geschrieben (mupihat_bq25792.py:268, :5810) → erst nach Dienst-/Box-Neustart. Leeren ist per API nicht möglich (leer = ignoriert) | ✓ API |
| ▶ Profil speichern | Profil speichern | A: mupihat.php:328 → :8 (`save_custom`, bei aktivem Custom + HAT: `service mupi_hat restart`); E: `saveBatteryProfile()` app.js:3255 | s. o. | — | POST `/power-config` {batteryProfile} | Neue App sollte danach mupi_hat neu starten (fehlt in API) | ✓ API |

### Einstellungen › Akku & Strom › Automatisch ausschalten [autoaus]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `idleOff` | Ausschalten nach | A: parental.php:218 → :41 (`idletime`, 0–300 / 15, ohne Prüfung); E: `savePowerConfig()` app.js:3285 (`#power-idle-shutdown`, 0–1440 / 1) | `timeout.idlePiShutdown` (String, Minuten, 0 = nie) | GET `/power-config` routes.ts:580 | POST `/power-config` {idlePiShutdown} routes.ts:610 (0–1440) | Live: idle_shutdown.sh:27 liest alle 10 s. Prototyp 0–300 / Schritt 5 | ✓ API |

### Einstellungen › Akku & Strom › Ein-/Ausschalter und LED [taster]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `pressDelay` | Verzögerung des Ausschalt-Tasters | A: mupi.php:1539 → :518 (`powerset`, 0–5 / 0,25, ohne Prüfung) | `timeout.pressDelay` (String, s) | GET `/power-config` liefert es (routes.ts:595), POST nimmt es **nicht** an | PHP change=2 | off_trigger.sh:17 (DietPi-postboot) liest nur beim Boot → Neustart nötig. Neu: `pressDelay` in POST `/power-config` aufnehmen | ✓ API |
| `ledPin` | LED-Pin (OnOffShim) | A: mupi.php:1548 → :595 (Whitelist 4…27) | `shim.ledPin` (String) + `/etc/init.d/pi-blaster.boot.sh` `DAEMON_ARGS="--gpio N"` | Konfig | PHP: `sudo sed -i` in pi-blaster.boot.sh, change=2 | Neustart nötig. Template-Standard 13, Prototyp 25 | ✓ API |
| `ledMax` | LED-Helligkeit normal | A: mupi.php:1575 → :419 (0–100 / 1, ohne Prüfung) | `shim.ledBrightnessMax` (String) | mupi_start_led.sh:70 (mtime-Cache → live) | PHP change=2 | live | ✓ API |
| `ledMin` | LED-Helligkeit gedimmt | A: mupi.php:1587 → :426 | `shim.ledBrightnessMin` | mupi_start_led.sh:71 | PHP change=2 | live. Neu für alle 4: Endpoint `shim`/`pressDelay` | ✓ API |

### Einstellungen › Akku & Strom › Lüfter [luefter]
| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `fanOn` | Lüfter aktiv | A: mupi.php:1678 → :474 (`fan_control`) | `fan.fan_active` (bool) + Dienst `mupi_fan` | Konfig | an: `systemctl enable mupi_fan` + `service mupi_fan start`; aus: stop + disable; change=2 | – | ✓ API |
| `fanPin` | Lüfter-Pin | A: mupi.php:1607 → :477 | `fan.fan_gpio` (String) | fan_control.py:38 (nur beim Dienststart) | PHP ohne Whitelist-Prüfung | Standard: Template 12, conf_update.sh 13, Prototyp **17** = OnOffShim-Trigger-Pin (`shim.triggerPin`) → Konflikt | ✓ API |
| `fan100` | Volle Drehzahl ab | A: mupi.php:1634 → :478 (20–90) | `fan.fan_temp_100` | fan_control.py:39 (nur Start) | PHP ohne Prüfung | Reihenfolge 100 > 75 > 50 > 25 nirgends geprüft | ✓ API |
| `fan75` | 75 % ab | A: mupi.php:1646 → :479 | `fan.fan_temp_75` | fan_control.py:40 | wie oben | – | ✓ API |
| `fan50` | 50 % ab | A: mupi.php:1658 → :480 | `fan.fan_temp_50` | fan_control.py:41 | wie oben | – | ✓ API |
| `fan25` | 25 % ab | A: mupi.php:1670 → :481 | `fan.fan_temp_25` | fan_control.py:42 | wie oben | ⚠ Läuft der Lüfter schon, macht `service mupi_fan start` nichts → neue Pins/Temperaturen erst nach Neustart. Neu: Endpoint mit Validierung + `systemctl restart mupi_fan` | ✓ API |

### Lücken und Auffälligkeiten (Teil 2)

**Lücken für die neue App (⚙ = neuer Endpoint nötig, ＋ = neu zu bauen)**
- ⚙ `eigenes` Bild anzeigen + hochladen: Upload-Endpoint (multipart, JPEG prüfen, auf 800×480 skalieren, nach `themes/custom-bg.jpg`), danach `/display/reload-theme`; Logik aus mupi.php:623–705.
- ⚙ `names` (`mupibox.coverflowShowNames`) und `hideScroll` (`mupibox.hideScrollbar`): Bool-Endpoint (z. B. `/theme-stage` erweitern) + echter Display-Reload (Swiper liest nur beim Start).
- ⚙ `ttsLang` (`mupibox.ttsLanguage`): Whitelist gegen `googlettslanguages`, `tts_files/*.mp3` löschen, setting_update.sh, `pm2 restart spotify-control`.
- ⚙ `bright`: Endpoint für `/sys/class/backlight/*/brightness` (linear, nicht 6 Stufen), neuer Konfig-Key + Wiederherstellen beim Boot.
- ⚙ `hdmiRot`/`lcdRot`/`dlcdRot`: Endpoint mit `G_CONFIG_INJECT` in /boot/config.txt (mupi.php:35–64), Neustart-Hinweis; Flip-Werte 0x10000/0x20000 richtig behandeln.
- ⚙ `resX`/`resY` (`chromium.resX/resY`): Endpoint mit Zahlenprüfung + setting_update + restart_kiosk.
- ⚙ `hideA`/`hideM`/`hideN`/`hideO` (`mupibox.hiddenCategories`): Endpoint (Logik admin.php:199, mind. 1 sichtbar) + Display-Reload.
- ⚙ `resume`, `listTimer`, `setTimer` (`mupibox.resume/listviewTimer/settingsAccessTimer`): Endpoint mit Bereichsprüfung; Display-Reload für die beiden Timer.
- ⚙ Display live: Screenshot-Endpoint (scrot als dietpi, PNG ausliefern, Rate-Limit) für Bild + „Aktualisieren“; VNC: Status von `mupi_vnc`/`mupi_novnc` abfragen und `:6080/vnc_lite.html` öffnen.
- ＋ „Strg+Alt+Entf senden“: gibt es nur in der noVNC-Oberfläche; eigener noVNC-Client nötig oder Knopf streichen.
- ⚙ `sound`: Endpoint mit Whitelist gegen `mupibox.AudioDevices` + `dietpi-set_hardware soundcard`, Neustart-Hinweis.
- ⚙ `rotary`/`rotStep`/`btnFn` (`rotary.active/step/button`): Endpoint + `systemctl enable/restart` bzw. `stop/disable mupi_rotary`.
- ＋ `btOn` als ein Schalter: kombiniert heute getrennte Funk- (`start_bt.sh`/`stop_bt.sh`, API vorhanden) und Chip-Steuerung (`set_bluetooth_chip.sh`, nur PHP, Neustart); dazu Controller-Name/MAC in GET `/bluetooth` ergänzen und `hci*`-Vorprüfung wie bluetooth.php:19.
- ⚙ `hatOn` (`mupihat.hat_active`): Endpoint für enable/disable_mupihat.sh + Neustart.
- ⚙ `battery` (`mupihat.selected_battery`): Endpoint mit Whitelist gegen `battery_types[].name` + `service mupi_hat restart`.
- ⚙ `pressDelay`: in POST `/power-config` aufnehmen (GET liefert es schon); Hinweis „wirkt nach Neustart“.
- ⚙ `ledPin`/`ledMax`/`ledMin` (`shim.*`): Endpoint; ledPin mit Whitelist + sed in pi-blaster.boot.sh + Neustart.
- ⚙ `fanOn`/`fanPin`/`fan100…fan25` (`fan.*`): Endpoint mit Pin-Whitelist, Temperatur-Reihenfolge, `systemctl restart mupi_fan`.

**Gleiche Einstellung, unterschiedlich in PHP und WebApp**
- Display aus (`timeout.idleDisplayOff`): PHP 0–120 + setting_update (X-BlankTime); API 0–1440 ohne setting_update → BlankTime bleibt alt, Box-DisplayManager liest nur beim Start; WebApp meldet trotzdem „greift sofort“.
- Auto-Aus (`timeout.idlePiShutdown`): PHP 0–300 / 15, ohne Prüfung; API 0–1440 / 1; Prototyp 0–300 / 5.
- Lautstärke-Maximum (`mupibox.maxVolume`): PHP String 0–100, API Zahl 10–100. `typeof === 'number'` in routes.ts:800/827 → nach PHP-Speichern zeigt die WebApp 100 % und kappt `/audio/volume` nicht (Hörschutz umgangen).
- Startlautstärke: PHP `mupibox.startVolume` (immer aktiv, chromium-autostart.sh:106) vs. WebApp `mupibox.startupVolume` (null = aus, server.ts:7197). Beide werden beim Boot gesetzt; „aus“ in der WebApp wirkt nicht.
- Akku-Profil: PHP bearbeitet nur „Custom“ (4000–12600 mV, VREG 3000–18800, streng absteigend, th_warning ≥ th_shutdown, startet mupi_hat neu); API bearbeitet das **aktive** Profil (5000–9000, VREG 6000–8500, keine Reihenfolgeprüfung, th_shutdown < th_warning, kein mupi_hat-Neustart); WebApp-UI zeigt nur 4 der 8 Felder.
- Vorlesen: `themeStageAutoRead` in beiden; `ttsLanguage` nur PHP. Wirkt nur mit Bühne + Kinder-Theme.
- Bluetooth: PHP hat Funk **und** Chip; WebApp nur Funk.
- Box-Name: `mupibox.boxName` (Startbild, POST `/bootscreen`) ist nicht `mupibox.host` (Hostname). POST `/bootscreen` überschreibt `boxName` und `bootscreenLanguage` immer, auch wenn sie fehlen.
- Sprachen: `displayLanguage` (Display-Texte) und `bootscreenLanguage` (Wartungsbilder) sind zwei getrennte Keys; die neue App führt sie auf [sprache] zusammen.

**Fehler und Auffälligkeiten im heutigen Code**
- mupi.php:37: HDMI „Horizontal/Vertikal spiegeln“ (0x10000/0x20000) wird durch `intval()` zu 0 → nicht einstellbar.
- mupi.php:279–282: Live-Lautstärke der Admin-Seite ohne maxVolume-Kappung (pactl).
- display-manager.service.ts:32: `idleDisplayOff = 0` wird als 1 Minute behandelt → „0 = nie“ schaltet das Display beim Abspielen doch nach 1 min aus.
- mupi.php:474–497: Lüfterwerte ohne Validierung; `service mupi_fan start` lädt laufenden Dienst nicht neu; :476 setzt kurz `fan_active = FanPin` (wird überschrieben).
- mupi.php:419/426/518: `ledBrightnessMax/Min` und `pressDelay` ohne Zahlen- oder Bereichsprüfung; pressDelay wirkt erst nach Neustart, PHP sagt das nicht.
- mupihat.php:118: `selected_battery` ungeprüft aus POST übernommen.
- Template `mupihat.selected_battery = "USB-C mode"` passt zu keinem Profilnamen („USB-C mode (no battery)“) → GET `/power-config` liefert `profile: null`.
- Standards widersprechen sich: `fan.fan_gpio` Template 12 / conf_update.sh 13 / Prototyp 17 (17 = OnOffShim-Trigger); `shim.ledPin` Template 13 / Prototyp 25; `listviewTimer` 2.5 / Prototyp 2; `settingsAccessTimer` 3 / Prototyp 5; `hideScrollbar`/`coverflowShowNames` false / Prototyp an; `rotary.button` off / Prototyp Play/Pause.
- mupi.php:400: Meldung für „Max resume entries“ gibt `ttsLanguage` statt `resume` aus. mupi.php:331: Meldung „Soundcard changed to …x“ hat ein überzähliges „x“.
- mupi.php:639: Fehlermeldung nennt webp/png/gif, akzeptiert wird aber nur JPEG. mupi.php:632 gibt `tmp_name` statt des Fehlercodes aus.
- mupi.php:348–416: Jede Änderung im Formular „MuPiBox settings“ (auch `resume`) startet den Kiosk neu (change=1).
- mupi.php:38/48/58: fehlt die Zeile in config.txt, ist `0 != ''` unter PHP 8 wahr → jedes Speichern von „Display settings“ schreibt `…rotate=0` neu in /boot/config.txt (harmlos, aber unnötige SD-Schreibvorgänge).
- Helligkeit wird nirgends gespeichert → nach jedem Neustart 100 %.
- Prototyp-Hilfetext „Haltezeit für den Einstellungszugang … bis der QR-Code erscheint“: öffnet in Wahrheit die Box-Einstellungsseite (dort die Eltern-Kachel mit QR).
- Prototyp „15 Szenen“: bootscreens.json hat 16 Szenen (+ Zufall).
- Server hat zusätzlich ungeschützte Box-Routen `/api/bluetooth/*` (server.ts:3636–3740, ohne Sitzung, für das Display); die neue App sollte die `/api/eltern/bluetooth*`-Routen nutzen.
- Batterie-Verlauf schreibt jede Minute auf die SD-Karte (`battery_log.jsonl`) – für SD-Verschleiß relevant.

## Teil 3: Netzwerk, Dienste, Sicherheit, System, Sprache

Abkürzungen: `A:` = alte Admin-Oberfläche (PHP, Port 80, `AdminInterface/www/`), `E:` = Eltern-App (Port 8200, `src/backend-api/src/eltern-webapp/app.js`). `rt` = `src/backend-api/src/eltern/routes.ts`, `srv` = `src/backend-api/src/server.ts`. Pfade der Skripte auf der Box: `/usr/local/bin/mupibox/…` (im Repo `scripts/mupibox/…`). Konfig = `/etc/mupibox/mupiboxconfig.json`.

Status: `✓ API` = Node-Endpunkt vorhanden · `⚙ PHP` = nur PHP, neuer Endpunkt nötig · `＋ neu` = gibt es nirgends / vom Prototyp kombiniert · `? unklar` · `— statisch` = reiner Hinweistext oder reine Client-Funktion, kein Backend nötig.

Allgemein zur PHP-Seite: Alle Seiten binden `includes/header.php` ein. Das prüft das CSRF-Token bei jedem POST (header.php:22, Token wird automatisch in jedes POST-Formular eingefügt, header.php:23-28) und fragt das Passwort ab, falls `interfacelogin.state` an ist (header.php:211-252). www-data hat `sudo` ohne Passwort. Deshalb ist praktisch jede PHP-Aktion eine Root-Aktion.

Allgemein zur Node-Seite: `rt`-Routen laufen alle hinter `localNetworkOnly` (nur private IP-Adressen, middleware.ts:43) und `requireSession`. Schreibende Routen brauchen zusätzlich `requireCsrf` (Header `x-mupibox-csrf`). Die `srv`-Routen `/api/*` haben keine Anmeldung, nur den `browserGuard` (request-guard.ts: Host-Allowlist und Ablehnung von Cross-Site-Anfragen). Jedes Gerät im WLAN kommt per curl an sie heran.

---

### Einstellungen › Netzwerk › WLAN [wlan]

| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `◉ Verbindung` (Status/Netz/Signal/IP/Gateway/DNS/MAC) | Verbindung | A: network.php:383-392 bettet nur die Box-Seite `:8200/wifi` als iframe ein · E: `loadWlan()` app.js:3004 | `/tmp/network.json` (von `get_network.sh` per Cron alle 30 s geschrieben, crontab.template:32-33) | `GET /api/network` srv:2014 (Schlüssel `onlinestate, wifi, wifisignal, wifilink, ip, gateway, dns, subnet, mac`); live und ohne DNS/MAC: `GET /api/wifi/status` srv:2176 | — | bis zu 30 s alt; `/api/network` ohne Anmeldung | ✓ API |
| `▶ Aktualisieren` | Aktualisieren | E: `#wlan-refresh-btn` → `loadWlan()` app.js:3004 | — | wie oben | — | — | ✓ API |
| `◉ Netze in Reichweite` | Netze in Reichweite | E: `scanWlan()` app.js:3060 · Box-Seite /wifi | — | `GET /api/eltern/wlan/scan` rt:922 (`sudo iwlist <if> scanning`, 3-5 s, Mehrfach-Scan wird zusammengelegt rt:889) · Alternative: `GET /api/wifi/networks` srv:2418 (wpa_cli scan + Liste der gespeicherten Netze, mit Band) | — | kein Root-Schreibzugriff | ✓ API |
| `▶ Neu suchen` | Neu suchen | E: `#wlan-scan-btn` → `scanWlan()` | — | wie oben | — | — | ✓ API |
| `ssid` | Netzname (SSID) | A: nur über das iframe (Handler `save_wifi` network.php:224-247, Formular entfernt) · E: `addWlan()` app.js:3108 | Warteschlange `…/server/config/wlan.json` → `add_wifi.sh` trägt das Netz in `/etc/wpa_supplicant/wpa_supplicant.conf` ein | — | `POST /api/eltern/wlan/add` rt:984 `{ssid,password}` (1-32 Zeichen, kein CR/LF/NUL) · Box: `POST /api/addwlan` srv:2086 (ohne Anmeldung) | Box bleibt im aktuellen Netz. 🔒 WLAN-Passwort steht im Klartext in wlan.json, bis add_wifi.sh es abholt | ✓ API |
| `wpw` | Passwort (8-63, leer = offen) | wie oben | wie oben | — | wie oben (Länge wird in rt:993 und srv:2089 geprüft) | 🔒 Klartext in wlan.json (die Datei aus rt wird ohne atomaren Rename und ohne 0600 geschrieben) | ✓ API |
| `◉ Gespeicherte Netze` (+ Entfernen) | Gespeicherte Netze | E: `loadWlanSaved()` app.js:3023, `removeWlan()` app.js:3127 · Box-Seite /wifi | wpa_supplicant.conf | `GET /api/eltern/wlan/saved` rt:952 (`wpa_cli list_networks`, `[CURRENT]` = aktiv) | `POST /api/eltern/wlan/remove` rt:1023 (lehnt das aktive Netz mit 409 ab, dann `wpa_cli save_config`) · Box: `DELETE /api/wifi/configured/:id` srv:2494 (ohne Anmeldung, kein Schutz für das aktive Netz, behält aber die Bandwahl) | ⚠ rt:1059 nutzt reines `save_config` und verliert so `freq_list` (Bandwahl) aller Netze; srv:2369 `wifiSaveConfig()` setzt sie wieder ein | ✓ API |

### Einstellungen › Netzwerk › Netzwerk-Optionen [wlanopt]

| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `wOnboard` | Onboard-WLAN an | A: network.php:399-428 (Knopf `change_wifi`), Handler :276-289 | `/boot/config.txt` Zeile `dtoverlay=disable-wifi` | `grep '^dtoverlay=disable-wifi' /boot/config.txt` network.php:412 | `sudo set_onboard_wifi.sh on\|off` | Neustart nötig. 🔒 sudo, schreibt config.txt (das Skript arbeitet sauber mit einer temporären Datei). Ohne USB-Adapter ist die Box danach offline | ⚙ PHP |
| `usbDrv` | USB-WLAN-Treiber | A: network.php:474-479 (Select), Liste :4-19, Status-Abfrage per GET `?check_usb_wifi_driver=` :24-32 | Treiber-Ordner `/home/dietpi/.driver/network/88x2bu-20210702` bzw. `8821au-20210708` | `is_dir(path)` | — | nur die Auswahl, installiert noch nichts | ⚙ PHP |
| `▶ Treiber installieren` | Treiber installieren | A: network.php:497 (`USB_WIFI_DRIVER`), Handler :57-79 (auch „Remove driver“) | wie oben + Kernelmodul | wie oben; Fehlerhinweis über `/tmp/driver-install.txt` | `curl -L <raw.githubusercontent.com/splitti/MuPiBox/main/scripts/online/install_*.sh> \| sudo su dietpi -c bash` | 🔒 lädt ein Skript live vom Upstream-`main` und führt es aus (nicht die Fork-Version). Läuft sehr lange synchron im PHP-Request. Neuer Endpunkt: lokale Kopie `scripts/online/install_rtl*.sh` im Hintergrund starten, Fortschritt abfragen | ⚙ PHP |
| `usbPm` | Stromsparen des USB-Adapters | A: network.php:499-550 (Select Off/Minimal/Maximum je installiertem Treiber), Handler :84-117 | `/etc/modprobe.d/<88x2bu\|8821au>.conf` Option `rtw_power_mgnt=0\|1\|2`; laufender Wert in `/sys/module/<mod>/parameters/rtw_power_mgnt` | Regex auf die conf-Datei :514 | `sudo tee`/`sudo sed -i` (Werte vorher mit escapeshellarg bzw. Whitelist 0/1/2 geprüft) | wirkt erst nach Neustart. Der Prototyp hat einen Schalter, PHP drei Stufen je Treiber: festlegen, was an/aus bedeutet (Vorschlag: aus = 0, an = 2) | ⚙ PHP |
| `dhcpTo` | DHCP-Timeout | A: network.php:430-452, Handler :146-159 | `/etc/dhcp/dhclient.conf` (`timeout 10;` gegen `#timeout 60;`) | `grep 'timeout 10;'` :436 | `sudo sed -i` | wirkt beim nächsten DHCP-Lauf oder Start | ⚙ PHP |
| `wMon` | WLAN-Wächter (DietPi-WiFi-Monitor) | A: network.php:569-577, Handler :176-189 | systemd `dietpi-wifi-monitor` | `sudo service dietpi-wifi-monitor status \| grep running` :322 | `sudo systemctl enable\|disable --now dietpi-wifi-monitor` | 🔒 sudo systemctl | ⚙ PHP |
| `wBest` | Beste Verbindung suchen | A: network.php:578-586, Handler :191-204 | systemd `mupi_autoconnect-wifi` (→ `scripts/wifi/autoswitch_wifi.sh`, prüft alle 10 s) | `service … status \| grep running` :335 | `sudo systemctl enable\|disable --now mupi_autoconnect-wifi` | kann Verbindungsabbrüche verursachen (Hinweis in PHP :579) | ⚙ PHP |
| `▶ WLAN neu starten` | WLAN neu starten | A: network.php:454-459, Handler :290-296 | — | — | `sudo service ifup@<if> stop && … start` (if aus `mupi_wifi_iface.sh`) | Verbindung kurz weg: die App verliert kurz die Verbindung | ⚙ PHP |
| `▶ DHCP erneuern` | DHCP erneuern | A: network.php:460-465, Handler :297-303 | — | — | `sudo dhclient -r && ifup@<if> stop/start && sudo dhclient` | neue IP möglich: die App findet die Box danach vielleicht nicht mehr | ⚙ PHP |
| `ipCtl` | Backend-Steuerung per IP | A: admin.php:559-577 (`ip_control_backend`), Handler :179-190 → `$change=2` :428-432 | `mupibox.ip_control_backend` (bool) | `$data` | `save_mupiboxconfig()` + `sudo setting_update.sh` (schreibt `node-sonos-http-api.ip` in `…/server/config/config.json`, setting_update.sh:40-65) | der Server liest config.json nur beim Start (srv:64-66). PHP meldet „Services restarted“, startet aber nichts neu: nötig ist ein Neustart von `pm2 restart server` bzw. der Box | ⚙ PHP |

### Einstellungen › Netzwerk › Freigaben & Fernzugriff [freigaben]

| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `samba` | Samba (Windows-Freigabe) | A: network.php:588-597, Handler :161-174 (Kopie in service.php:52-65, nicht mehr im Menü) | systemd `smbd` + Pakete `samba wsdd`, `/etc/samba/smb.conf` | `sudo service smbd status \| grep running` :307 | an: `apt-get install samba wsdd`, `wget …/main/config/templates/smb.conf`, `systemctl enable/start smbd`, `smbpasswd -a dietpi` mit festem Passwort `mupibox` · aus: stop/disable + `apt-get remove` | 🔒 apt, lädt die Konfig vom Upstream-`main`. Das Samba-Passwort ist fest und öffentlich bekannt (`mupibox`), Freigabe `/home/dietpi/MuPiBox/media` beschreibbar. network.php hat keine apt-Sperre (service.php schon) | ⚙ PHP |
| `ftp` | FTP-Server | A: network.php:598-605, Handler :207-220 | systemd `proftpd`, `/etc/proftpd/proftpd.conf` | `service proftpd status \| grep running` :350 | an: `apt-get install proftpd` **und samba**, `wget …/proftpd.conf`, restart · aus: stop/disable/`apt-get remove proftpd` | 🔒 apt. Klartext-FTP mit System-Logins. Beim Einschalten wird unnötig auch samba installiert | ⚙ PHP |
| `vnc` | VNC (Display fernsteuern) | A: network.php:606-616, Handler :119-144 · Link im Menü header.php:277-285, Seite vnc.php | systemd `mupi_vnc` + `mupi_novnc` (x11vnc :5900, websockify/noVNC :6080), Pakete, `/usr/share/novnc`; Merker `tweaks.vnc` ("0"/"1") | `ps -ef \| grep websockify` :363 | an: `apt-get install x11vnc websockify`, `git clone noVNC`, enable/start · aus: stop/disable, `apt-get remove`, `rm -R /usr/share/novnc` · `tweaks.vnc` per `jq … > config` | 🔒 **x11vnc ohne Passwort** (config/services/mupi_vnc.service): jeder im WLAN kann das Display bedienen, an allen Logins vorbei. Der Konfig-Schreibzugriff per `cat <<< jq > file` umgeht Sperre und Backup von `save_mupiboxconfig` (Race mit dem Backend). `tweaks` fehlt in der Vorlage | ⚙ PHP |

### Einstellungen › Dienste › Telegram [telegram]

| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `tgOn` | Bot aktiv | A: smart.php:423-430, Handler :194-250 · E: `#tg-active`, `loadTelegram()` app.js:1546 / `saveTelegram()` app.js:1596 | `telegram.active` + systemd `mupi_telegram` | `GET /api/eltern/telegram-config` rt:1883 | `POST /api/eltern/telegram-config` rt:1906 → `sudo systemctl restart mupi_telegram` (rt:1950). PHP: `systemctl enable+restart` bzw. `stop+disable`, verlangt Token und Chat-ID (smart.php:221) | ⚠ Node macht nur `restart`, nie enable/disable. Hat PHP den Dienst einmal deaktiviert, läuft der Bot nach „an“ in der App zwar, **aber nach dem Neustart nicht mehr**. Bei aus beendet sich telegram_receiver.py sofort (:16). Node prüft nicht, ob Token und Chat-ID gesetzt sind | ✓ API |
| `tgReport` | Wiedergabe melden | A: smart.php:432-440 · E: `#tg-notify-playback` | `telegram.notifyPlayback` (bool, Standard false) | rt:1883 | rt:1906 | gelesen von telegram_Track_*.py, telegram_notify_screen.py (:13) und dem Player (spotify-control.js:139, lädt die Konfig live neu) | ✓ API |
| `◉ Bot-Token` (✓ eingerichtet) | Bot-Token | E: `#tg-token-status` | `telegram.token` | rt:1883 liefert nur `token_configured` | — | Token wird nie ausgeliefert (gut). 🔒 PHP zeigt den Token im Klartext und ohne Escaping im value-Feld (smart.php:445-447, XSS) | ✓ API |
| `tgToken` | Neuen Token setzen (leer = unverändert) | A: smart.php:443-448 · E: `#tg-token` | `telegram.token` | — | rt:1931-1937: nur wenn nicht leer, Format `^\d{6,12}:[A-Za-z0-9_-]{30,50}$` | ⚠ PHP überschreibt den Token immer mit dem Formularwert (smart.php:217). Leer heißt dort „löschen“, nicht „unverändert“ | ✓ API |
| `◉ Erlaubte Chats` | Erlaubte Chats | A: smart.php:451-488 · E: `renderTelegramChats()` app.js:1563 | `telegram.chatId` = `[{id,label}]` (alt: String) | rt:1886-1890 normalisiert | rt:1909-1928 (ID `^-?\d{1,20}$`, Label ≤ 60) | gelesen von telegram_receiver.py:48 (`ALLOWED_CHAT_IDS`), erst nach dem Neustart des Dienstes | ✓ API |
| `tgNewId` | Chat-ID | A: Zeile `telegram_chatId_id[]` smart.php:479 · E: Chat-Zeile in `renderTelegramChats()` | Eintrag `telegram.chatId[].id` | — | über rt:1906 (ganze Liste) | — | ✓ API |
| `tgNewName` | Name | A: `telegram_chatId_label[]` smart.php:480 · E: dito | `telegram.chatId[].label` | — | rt:1906 | — | ✓ API |
| `▶ + Chat hinzufügen` | + Chat hinzufügen | A: JS `addTelegramChat()` smart.php:491 · E: `addTelegramChat()` app.js:1591 (`#tg-add-chat-btn`) | — | — | erst mit Speichern (rt:1906) | nur im Browser, bis gespeichert wird | ✓ API |
| `▶ Chat-ID ermitteln` | Chat-ID ermitteln | A: smart.php:511 (`generate_chatId`), Handler :163-192 → `$change=3` (Speichern + `pm2 restart spotify-control`) | hängt `{id,label:""}` an `telegram.chatId` an | `sudo telegram_set_deviceid.sh`: `getUpdates` der Bot-API, `result[-1].message.chat.id` | wie links | ⚠ Solange `mupi_telegram` läuft, holt der Bot die Updates selbst per Long-Polling ab. `getUpdates` liefert dann wahrscheinlich nichts oder einen Konflikt („no chat detected“). Neuer Endpunkt: Skript wiederverwenden, vorher den Bot kurz stoppen oder die ID vom Empfänger mitloggen lassen | ⚙ PHP |

### Einstellungen › Dienste › MQTT / Home Assistant [mqtt]

Alles liegt in `smart.php`: Formular :282-411, ein Handler `change_mqtt` :19-99 → `$change=4` = nur `save_mupiboxconfig()` (:269-272). In Node gibt es nichts dazu. Der Dienst `mupi_mqtt` (`scripts/mqtt/mqtt.py`, läuft als root) liest die Konfig nur beim Start (mqtt.py:928-948).

| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `mqttOn` | MQTT aktiv | A: smart.php:383-390, :45-59 | `mqtt.active` + systemd `mupi_mqtt` | `$data` | `systemctl enable`+`service start` bzw. `stop`+`disable` | 🔒 sudo systemctl | ⚙ PHP |
| `mqName` | Gerätename | A: :290-297, :21-24 | `mqtt.name` | `$data` | save | ⚠ `mqtt.name` fehlt in der Vorlage und in conf_update.sh. mqtt.py:935 greift direkt `['name']` ab: KeyError, der Dienst stürzt ab, bis einmal in PHP gespeichert wurde | ⚙ PHP |
| `mqBroker` | Broker | A: :298-305, :60-63 | `mqtt.broker` | `$data` | save | wirkt erst nach Neustart von mupi_mqtt (PHP startet ihn nicht neu) | ⚙ PHP |
| `mqPort` | Port | A: :306-313, :64-67 | `mqtt.port` (String) | `$data` | save, ungeprüft | mqtt.py macht `int()`: ungültiger Wert = Absturz | ⚙ PHP |
| `mqTopic` | Topic | A: :314-321, :68-71 | `mqtt.topic` (tatsächliches Topic = `topic/clientId`, mqtt.py:936) | `$data` | save | Neustart nötig | ⚙ PHP |
| `mqClient` | Client-ID | A: :322-329, :72-75 | `mqtt.clientId` | `$data` | save | Neustart nötig | ⚙ PHP |
| `mqUser` | Benutzer | A: :330-337, :76-79 | `mqtt.username` | `$data` | save | aus `/api/config` herausgefiltert (srv:3476) | ⚙ PHP |
| `mqPw` | Passwort | A: :338-345, :80-83 | `mqtt.password` (Klartext) | `$data` | save | 🔒 PHP gibt das Passwort im value-Feld aus (:342). Neuer Endpunkt: nur schreiben, nie lesen | ⚙ PHP |
| `mqRef` | Aktualisierung (Wiedergabe) 1-90 s | A: :346-357 (Range), :84-87 | `mqtt.refresh` (String) | `$data` | save, ungeprüft | Neustart nötig | ⚙ PHP |
| `mqIdle` | Aktualisierung (Leerlauf) 1-90 s | A: :359-370, :88-91 | `mqtt.refreshIdle` | `$data` | save | — | ⚙ PHP |
| `mqTo` | Timeout 10-180 s | A: :371-382, :92-95 | `mqtt.timeout` | `$data` | save | — | ⚙ PHP |
| `haOn` | An Home Assistant melden | A: :392-399, :29-43 | `mqtt.ha_active` | `$data` | save + `sudo service mupi_mqtt restart` | ⚠ der Neustart läuft vor dem Speichern (:34 vor :271): der Dienst liest möglicherweise noch den alten Wert | ⚙ PHP |
| `haTopic` | Discovery-Präfix | A: :400-407, :25-28 | `mqtt.ha_topic` | `$data` | save | Neustart nötig | ⚙ PHP |

### Einstellungen › Dienste › WLED [wled]

Alles liegt in `smart.php`: Formular :515-700, Handler `change_wled` :101-162 → `$change=4` (nur speichern). Genutzt wird es von `mupi_start_led.sh` (:29-46 beim Start, :72-85 in der Schleife, gelesen per jq) und `mupi_shutdown.sh` (:33-45). In Node gibt es nichts dazu.

| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `wledOn` | WLED aktiv | A: :688-695, :152-159 | `wled.active` | `$data` | save | ⚠ Das Feld wird nur angezeigt, wenn ein WLED-Gerät antwortet (:555-697), der Speichern-Knopf aber immer (:699). Ohne Gerät setzt Speichern `active=false`, beide Helligkeiten auf 0 und die Presets auf leer | ⚙ PHP |
| `wledPort` | Serielle Schnittstelle | A: :521-529, :112-119 | `wled.com_port` | `$data` | save, Regex `^/dev/tty[A-Za-z0-9]+$` | 🔒 geht in Root-Shells (smart.php:10, Skripte) und ist geprüft | ⚙ PHP |
| `baud` | Baudrate | A: :530-550, :105-111 | `wled.baud_rate` (String) | `$data` | save, Whitelist aus 12 Werten | — | ⚙ PHP |
| `wledMain` | Haupt-Preset | A: :607-629 (Select aus den Geräte-Presets), :124 | `wled.main_id` | Geräte-Presets: `sudo python3 wled_get_data.py -s <port> -b <baud> -j '{"v":true}'` bei **jedem** Seitenaufruf (:8-12) → `/tmp/.wled.info.json`, `/tmp/.wled.presets.json` | save (nur Ziffern) | Der Prototyp nimmt eine Zahl, PHP eine Liste mit Namen: für die Namen ein Lese-Endpunkt nötig | ⚙ PHP |
| `wledBootOn` | Preset beim Start | A: :656-662, :136-151 | `wled.boot_active` | `$data` | save + `curl POST http://<wled-ip>/settings/leds` (BP, CA, BO) | wird **im WLED-Gerät** gespeichert (IP aus dessen eigener Antwort, per FILTER_VALIDATE_IP geprüft). Kein Skript der Box nutzt `boot_active` | ⚙ PHP |
| `wledBoot` | Preset-Nummer beim Start | A: :583-605, :123 | `wled.startup_id` | wie oben | save + curl (siehe oben) | — | ⚙ PHP |
| `wledOffOn` | Preset beim Ausschalten | A: :664-670, :127-134 | `wled.shutdown_active` | `$data` | save | mupi_shutdown.sh:39 prüft nur `shutdown_active`, nicht `wled.active` | ⚙ PHP |
| `wledOff` | Preset-Nummer beim Ausschalten | A: :631-654, :122 | `wled.shutdown_id` | wie oben | save | — | ⚙ PHP |
| `wledBright` | Helligkeit normal 0-255 | A: :671-679, :121 | `wled.brightness_default` (String) | `$data` | save, auf 0..255 begrenzt | überschreibt die Helligkeit der Presets | ⚙ PHP |
| `wledDim` | Helligkeit gedimmt 0-255 | A: :680-687, :120 | `wled.brightness_dimmed` | `$data` | save, auf 0..255 begrenzt | genutzt in mupi_start_led.sh:75 | ⚙ PHP |

### Einstellungen › Sicherheit › Passwort & Anmeldung [passwort]

| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `◉ Status` (Passwort ist gesetzt) | Status | E: `renderPasswordStatus()` app.js:2053 (`state.passwordConfigured`) · A: nur „Login state enabled/disabled“ admin.php:506-516 | `eltern.password` bzw. `interfacelogin.*` | `GET /api/eltern/session` rt:239 bzw. `GET /api/eltern/auth-info` rt:251 (`passwordConfigured`) | — | gilt heute nur für das Eltern-Passwort | ✓ API |
| `pwCur` | Aktuelles Passwort | A: admin.php:492-493 (`curpwd`), geprüft :394 per `password_verify` | `interfacelogin.password` | — | — | Node verlangt das aktuelle Passwort **nicht** (rt:281 braucht nur Sitzung + CSRF). Wer eine offene Sitzung hat (z. B. über den Telegram-Magic-Link), kann das Passwort ändern oder löschen. Für die gemeinsame App die Prüfung nach Node übernehmen | ⚙ PHP |
| `pwNew` | Neues Passwort (mind. 6 Zeichen) | A: admin.php:494-496 (`newpwd`, mind. 6, :389) · E: `setPassword()` app.js:2059 (`#pw-new`) | A: `interfacelogin.password` (bcrypt) · E: `eltern.password = {salt,hash}` (scrypt) | — | E: `POST /api/eltern/password {password}` rt:281 (mind. 4, auth.ts:221, `ELTERN_PASSWORD_MIN_LENGTH`) | unterschiedliche Mindestlänge (PHP 6, Node 4, Prototyp 6) | ✓ API |
| `▶ Passwort ändern` | Passwort ändern | A: `submitpw` admin.php:384-406 → `$change=2` = save + `sudo setting_update.sh` (:428-432) · E: `#pw-set-btn` → `setPassword()` | siehe oben | — | E: rt:281 → `setElternPassword()` auth.ts:258 → `updateMupiboxConfig()` srv:1552 (gemeinsame flock-Sperre mit PHP) | zwei getrennte Passwörter, siehe „Login heute“. Die Zusammenführung ist ＋ neu | ✓ API |
| `▶ Passwort entfernen` | Passwort entfernen | E: `clearPassword()` app.js:2081 (`#pw-clear-btn`) · A: nicht möglich (mind. 6 Zeichen) | löscht `eltern.password` | — | `POST /api/eltern/password {password:""}` rt:281 | danach nur noch Magic Link (QR/Telegram). Ohne Abfrage des aktuellen Passworts | ✓ API |
| `loginOn` | Anmeldung verlangen | A: admin.php:501-519 (`change_login`), Handler :409-422 | `interfacelogin.state` (bool, **Vorlage: false**) | `$data` | Umschalten + save + setting_update.sh | 🔒 wirkt sofort. Node hat keinen solchen Schalter: die Eltern-App verlangt immer eine Sitzung. Die Admin-Oberfläche ist ab Werk **offen** (state=false) | ⚙ PHP |
| `◉ Hinweis` (QR am Display / Link per Telegram) | Hinweis | Box: Statusanzeige lange drücken (`mupibox.settingsAccessTimer`, home.page.ts:103) → `eltern-magic-link.service.ts:38-60` · Telegram `/login` telegram_receiver.py:353 → `send_magic_link()` :186 | — | — | `POST /api/eltern/magic-link/generate` rt:187 (nur localhost) | beide Wege gibt es schon, gelten aber nur für die Eltern-App | ✓ API |

### Einstellungen › System › Über die Box [ueber]

| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `boxName` | Name der Box (max. 14 Zeichen) | A: mupi.php:960 (`boxName`), Handler :546-573 · E: Startbild-Editor `loadBootscreen()` app.js:2735 / `saveBootscreen()` :2894 | `mupibox.boxName` | `GET /api/eltern/bootscreen` rt:1675 (`current.boxName`) | `POST /api/eltern/bootscreen` rt:1699 (Steuerzeichen raus, `nameMaxLength` aus bootscreens.json, Standard 14) → startet `sudo bootscreen_update.sh` im Hintergrund | ⚠ Die POST-Route setzt **immer alle vier Felder** (bootscreen, maintenanceScreen, boxName, bootscreenLanguage). Wer nur den Namen schickt, setzt die übrigen auf Standard zurück. Neue App: alle mitsenden oder eigene Route. Die Smart-Sync-Vorbelegung des Präfixes läuft über einen anderen Teil | ✓ API |
| `◉ MuPiBox` (Version/Hostname/Laufzeit/CPU-Last/Temp/RAM/SD) | MuPiBox | E: `loadSystem()` app.js:1928 · A: index.php:90-130 (Version), :181-200 (Modell/OS/Throttle), :219ff (SD) | Version: `mupibox.version`; sonst Laufzeitwerte | `GET /api/eltern/system` rt:1963 (hostname, uptime, load_1, cpu_count, mem, cpu_temp_c, disk; nur Node-Bordmittel) · Version: `GET /api/config` srv:3494 (`mupibox.version`, ohne Anmeldung, Geheimnisse herausgefiltert) | — | `/system` liefert die Version nicht: in der Route ergänzen | ✓ API |
| `◉ SD-Karte` (Balken) | SD-Karte | E: `#sys-disk` | — | rt:1973 `statfs('/')` | — | — | ✓ API |
| `◉ Neuigkeiten` | Neuigkeiten | A: index.php:131-147 (`news.txt` von GitHub `splitti/MuPiBox/main`, 60 min zwischengespeichert) | — | `file_get_contents(raw.githubusercontent…/news.txt)` | — | 🔒 PHP gibt den Text roh als HTML aus (index.php:145), die fremde Quelle kann also HTML einschleusen. Neuer Endpunkt: holen und als Text ausliefern | ⚙ PHP |
| `▶ Support-Infos herunterladen` | Support-Infos herunterladen | A: index.php:176-177 → `support_data.php` (auth_check.php) | ZIP: data.json, gefilterte Konfig, monitor/network.json, mupi.info | — | `sudo`-Befehle, `zip_download.php` (zufälliger Name in /var/tmp, danach gelöscht) | 🔒 Gefiltert wird zeilenweise mit `grep -v password\|token\|…` (support_data.php:17). **Leck:** `eltern.password` ist ein Objekt, dadurch bleiben die Zeilen `"salt"` und `"hash"` (scrypt) im ZIP. Die JSON wird dabei außerdem ungültig. Neuer Endpunkt: mit `redactSecrets()` (srv:3478) filtern | ⚙ PHP |

### Einstellungen › System › Updates [updates]

| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `◉ versions` (Stable/Beta/Dev + Knöpfe) | MuPiBox | A: admin.php:587-641, Handler :251-283 (`mupibox_update`, `_beta`, `_dev`) · Anzeige auch index.php:90-130 | installiert: `mupibox.version`; verfügbar: `version.json` auf GitHub `splitti/MuPiBox/main` (admin.php:175, bei **jedem** Aufruf von admin.php ohne Zwischenspeicher); Dev-Datum per `api.github.com` (:629) | wie links | `curl -L …/main/update/start_mupibox_update.sh \| sudo bash -s -- stable\|beta\|dev` **synchron** im PHP-Request, danach `$reboot=1`. Bei beta/dev wird an die Version „ BETA“/„ DEVELOPMENT“ angehängt (write_json = save + setting_update + restart_kiosk) | 🔒🔒 Root-Ausführung eines live geladenen Upstream-Skripts, kein Fork-/Release-Pinning. Dauert Minuten, Webserver-Timeout möglich. Neuer Endpunkt: lokal installiertes Skript mit `setsid`/`systemd-run` im Hintergrund, Log `/boot/mupibox_update.log` abfragen (das Skript schreibt es, start_mupibox_update.sh:58-59). Vorher ein Backup | ⚙ PHP |
| `◉ warn` (vorher Backup) | Betriebssystem | A: admin.php:643-645 | — | — | — | statischer Hinweis | — statisch |
| `▶ Betriebssystem aktualisieren` | Betriebssystem aktualisieren | A: admin.php:647-648 (`os_update`), Handler :294-300 → `$change=3` | — | — | `sudo apt-get -y … update && … upgrade` (force-confdef/confold) **synchron**, danach setting_update.sh + set_hostname.sh + restart_kiosk.sh | 🔒 apt als root, bis zu 30 min. Keine apt-Sperre (anders als service.php:20-23). Kein automatischer Neustart, obwohl der Text „auf den Neustart warten“ sagt | ⚙ PHP |

### Einstellungen › System › Backup [backup]

| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `▶ Konfigurations-Backup` | Konfigurations-Backup | A: admin.php:527-530 → `backup.php` (auth_check.php) | ZIP aus `/home/dietpi/MuPiBox/media/cover/*`, Konfig, `…/server/config/data.json` | — | `mupibox_send_zip()` zip_download.php:17 (`sudo zip` nach /var/tmp, chmod 600, nach dem Senden gelöscht) | 🔒 enthält **alle Geheimnisse** (Spotify-Tokens, Telegram-Token, MQTT-Passwort, bcrypt- und scrypt-Hash). NAS-Passwort ist verschlüsselt (srv:4605). Neuer Endpunkt: Streaming-Download aus Node mit Sitzungsprüfung | ⚙ PHP |
| `◉ note` (Cover, mupiboxconfig.json, data.json) | — | admin.php:528 | — | — | — | statisch | — statisch |
| `▶ Voll-Backup` | Voll-Backup | A: admin.php:531-533 → `fullbackup.php` | ZIP aus `/home/dietpi/MuPiBox/media/*` + Konfig + data.json | — | wie oben (/var/tmp, weil /tmp nur 1 GB RAM hat) | 🔒 wie oben; mehrere GB, `sudo zip` blockiert lange | ⚙ PHP |
| `◉ note` (alle Mediendateien) | — | admin.php:531 | — | — | — | statisch | — statisch |
| `◉ file` Backup-Datei | Backup-Datei | A: admin.php:537 (`fileToUpload`) | Upload nach `/tmp/<name>` | — | — | Dateiname nur `^[A-Za-z0-9._-]+\.zip$` (admin.php:63); das Upload-Limit von PHP gilt | ⚙ PHP |
| `▶ Backup einspielen` | Backup einspielen | A: admin.php:538 (`submitfile`), Handler :50-173 (**vor** header.php, mit eigener Login- :24-38 und CSRF-Prüfung :42-45) | überschreibt Konfig, data.json, `media/…` | — | ZipArchive-Whitelist (:86-129: exakte Dateien, unter media/ nur Ordner und Nicht-Skript-Typen, keine Symlinks, kein `..`) → `sudo unzip -o -a … -d /` → chown/chmod → `conf_update.sh` (lokal, sonst curl vom Upstream) → Version behalten → write_json (save + setting_update + restart_kiosk) → `change_hostname <host>` + `set_hostname.sh` → **Neustart** | 🔒🔒 Root-Entpacken nach `/`. Ein altes Backup setzt auch `interfacelogin` (Passwort/Status) und `eltern.password` zurück. Neuer Endpunkt: Whitelist-Logik 1:1 übernehmen | ⚙ PHP |

### Einstellungen › System › Neu starten & Ausschalten [neustart]

| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `▶ Neu starten` | Neu starten | E: `systemReboot()` app.js:2986 · A: admin.php:457 (`reboot`) :309-316 und Schnellzugriff header.php:142-146/:267 (GET mit csrf_token) → footer.php:183-187 | — | — | E: `POST /api/reboot` srv:3604 → `sudo su - -c "restart.sh &"` · A: `( flock -n … ; sleep 5; sudo restart.sh ) &` (Doppelklick-Schutz) | 🔒 `/api/reboot` hat **keine Anmeldung** (nur browserGuard). Jedes Gerät im WLAN kann die Box per curl neu starten. Die App ruft es per `fetch` ohne CSRF auf. Neue App: Route hinter `localOrElternSession` legen, flock übernehmen | ✓ API |
| `▶ Ausschalten` | Ausschalten | E: `systemShutdown()` app.js:2992 · A: admin.php:458 (`shutdown`) :301-308 und header.php:137-141/:266 → footer.php:188-192 | — | — | E: `POST /api/shutdown` srv:3587 → `shutdown.sh &` · A: flock + `shutdown.sh` | 🔒 wie oben, ohne Anmeldung | ✓ API |
| `▶ Display (Chromium) neu starten` | (Zeile) | A: header.php:147-151/:268 (`hchromerestart`, sofort `sudo -i -u dietpi restart_kiosk.sh`) · admin.php:578-581 (`restart_kiosk` → `$change=3` = setting_update + set_hostname + restart_kiosk) | — | — | `restart_kiosk.sh` (killall chromium, chromium-autostart.sh) | Wiedergabe im Display bricht ab. `/api/eltern/display/reload-theme` (rt:1620) lädt nur das Theme neu, **kein** Neustart | ⚙ PHP |
| `▶ Spotify-Dienste neu starten` | (Zeile) | A: admin.php:551-554 (`spotify_restart`), Handler :352-358 | — | — | ⚠ ruft `/usr/local/bin/mupibox/./spotify_restartspotify_restart.sh` auf (**Tippfehler**, die Datei gibt es nicht). Gemeint ist `spotify_restart.sh` (pm2 restart server + spotify-control) | **Knopf ist heute wirkungslos.** Node kann `pm2 restart server` nicht synchron an sich selbst ausführen: abgekoppelt starten (`setsid`) | ⚙ PHP |
| `▶ PM2 neu starten` | (Zeile) | A: admin.php:555-558 (`pm2_restart`), Handler :344-350 | — | — | `sudo -i -u dietpi pm2 restart server; restart_kiosk.sh` | startet nur `server` neu (nicht spotify-control), obwohl die Beschriftung „PM2“ sagt | ⚙ PHP |
| `▶ Einstellungen übernehmen` | (Zeile) | A: admin.php:547-550 (`update`), Handler :317-343 | data.json-Migration 3.0.0 + `setting_update.sh` | — | — | ⚠ **Kaputt:** der Handler bindet `includes/header.php` ein zweites Mal ein (admin.php:322). header.php definiert `navActive()`, `navTabHidden()` und `mupibox_cached_exec()` ohne `function_exists`-Schutz: PHP bricht mit „Cannot redeclare“ ab, setting_update.sh läuft nie. Neuer Endpunkt: nur `sudo setting_update.sh` (+ restart_kiosk) | ⚙ PHP |

### Einstellungen › System › Protokolle [protokolle]

| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `log` | Log oder Dienst (25) | A: logviewer.php:5-31 (6 Logs + 19 Dienste = 25, identisch mit dem Prototyp) | Logs: `/home/dietpi/.pm2/logs/{server,spotify-control}-{error,out}.log`, `/tmp/shutdown_control.log`, `/tmp/idle_shutdown.log` · Dienste: systemd | `backend.php?mode=log\|status&key=` (backend.php:22-41, Whitelists :7-16) | — | ⚠ Der Eintrag `proftpd.service.service` (logviewer.php:29) steht nicht in der Whitelist von backend.php (dort `proftpd.service`), Antwort „Unkown Service“. `mupi_rotary` und `wpa_supplicant` stehen in der Whitelist, fehlen aber in der Auswahl | ⚙ PHP |
| `grep` | Suche (grep) | A: logviewer.php:46-49 | — | backend.php:30 `tail -n 100 <log> \| grep -i <escapeshellarg>` | — | nur für Logs, nicht für den Dienst-Status | ⚙ PHP |
| `▶ Aktualisieren` | Aktualisieren | A: logviewer.php:53 `loadData(true)`, sonst Polling alle 1,5 s (:63) | — | backend.php | — | `systemctl status` läuft mit sudo | ⚙ PHP |
| `▶ Pause` | Pause | A: logviewer.php:54/:99 (nur JS) | — | — | — | reine Client-Funktion | — statisch |
| `▶ Herunterladen` | Herunterladen | A: logviewer.php:55/:104 → `backend.php?mode=download` :43-54 (`tail -n 500`) | — | — | — | nur Logs | ⚙ PHP |
| `◉ log` | (Ausgabe) | A: logviewer.php:88-96 | — | wie oben | — | 🔒 **Stored XSS:** die Ausgabe landet per `innerHTML` **ohne Escaping** im Browser (logviewer.php:91-94). `POST /api/logs` (srv:3513, ohne Anmeldung) schreibt beliebigen Text in `server-out.log`. Jedes Gerät im WLAN kann so JavaScript in die Admin-Oberfläche einschleusen (mit CSRF-Token dort bis zur Root-Ausführung). Neue App: Log nur als Text anzeigen | ⚙ PHP |
| `ctlDebug` | Controller-Debugging | A: admin.php:676-687 (`spotifydebug`), Handler :217-230 | `…/spotifycontroller-main/config/config.json` `"logLevel": "error"\|"debug"` (Player: spotify-control.js:162) | `sudo cat … \| grep '"logLevel": "error"'` admin.php:677 | `sudo sed -i` + `pm2 restart spotify-control` | Wiedergabe wird kurz unterbrochen | ⚙ PHP |
| `▶ PM2-Log herunterladen` | PM2-Log herunterladen | A: admin.php:688 → `pm2logs.php` (auth_check) | `/home/dietpi/.pm2/logs/*` | — | `mupibox_send_zip('pm2_logs.zip', …)` | 🔒 Logs können Tokens und Chat-IDs enthalten | ⚙ PHP |

### Einstellungen › System › Systemoptionen [systemopt]

Heute in `mupi.php` › „System settings“ (Formular :1693-1845, Handler :115-272) und als nicht mehr verlinkte Kopie in `tweaks.php` (Menüeintrag in header.php:297-298 auskommentiert). Speichern: `$change=1` = Cache löschen + save + setting_update.sh + restart_kiosk (mupi.php:706-713), `$change=2` = save + setting_update (:714-718).

| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `ocSd` | SD-Karte übertakten | A: mupi.php:1709-1718 (`change_sd`), :231-244 | `/boot/config.txt` `dtoverlay=sdtweak,overclock_50=100` | `sudo cat /boot/config.txt \| grep …` :260 | an: `echo … \| sudo tee -a` · aus: `sed` leert die Zeile, **dann `head -n -1` löscht die LETZTE Zeile der Datei** | 🔒 ⚠ Beim Ausschalten wird die letzte Zeile von config.txt gelöscht, egal was dort steht (z. B. das Soundkarten-Overlay), falls der Eintrag nicht zufällig ganz unten war. Neustart nötig. Kann die Karte beschädigen | ⚙ PHP |
| `pm2Ram` | PM2-Logs im RAM | A: mupi.php:1721-1730 (`change_pm2log`), :115-146 | `/etc/fstab` (tmpfs `/home/dietpi/.pm2/logs` 50M) + `pm2.ramlog` (0/1) | `$data["pm2"]["ramlog"]` (nicht die fstab) | `sudo bash -c "sed … /etc/fstab > /tmp/.fstab && mv"` + save + setting_update | 🔒 schreibt /etc/fstab; ein Fehler kann den Start stören. Wirkt nach Neustart. Anzeige und fstab können auseinanderlaufen | ⚙ PHP |
| `waitNet` | Beim Start auf Netzwerk warten | A: mupi.php:1733-1742 (`change_netboot`), :148-161 | DietPi: `dietpi-set_software boot_wait_for_network` (`/etc/systemd/system/dietpi-postboot.service.d/dietpi.conf`) | Datei vorhanden? :246 | `sudo /boot/dietpi/func/dietpi-set_software boot_wait_for_network 0\|1` | nächster Start | ⚙ PHP |
| `turbo` | Turbo beim Start | A: mupi.php:1745-1765 (`change_turbo`), :178-191 | `/boot/config.txt` `initial_turbo=0\|30` | `grep initial_turbo \| cut` :1751 | `G_CONFIG_INJECT` als dietpi mit G_SUDO | nächster Start | ⚙ PHP |
| `gov` | CPU-Governor | A: mupi.php:1768-1797 (`cpugovernor`/`change_cpug`), :208-229 | `/boot/dietpi.txt` `CONFIG_CPU_GOVERNOR=` | Optionen aus `/sys/…/scaling_available_governors`, Wert aus `grep dietpi.txt` :1779 | Whitelist aus sysfs → `G_CONFIG_INJECT` + `sudo dietpi-set_cpu` | 🔒 Whitelist vorhanden. Die 6 Optionen im Prototyp gelten nur, wenn der Kernel sie anbietet: dynamisch aus sysfs lesen | ⚙ PHP |
| `noWarn` | Unterspannungs-Warnungen ausblenden | A: mupi.php:1800-1820 (`change_warnings`), :163-176 | `/boot/config.txt` `avoid_warnings=1` | `grep 'avoid_warnings=1'` :1806 | an: `tee -a` · aus: `sed` + **`head -n -1`** (derselbe Fehler wie bei ocSd) | 🔒 ⚠ löscht beim Ausschalten die letzte Zeile von config.txt. Neustart nötig | ⚙ PHP |
| `swap` | SWAP | A: mupi.php:1823-1843 (`change_swap`), :193-206 | DietPi `AUTO_SETUP_SWAPFILE_SIZE` in `/boot/dietpi.txt` | `grep AUTO_SETUP_SWAPFILE_SIZE=` :1829 | `sudo /boot/dietpi/func/dietpi-set_swapfile 0\|1` | legt die Swap-Datei an bzw. löscht sie (SD-Verschleiß) | ⚙ PHP |

### Einstellungen › System › Browser (Chromium) [browser]

Alles wird von `chromium-autostart.sh` beim Start des Kiosk gelesen (:25-75). Speichern in mupi.php mit `$change=1`: Chromium-Cache löschen + save + setting_update + **restart_kiosk** (mupi.php:706-713).

| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `gpu` | GPU-Unterstützung (experimentell) | A: mupi.php:1852-1872 (`change_gpu`), :66-77 | `chromium.gpu` (bool) | `$data` | save, $change=1 | ⚠ chromium-autostart.sh:39 führt den Wert als Befehl aus (`if ${FORCE_GPU}`). Nur echte Booleans schreiben | ⚙ PHP |
| `smooth` | Sanftes Scrollen (experimentell) | A: mupi.php:1874-1894, :88-99 | `chromium.sccrollanimation` (Tippfehler im Schlüssel ist so gewollt) | `$data` | save, $change=1 | wie oben (:43) | ⚙ PHP |
| `kiosk` | Kiosk-Modus | A: mupi.php:1895-1915, :101-112 | `chromium.kiosk` (bool) | `$data` | save, $change=1 | wie oben (:60) | ⚙ PHP |
| `cache` | Cache-Größe | A: mupi.php:1916-1935 (`cachesize`/`change_cache`), :78-86 | `chromium.cachesize` (MB, String) | `$data` | save, **nicht geprüft** | 🔒 chromium-autostart.sh:32 rechnet `$(( $CACHE_SIZE * 1024 * 1024 ))`. Bash-Arithmetik mit einem beliebigen String erlaubt Befehlsausführung als dietpi: neue App nur die Whitelist 0…2048 zulassen. Der Cache liegt sonst im RAM (`cacheInRam`, :69) | ⚙ PHP |
| `chromeDebug` | Chrome-Debugging | A: admin.php:660-669 (`debug`), :231-242 · Log-Download admin.php:673 → `debug.php` | `chromium.debug` (1/0, Vorlage "0") | `$data` | write_json = save + setting_update + restart_kiosk | 🔒 `chrome_debug.log` kann OAuth-Codes enthalten (debug.php:4-6) | ⚙ PHP |

### Einstellungen › System › Experten [experten]

| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `host` | Hostname | A: mupi.php:1696-1706 (`hostname`/`submithn`), :335-347 | `mupibox.host` + System-Hostname | `$data` (Anzeige), `os.hostname()` in rt:1979 | Regex RFC 1123 (:335) → `sudo /boot/dietpi/func/change_hostname <escapeshellarg>` + save ($change=1 → setting_update: spotifyd `device_name`, Server-config.json; restart_kiosk) | 🔒 sudo. Neustart nötig. Achtung: `browserGuard` akzeptiert nur `os.hostname()` als Host (request-guard.ts:44), bis zum Neustart gilt noch der alte Name | ⚙ PHP |
| `◉ warn` | Konfiguration direkt bearbeiten | jsoneditor.php:111 | — | — | — | statisch | — statisch |
| `◉ json` (+ Speichern) | (Editor) | A: jsoneditor.php (Menü „JSON“), 7 Dateien :17-25 (Konfig, data, config, resume, monitor, offline_*) | die gewählte Datei | `file_get_contents` | eigene CSRF-Prüfung :36-38 → JSON prüfen → `interfacelogin` festhalten :49-55 → `sudo install -m/-o/-g` :82-88 | 🔒🔒 zeigt **alle Geheimnisse** im Klartext. Umgeht Sperre, Merge und Tages-Backup von `save_mupiboxconfig` (Race mit dem Backend). Hält `interfacelogin` fest, **nicht** aber `eltern.password`. Erlaubt Werte, die in Root-Skripten landen (z. B. `chromium.cachesize`, `mupibox.theme`). Neuer Endpunkt: nur mupiboxconfig, über `updateMupiboxConfig`, Geheimnisse schwärzen und beim Speichern übernehmen | ⚙ PHP |
| `▶ Box-Konfiguration zurücksetzen` | (Zeile) | A: admin.php:698-701 (`resetMupiConf`), :359-365 | Konfig | — | `sudo su - -c 'rm …; wget <GitHub main>/config/templates/mupiboxconfig.json …; chmod 777'` | 🔒🔒 lädt die Vorlage live vom Upstream. Ohne Netz bleibt die Box **ohne Konfig**. Setzt **chmod 777** (für alle beschreibbar). Löscht Spotify, Telegram und Passwörter. Neuer Endpunkt: lokale Vorlage + `conf_update.sh`, Rechte 644 | ⚙ PHP |
| `▶ Medien-Datenbank zurücksetzen` | (Zeile) | A: admin.php:702-705 (`resetDataJson`), :366-372 | `…/server/config/*data.json` | — | `sudo rm …/*data.json` | 🔒 löscht auch active_/offline_data.json. Die Tages-Backups in `config/backup/` bleiben | ⚙ PHP |
| `▶ Server-Konfiguration zurücksetzen` | (Zeile) | A: admin.php:706-709 (`resetConfigJson`), :373-379 | `…/server/config/config.json` | — | `sudo repair_config.sh` (wget von `mupibox.de/version/latest/config/templates/www.json`, set_hostname) | 🔒 braucht Internet. Ohne Netz ist config.json gelöscht und die Box startet nicht. Lokale Vorlage `config/templates/www.json` nehmen | ⚙ PHP |

### Einstellungen › System › Sprache [sprache]

| Schlüssel / Aktion | Beschriftung | Heute | Speicherort | Lesen | Schreiben / Ausführen | Nebenwirkung / Hinweis | Status |
|---|---|---|---|---|---|---|---|
| `appLang` | Sprache der App (18) | E: `.lang-select` (index.html:72-73, :226-231), app.js:4233-4246 → `setLangPref()` i18n.js:1374 | Browser: `localStorage['eltern.lang']` (`auto`/`de`/`en`) | `readPref()` i18n.js:1331, sonst `navigator.languages` | nur im Browser | heute nur **de/en** (i18n.js:1329). Für 16 weitere Sprachen fehlen die Übersetzungen. Kein Backend nötig | ＋ neu (teilweise) |
| `boxLang` | Sprache der Box (17) | E: Display-Texte (`#display-lang`, app.js:860-928) und Startbild-Editor (`#bs-lang`, app.js:2763) · A: mupi.php:1117 (`dt_language`) und :991 (`bootscreenLanguage`) | **zwei Schlüssel:** `displayLanguage` (Overlays Limit/Ruhe/QR) und `mupibox.bootscreenLanguage` (Start- und Wartungsbilder) | `GET /api/eltern/display-texts` rt:399, `GET /api/eltern/bootscreen` rt:1675 (Sprachliste aus `…/www/assets/i18n/display-texts.json`) | `POST /api/eltern/display-texts` rt:409 (Regex, setzt auch die Texte!) und `POST /api/eltern/bootscreen` rt:1699 (setzt alle 4 Felder, dann `bootscreen_update.sh`) | Der Prototyp legt zwei getrennte Einstellungen zu einer zusammen. Nötig: eine Route, die beide Schlüssel setzt, ohne die Texte und Bildauswahl anzufassen, und danach bootscreen_update.sh startet | ＋ neu (kombiniert) |

---

### Login heute (zwei Mechanismen)

**1. Admin-Oberfläche (PHP, Port 80), „interfacelogin“**

- **Speicherort:** `mupiboxconfig.json` → `interfacelogin.state` (bool: Login an/aus) und `interfacelogin.password` (Hash). Vorlage (`config/templates/mupiboxconfig.json`): `state: false`. Die Admin-Oberfläche ist ab Werk also **ohne Passwort offen**. Der Hash ist `$2y$10$tA27…` = bcrypt des Standardpassworts **„MuP1B0x“**, das auf der Seite selbst genannt wird (admin.php:489).
- **Hash-Format:** PHP `password_hash($pw, PASSWORD_DEFAULT)` = bcrypt `$2y$10$…` (admin.php:401). Prüfung mit `password_verify()` (header.php:214, admin.php:394).
- **Anmeldung:** Jede Seite bindet header.php ein. Ist `state` an und die Sitzung nicht angemeldet, zeigt header.php nur das Login-Formular (POST `password`) und beendet danach (header.php:211-252). Bei Erfolg: `session_regenerate_id(true)` (gegen Session Fixation), `$_SESSION['logged_in']=true`, Weiterleitung. Bei Fehler: `sleep(1)`, sonst keine Sperre und keine Begrenzung pro IP.
- **Sitzung:** Standard-PHP-Sitzung (Cookie `PHPSESSID`, Dateien des PHP-Session-Handlers), Cookie `httponly` + `SameSite=Lax` (header.php:5), kein `Secure` (HTTP). **60 min Leerlauf-Timeout** über `$_SESSION['last_activity']` (header.php:43-55, auth_check.php:32-36), keine absolute Höchstdauer. Hintergrund-Abfragen verlängern die Sitzung nicht (`$AUTH_CHECK_NO_TOUCH`, auth_check.php:50-54). Downloads und XHR laufen über `includes/auth_check.php` (401 statt HTML). Abmelden über `logout.php` (Sitzung leeren, Cookie ablaufen lassen, `session_destroy`).
- **CSRF:** Token pro Sitzung (`bin2hex(random_bytes(32))`, csrf.php:31-36). Wird in jedem POST geprüft (header.php:22, `hash_equals`) und automatisch in jedes `<form method=post>` eingesetzt (header.php:23-28). GET-Schnellaktionen (Ausschalten, Neustart, Chrome) brauchen `csrf_token` in der URL (header.php:136). Der Restore-Upload prüft vorher selbst (admin.php:24-45). jsoneditor.php prüft zusätzlich selbst.
- **Passwort ändern:** admin.php:384-406: mindestens 6 Zeichen, das aktuelle Passwort ist Pflicht, sobald ein Hash existiert (also immer). Danach save + `setting_update.sh`. **An/Aus:** admin.php:409-422 (`change_login`). Entfernen ist nicht möglich. Der JSON-Editor hält `interfacelogin` fest (jsoneditor.php:49-55). Ein Backup-Restore überschreibt es.

**2. Eltern-App (Node, Port 8200, `/parents`, früher `/eltern`)**

- **Zwei Wege zur Sitzung:**
  - **Magic Link:** Token aus 32 zufälligen Bytes (64 Hex-Zeichen), **15 min** gültig, **nur einmal** verwendbar (auth.ts:20-22, 129-177). Gespeichert in `/tmp/.eltern_magic_links.json` (tmpfs). Erzeugt nur von der Box selbst: `POST /api/eltern/magic-link/generate` mit `localOnly` + `ipRateLimit(10)` (rt:187). Aufrufer sind der Telegram-Bot (`/login` → `send_magic_link()` telegram_receiver.py:186/353, nur für erlaubte chatIds) und das Display (Statusanzeige `settingsAccessTimer` s lang drücken → QR mit `http://<LAN-IP>:8200/parents?token=…`, eltern-magic-link.service.ts:38-60). Eingelöst über `GET /parents?token=` (`buildElternLandingHandler`, rt:2170-2189; ohne Rate-Limit, bei 64-Hex-Token aber unkritisch).
  - **Passwort (optional, seit Phase 17h):** `POST /api/eltern/login {password}` mit `ipRateLimit(5/min/IP)` (rt:259). Nur möglich, wenn ein Passwort gesetzt ist, sonst 401.
- **Hash-Format:** `mupiboxconfig.json` → `eltern.password = { salt: <16 Byte hex>, hash: <32 Byte hex> }`, **scrypt** (Node `crypto.scrypt`, Standardparameter N=16384, r=8, p=1), Vergleich mit `timingSafeEqual` (auth.ts:219-279). Mindestens **4** Zeichen (auth.ts:221). Setzen und Löschen über `POST /api/eltern/password` (rt:281): nur Sitzung + CSRF nötig, **kein aktuelles Passwort**. Ein leerer String löscht das Passwort.
- **Sitzung:** `issueSession()` auth.ts:147: Session-ID aus 32 zufälligen Bytes + eigenes CSRF-Token, gespeichert in `/tmp/.eltern_sessions.json` (tmpfs, übersteht einen Neustart von pm2, **nicht aber einen Neustart der Box**). Cookie `mupibox_eltern_session`, `HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`, kein Secure (rt:75-77). **Feste Laufzeit von 24 h ab Ausstellung** (purge nach `issued`, auth.ts:112-121). `lastSeen` wird zwar hochgezählt, verlängert aber nichts und wird nicht gespeichert. Die IP wird nur mitgeschrieben, nicht gebunden. Abmelden: `POST /api/eltern/logout` (rt:293).
- **Schutz pro Anfrage:** `localNetworkOnly` (nur private IP-Adressen, middleware.ts:26-51) → `requireSession` (Cookie, middleware.ts:71) → bei Änderungen `requireCsrf` (Header `x-mupibox-csrf` muss zum Token der Sitzung passen, middleware.ts:85). Das Token holt sich die App per `GET /api/eltern/session` (rt:239). Dazu kommt global der `browserGuard` (Host-Allowlist gegen DNS-Rebinding, Cross-Site-Anfragen werden abgelehnt). Einzelne `/api/*`-Routen außerhalb von `/api/eltern` (Spielzeit, Ruhezeit) nutzen `localOrElternSession` (Loopback **oder** Sitzung + CSRF).
- **Kein An/Aus-Schalter:** Die Eltern-App verlangt immer eine Sitzung. Ohne Passwort bleibt nur der Magic Link.

**Unterschiede, die beim Zusammenführen zu lösen sind:** bcrypt `$2y$` gegen scrypt `{salt,hash}` (Vorschlag: Node prüft beide, bcryptjs versteht `$2y$` wie `$2b$`, und schreibt beim nächsten Setzen scrypt) · Mindestlänge 6 gegen 4 · aktuelles Passwort nötig (PHP) gegen nicht nötig (Node) · 60 min Leerlauf gegen 24 h fest · Login-Schalter (PHP, ab Werk aus) gegen immer an (Node) · Standardpasswort „MuP1B0x“ (PHP) gegen keines · zwei Cookies. Cookies unterscheiden nicht nach Port, beide gehen an beide Ports. Mit SameSite=Strict könnte ein gemeinsames Cookie beide Oberflächen abdecken. Ein Magic Link (Telegram oder QR) meldet heute **nur** in der Eltern-App an. Soll er künftig auch die Root-Funktionen (Update, Restore, JSON) freischalten, ist das eine Sicherheitsentscheidung: evtl. für 🔒-Aktionen eine erneute Passworteingabe verlangen.

---

### Lücken und Auffälligkeiten (Teil 3)

**⚙ PHP → neuer Node-Endpunkt nötig**
- wlanopt `wOnboard`: `sudo set_onboard_wifi.sh on|off` wiederverwenden, Status per grep in config.txt, Hinweis auf nötigen Neustart.
- wlanopt `usbDrv` + „Treiber installieren“: lokale `scripts/online/install_rtl*.sh`/`remove_*` im Hintergrund starten (nicht curl von main), Status = Treiber-Ordner vorhanden.
- wlanopt `usbPm`: Logik aus network.php:84-117 (modprobe.d `rtw_power_mgnt`) übernehmen. Festlegen, wie der Schalter auf die Stufen 0/2 abgebildet wird.
- wlanopt `dhcpTo`: sed auf dhclient.conf (network.php:146-159).
- wlanopt `wMon` / `wBest`: `systemctl enable|disable --now dietpi-wifi-monitor` bzw. `mupi_autoconnect-wifi`, Status per `systemctl is-active`.
- wlanopt „WLAN neu starten“ / „DHCP erneuern“: Befehle aus network.php:290-303 im Hintergrund starten, mit verzögerter Antwort (die Verbindung reißt ab).
- wlanopt `ipCtl`: `mupibox.ip_control_backend` + setting_update.sh + **pm2 restart server** (fehlt heute).
- freigaben `samba` / `ftp` / `vnc`: apt-Befehle aus network.php hinter der apt-flock von service.php:20-23, im Hintergrund. VNC-Merker `tweaks.vnc` über `updateMupiboxConfig`. Status per `systemctl is-active smbd|proftpd|mupi_novnc`.
- telegram „Chat-ID ermitteln“: `telegram_set_deviceid.sh`, vorher `mupi_telegram` anhalten (sonst ist getUpdates leer), dann Liste ergänzen.
- mqtt: alle 13 Felder. `GET/POST /api/eltern/mqtt-config` nach dem Muster von telegram-config (Passwort nur schreiben), danach `systemctl restart mupi_mqtt` (und enable/disable).
- wled: alle 10 Felder. `GET/POST /api/eltern/wled-config` + Lese-Endpunkt Geräteinfo/Presets (`wled_get_data.py`), curl an `/settings/leds` für das Boot-Preset.
- passwort `pwCur`: Prüfung des aktuellen Passworts in `POST /api/eltern/password` ergänzen.
- passwort `loginOn`: gibt es nur in PHP. In der gemeinsamen App entscheiden, ob „ohne Anmeldung“ überhaupt erlaubt sein soll (Node verlangt heute immer eine Sitzung).
- ueber „Neuigkeiten“: news.txt holen, zwischenspeichern und als Text ausliefern.
- ueber „Support-Infos“: ZIP in Node, Konfig über `redactSecrets()` filtern.
- updates `versions` + Update-Knöpfe: version.json lesen (zwischenspeichern), `start_mupibox_update.sh <stable|beta|dev>` als abgekoppelter Prozess, Fortschritt aus `/boot/mupibox_update.log`.
- updates „Betriebssystem aktualisieren“: apt update/upgrade im Hintergrund mit apt-Sperre und Log-Abfrage.
- backup Konfig-/Voll-Backup: Streaming-ZIP mit Sitzungsprüfung.
- backup „Backup einspielen“ (+ Dateiauswahl): Upload (vorhandenes `eltern/upload.ts` als Vorbild) + Whitelist-Logik aus admin.php:86-129 + conf_update + hostname + Neustart.
- neustart Display / Spotify / PM2 / Einstellungen übernehmen: vier kleine Endpunkte (`restart_kiosk.sh`, `spotify_restart.sh`, `pm2 restart server` abgekoppelt, `setting_update.sh`).
- protokolle `log`/`grep`/Aktualisieren/Herunterladen/`◉ log`: Whitelist von backend.php nach Node übertragen (`tail`/`journalctl`/`systemctl status` per execFile), Ausgabe als Text.
- protokolle `ctlDebug`: logLevel in der Konfig des spotifycontrollers + `pm2 restart spotify-control`. „PM2-Log herunterladen“: ZIP.
- systemopt `ocSd`, `pm2Ram`, `waitNet`, `turbo`, `gov`, `noWarn`, `swap`: Befehle aus mupi.php:115-272. Beim Entfernen **nicht** `head -n -1` übernehmen, sondern gezielt `sed -i '/^…$/d'`.
- browser `gpu`, `smooth`, `kiosk`, `cache`, `chromeDebug`: Konfigwerte + Neustart des Kiosk. `cache` gegen die Whitelist prüfen, Booleans streng prüfen.
- experten `host`: Regex + `change_hostname` + setting_update + Hinweis auf nötigen Neustart.
- experten JSON-Editor: nur mupiboxconfig, über die gemeinsame Sperre, Geheimnisse schwärzen, `interfacelogin` **und `eltern.password`** festhalten.
- experten drei Resets: lokale Vorlagen statt wget, Rechte 644, vorher ein automatisches Backup.

**＋ neu**
- sprache `appLang`: 16 weitere Sprachen (Übersetzungen) für die App. Der Mechanismus (localStorage) ist schon da.
- sprache `boxLang`: eine Einstellung, die `displayLanguage` **und** `mupibox.bootscreenLanguage` gemeinsam setzt (eigene Route, danach bootscreen_update.sh).
- Login: ein gemeinsames Passwort und eine gemeinsame Sitzung für beide Oberflächen (siehe oben).

**Fehler, Unstimmigkeiten, Sicherheit**
- 🔒 **Stored XSS in der Log-Anzeige:** logviewer.php:91-94 setzt Log-Text per `innerHTML` ein. `POST /api/logs` (srv:3513) nimmt ohne Anmeldung beliebigen Text an und schreibt ihn in server-out.log. Jedes Gerät im WLAN kann so JavaScript in die Admin-Oberfläche bringen, bis hin zur Root-Ausführung.
- 🔒 `POST /api/reboot` und `/api/shutdown` (srv:3587/3604) sowie `/api/addwlan`, `DELETE /api/wifi/configured/:id`, `POST /api/wifi/configured/:id/password|band` haben **keine Anmeldung**. Die Eltern-App nutzt reboot/shutdown ohne CSRF.
- 🔒 VNC (x11vnc/noVNC) läuft **ohne Passwort**: volle Fernsteuerung des Displays an allen Logins vorbei.
- 🔒 Samba-Passwort fest `mupibox` (network.php:163). FTP im Klartext.
- 🔒 support_data.php gibt Salt und Hash des Eltern-Passworts (scrypt) mit aus, weil die Zeilen einzeln gefiltert werden.
- 🔒 Der JSON-Editor hält `eltern.password` nicht fest und umgeht Sperre und Backup. Die VNC-Knöpfe schreiben die Konfig per `cat <<< jq > file`, ebenfalls ohne Sperre.
- 🔒 Update, Treiber-Installation, Samba/FTP-Vorlagen und resetMupiConf laden Skripte und Dateien **live vom Upstream-`main`** und führen sie als root aus (nicht die Fork-Version). resetMupiConf setzt chmod 777 auf die Konfig.
- 🔒 `chromium.cachesize` wird nicht geprüft und landet in Bash-Arithmetik (Befehlsausführung als dietpi). `chromium.gpu/sccrollanimation/kiosk` werden als Befehle ausgeführt (`if ${VAR}`).
- ⚠ mupi.php:165/240 (und tweaks.php): Das Ausschalten von „SD übertakten“ und „Warnungen ausblenden“ löscht per `head -n -1` die **letzte Zeile von /boot/config.txt**, egal was dort steht.
- ⚠ admin.php:322: „Einstellungen übernehmen“ bindet header.php doppelt ein → fataler Fehler „Cannot redeclare“. Der Knopf funktioniert nicht.
- ⚠ admin.php:354: „Spotify-Dienste neu starten“ ruft das nicht vorhandene `spotify_restartspotify_restart.sh` auf (Tippfehler). Der Knopf ist wirkungslos.
- ⚠ admin.php:344: „PM2 neu starten“ startet nur `server` (nicht spotify-control) neu.
- ⚠ Telegram über die Eltern-App: nur `systemctl restart`, kein enable. War der Dienst vorher per PHP deaktiviert, ist der Bot nach dem nächsten Neustart weg. PHP löscht den Token beim Speichern mit leerem Feld, Node lässt ihn stehen (unterschiedliche Bedeutung).
- ⚠ MQTT: `mqtt.name` fehlt in Vorlage und conf_update.sh → mqtt.py:935 KeyError. Änderungen an Broker, Port, Topic, Zugangsdaten und Intervallen starten mupi_mqtt nicht neu (wirken erst nach dem nächsten Start). Beim HA-Schalter läuft der Neustart vor dem Speichern.
- ⚠ WLED: Speichern ohne erreichbares Gerät setzt `active=false`, Helligkeiten auf 0 und Presets auf leer (die Felder werden nicht angezeigt, aber gespeichert). `boot_active` nutzt kein Skript der Box. `mupi_shutdown.sh` ignoriert `wled.active`.
- ⚠ `POST /api/eltern/wlan/remove` (rt:1059) verliert die Bandwahl (`freq_list`) aller Netze. Richtig wäre `wifiSaveConfig()` aus srv:2369. Umgekehrt schützt `DELETE /api/wifi/configured/:id` das aktive Netz nicht.
- ⚠ `POST /api/eltern/bootscreen` setzt immer alle vier Felder: Wer nur `boxName` schickt, setzt Startbild, Wartungsbild und Sprache zurück.
- ⚠ `ip_control_backend`: PHP meldet „Services restarted“, startet aber nichts neu. Der Server liest config.json nur beim Start.
- ⚠ Logviewer: `proftpd.service.service` steht nicht in der Whitelist von backend.php (Fehler 400). `mupi_rotary` und `wpa_supplicant` fehlen in der Auswahl.
- ⚠ admin.php:175 lädt `version.json` bei jedem Aufruf ohne Zwischenspeicher von GitHub (ohne Netz: Wartezeit). Update und OS-Update laufen synchron im PHP-Request.
- ⚠ network.php:36-53 führt bei jedem Aufruf mehrere `sudo iwconfig/route/cat`-Befehle aus, deren Ergebnis nicht mehr angezeigt wird (toter Code). Die Handler `scan_wifi`/`delete_wifi` (:249-275) haben kein Formular mehr.
- ⚠ PHP gibt viele Konfigwerte ohne Escaping in value-Attributen aus (smart.php: MQTT-Felder, Telegram-Token). Möglich ist XSS über Werte, die die Eltern-App oder der JSON-Editor gesetzt haben.
- ⚠ Uneinheitliche Mindestlänge des Passworts (PHP 6, Node 4) und Hash-Verfahren (bcrypt gegen scrypt). Das Standard-Adminpasswort „MuP1B0x“ steht öffentlich in der Oberfläche. Die Admin-Anmeldung ist ab Werk aus.

