# Ausschalt-Timer (Schlaftimer) – Entwickler-Doku

Stand: MuPiBox Classic 5.0.12. Verbindlich für Home Assistant ist der gemeinsame Vertrag:
[classic-api-contract.md](https://github.com/splitti/MuPiBox-homeassistant/blob/main/docs/classic-api-contract.md)
(Abschnitt „Power-off sleep timer“) und die Classic-Checkliste
[CLASSIC_SLEEP_TIMER.md](https://github.com/splitti/MuPiBox-homeassistant/blob/main/docs/CLASSIC_SLEEP_TIMER.md).

## Was er tut

Der Timer schaltet **die ganze Box aus**, wenn die Zeit um ist: In den letzten 20 Sekunden blendet er die Lautstärke aus,
dann stoppt er die Wiedergabe, stellt die Lautstärke für den nächsten Start zurück und ruft `poweroff` auf (das reguläre
Herunterfahren mit Abschiedsbild und Ton über `mupi_startstop`).

Er ist **kein** Wiedergabe-Timer und keine Kindersicherung. Davon getrennt sind:

| Funktion | Wirkung | Wo |
| --- | --- | --- |
| Ausschalt-Timer (dieses Dokument) | Box aus | `scripts/mupibox/sleep_timer.sh` |
| Ruhe sofort, Ruhezeiten, Tageslimit | nur Wiedergabe gesperrt | Player, `playtime` |
| Auto-Aus ohne Wiedergabe | Box aus nach Leerlauf | `idle_shutdown.sh` |

## Aufbau: ein Timer pro Box

Alle Wege gehen über **ein** Skript, `/usr/local/bin/mupibox/sleep_timer.sh` (als root):

```
sleep_timer.sh start <Sekunden>   starten (1..86400), ein laufender wird ersetzt
sleep_timer.sh stop               stoppen, auch wenn keiner läuft
sleep_timer.sh status             {"active":..,"ends_at":..,"deadline":..,"remaining_s":..,"phase":..}
sleep_timer.sh <Sekunden>         wie start (alte Aufrufform)
sleep_timer.sh run <id>           der Countdown selbst (nur von start über systemd-run)
```

Rückgabewerte: `0` erledigt (Status auf stdout), `2` falscher Aufruf, `3` die Box schaltet sich schon aus (nichts
geändert), `4` Timer konnte nicht gestartet/gestoppt werden.

| Baustein | Aufgabe |
| --- | --- |
| `/run/mupibox/sleep_timer.json` | die Frist: `id`, `deadline` (Unix-Sekunden), `seconds`, `ends_at` (RFC 3339 mit Zeitzone), `phase` (`running`/`shutdown`), ggf. `fade_from`. Für alle lesbar (0644). `/run` ist nach einem Neustart der Box leer – ein Timer feuert nie ein zweites Mal. |
| systemd-Einheit `mupi-sleep-timer` | der Countdown als transiente Einheit (`systemd-run --collect`). Es gibt sie nur einmal (Name), sie läuft unabhängig vom App-Server weiter, und `Restart=on-failure` startet sie nach einem Absturz neu; sie läuft dann zur selben Frist weiter, eine inzwischen überfällige Frist schaltet sofort aus. |
| `/run/mupibox/sleep_timer.lock` | `flock`: start, stop und der letzte Schritt des Countdowns laufen nacheinander. |
| `/tmp/.time2sleep` | Restsekunden, nur noch zur Kompatibilität für alte Leser; wird beim Ende entfernt. Sein Dasein allein bedeutet **nichts**. |

### Warum nur einer laufen kann

- `start` nimmt die Sperre, beendet die laufende Einheit (`systemctl stop`, wartet, deren Trap stellt die Lautstärke
  zurück), schreibt die neue Frist und startet die neue Einheit. Erst dann kommt die Antwort. Ein ersetzter Countdown kann
  nicht mehr ausschalten.
- Der Countdown prüft jede Sekunde, ob die `id` in der Statusdatei noch seine ist; sonst endet er.
- Sein letzter Schritt (Phase `shutdown` setzen) läuft unter derselben Sperre. Kommt ein Stopp vorher, wurde der
  Countdown schon beendet. Kommt er danach, findet er `shutdown` und antwortet mit `3`, also nie mit einem falschen Erfolg.
- Keine `nohup`-Starts und kein `pkill -f` mehr.

### Zustand lesen

`src/backend-api/src/sleep-timer.ts` liest die Statusdatei und fragt `systemctl is-active mupi-sleep-timer` (ohne root).
Aktiv ist der Timer nur, wenn die Einheit läuft oder die Phase `shutdown` ist. Eine liegengebliebene Datei ohne Countdown
zählt nicht. `remaining_s` wird aufgerundet.

## Aufrufer

| Aufrufer | Wie |
| --- | --- |
| Eltern-App | `GET /api/app/sleeptimer`, `POST /api/app/sleeptimer/start {minutes: 1..1440}`, `POST /api/app/sleeptimer/stop` (Session + CSRF, unverändert, intern über `sleep-timer.ts`). Neu: 409 `shutting_down`, 503 bei Fehler. |
| Home Assistant | `POST /api/ha/v1/sleep_timer`, `sleep_timer` in `GET /api/ha/v1/state`, Fähigkeit `sleep_timer` in `/info` (unten) |
| Telegram | `/sleep <Minuten>` und die Knöpfe 5–60 → `sudo sleep_timer.sh start`; Fehler werden gemeldet |
| Altes Admin-Interface | `parental.php` → `sleep_timer.sh start/stop/status` |
| Sprachausgabe | Ansage „gleich geht die Box aus“ aus `sleepTimerState()` |

Die Höchstdauer der Box-Oberflächen bleibt 1440 Minuten, die Home-Assistant-Schnittstelle erlaubt laut Vertrag 720.

## Home-Assistant-API v1

Nur über HTTPS (Port 8443) mit Bearer-Token aus der Kopplung. Auf Port 8200/80 antwortet `/api/ha/v1/*` mit
`426 https_required`.

### Fähigkeit

`GET /api/ha/v1/info` (Recht `read`) meldet `"sleep_timer"` in `capabilities`, sobald auf der Box das Skript dieser
Version und `systemd-run` vorhanden sind. Ältere Versionen melden es nicht – die Integration zeigt dann keine
Timer-Entitäten.

### Starten, ersetzen, stoppen

`POST /api/ha/v1/sleep_timer` (Recht `power`), `Content-Type: application/json`, einziges Feld `minutes`, eine
JSON-Ganzzahl 0..720:

```json
{"minutes": 30}
```

Antwort 200, erst nachdem die Änderung gemacht ist:

```json
{"success": true, "sleep_timer": {"active": true, "ends_at": "2026-10-17T23:30:00+02:00", "remaining_s": 1800}}
```

`{"minutes": 0}` stoppt, auch ohne laufenden Timer:

```json
{"success": true, "sleep_timer": {"active": false, "ends_at": null, "remaining_s": 0}}
```

| Situation | HTTP | `error` |
| --- | --- | --- |
| Erfolg | 200 | – |
| kein JSON, falscher Content-Type, anderes Feld, `minutes` fehlt/null/Text/Kommazahl | 400 | `invalid_request` |
| Ganzzahl unter 0 oder über 720 | 400 | `invalid_value` |
| Token fehlt/ungültig/widerrufen | 401 | `unauthorized` |
| Token ohne `power` (nur `read`, `control`, `notify`) | 403 | `insufficient_scope` |
| http statt https | 426 | `https_required` |
| Timer konnte nicht geändert werden, oder die Box schaltet sich schon aus | 503 | `temporarily_unavailable` |

Ungültige Anfragen ändern den Timer nicht.

### Zustand

`GET /api/ha/v1/state` (Recht `read`) enthält zusätzlich, ohne die bisherigen Felder zu ändern:

```json
"sleep_timer": {"active": true, "ends_at": "2026-10-17T23:30:00+02:00", "remaining_s": 1800}
```

Ohne Timer immer `{"active": false, "ends_at": null, "remaining_s": 0}`. `ends_at` ist der Beginn des Ausschaltens, nicht
das Ende der Stromversorgung. Ab der Frist ist `remaining_s` 0 bei `active: true`, bis die Box aus ist.

### Rechte und Kopplung

Das Recht `power` gibt es nur, wenn es beim Koppeln am Display mit „Alles erlauben“ bestätigt wurde. Es wird bestehenden
Kopplungen nie nachträglich gegeben. Soll ein Home Assistant ohne `power` den Timer stellen, muss neu gekoppelt werden.
Den Zustand (Restzeit) sieht jede Kopplung mit `read`.

## Tests

- `src/backend-api/src/sleep-timer.spec.ts` (`npm test` in `src/backend-api`): Zustand (auch liegengebliebene Datei,
  Aufrunden, RFC 3339, Phase `shutdown`), Starten/Ersetzen/Stoppen, Reihenfolge gleichzeitiger Aufrufe, Fehlercodes;
  HA-Routen mit Test-Kopplungen (`MUPIBOX_HA_DIR`): 200/400/401/403/426/503, `/state`, `/info`. Das Skript wird dabei
  nicht ausgeführt.
- `scripts/tests/sleep_timer_test.sh` (auf einer Box: `sudo bash scripts/tests/sleep_timer_test.sh scripts/mupibox/sleep_timer.sh`):
  das echte Skript mit eigener Einheit, eigenem Statusordner, einer Datei statt des Mixers und einem `poweroff`, das nur
  eine Zeile schreibt (**nie ein echtes Ausschalten**). Prüft Start, Ersetzen, ersetzter Timer schaltet nicht aus,
  doppeltes Stoppen, gleichzeitige Aufrufe, Stopp und Ersetzen während der Ausblendung (Lautstärke zurück), abgestürzter
  Countdown (Neustart, gleiche Frist), überfällige Frist (einmal aus), Ablauf (einmal aus, Lautstärke zurück, kein
  zweites Mal), falsche Eingaben, alte Aufrufform, Datei ohne Countdown.

Ein echtes Ausschalten auf Hardware nur nach ausdrücklicher Freigabe.

## Fehlersuche

```
sudo /usr/local/bin/mupibox/sleep_timer.sh status
systemctl status mupi-sleep-timer
journalctl -u mupi-sleep-timer        # gestartet, ersetzt, gestoppt, abgelaufen
cat /run/mupibox/sleep_timer.json
```

Die Aufrufe von App und Home Assistant stehen im Log des Servers (`[ha-api] sleep timer …`).

## Bekannte Grenzen

- Ab der Phase `shutdown` lässt sich nichts mehr ändern; die Box fährt herunter.
- Schlägt `poweroff` selbst fehl, endet der Timer trotzdem (er versucht es nicht erneut) – im Journal steht „shutdown failed“.
- Die Frist hängt an der Systemuhr. Wird die Uhr während eines laufenden Timers stark verstellt, verschiebt sich das Ende
  entsprechend.
