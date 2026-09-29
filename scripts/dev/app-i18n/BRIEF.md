# Translating the MuPiBox app

New texts later: `node scripts/dev/app-i18n/extract.cjs` then `--check -v` lists what each language lacks; a few can be
added to `i18n/<lang>.json` by hand, many are split into parts and translated as below, then put together with
`node scripts/dev/app-i18n/merge.cjs`.

The MuPiBox is a music box for children (Raspberry Pi with a touch display, plays Spotify, local files, a NAS and radio).
The app translated here is the **parents' app** in the browser (phone or computer): listening, daily playtime and quiet
times, the library, and all settings of the box (Wi-Fi, Bluetooth, battery, display, system, updates).

## The task

`src/backend-api/src/mupi-app/i18n/_parts/source.1.json` … `source.4.json` (split from `i18n/_source.json`, which `extract.cjs` writes) hold the German texts of the app (arrays of strings). For each source file N write
`<lang>.N.json` next to it: one JSON object mapping **every** German text (exactly as in the source, as the key) to its
translation. Then check the file with

    node scripts/dev/app-i18n/check-parts.cjs <lang>

and fix what it reports, until it says `ok` for all four parts.

## Rules

- **Placeholders**: `{}` stands for a value the app puts in (a number, a name, a date). Keep exactly as many `{}` as
  the German text has. They are filled in order; where the language needs another order, write `{0}`, `{1}`, …
  (numbered from 0 in the order of the German text), e.g. `"{} von {}"` → `"{1} の {0}"`.
- Keep product and technical names: MuPiBox, Spotify, Spotify Connect, Smart-Sync, NAS, Telegram, MQTT, WLED, VNC,
  Samba, FTP, DHCP, DNS, IP, LAN, USB, GPIO, SD card (translate "SD-Karte" as the usual word for SD card), JSON, Chromium,
  DietPi, MuPiHAT, OnOffShim, Home Assistant, Pi-Blaster, apt, pm2, file names, paths, commands, units (min, h, s, °C,
  mA, V, MB, GB, dBm, px, %).
- Keep symbols as they are: `·`, `›`, `–`, `…`, `→`, `✓`, emoji, quotes style may follow the language.
- Short and plain, as in a phone app. Use the register usual for consumer apps in the language (e.g. French "vous",
  Spanish "tú", Dutch "je", Polish impersonal/infinitive forms where natural). Buttons stay short.
- A German text that is already English, a name or a code (e.g. "Port", "Status", "Theme", "Podcast", "{} MB") is
  kept or adapted only where the language really says it otherwise.
- Some texts are examples from design data (numbers, "740 MB / 3,7 GB", names). Translate their words, keep the values;
  numbers stay in the German format only if they are part of a value you cannot tell apart (keep them as they are).
- Never leave a value empty. Do not add or drop keys. The JSON must be valid (escape `"` and `\` inside strings).

## Glossary (German → English; translate the English meaning into your language consistently)

| German | English | note |
|---|---|---|
| Box | box | the MuPiBox device itself |
| Display / Anzeige | display / screen | the box's touch screen |
| Hören | Listen | area of the app |
| Spielzeit | Playtime | how long the child may listen per day |
| Tageslimit | daily limit | |
| Ruhezeit | quiet time | time windows with no music (homework, night) |
| Schlaftimer | sleep timer | |
| Bibliothek | Library | |
| Inhalt / Inhalte | item / items (content) | an album, playlist, folder … in the library |
| Hörspiel | audio play / audiobook | children's audio drama |
| Kategorie | category | |
| Künstler | artist | |
| Cover | cover | album art |
| Eltern | parents | |
| Einstellungen | Settings | |
| WLAN | Wi-Fi | |
| Akku | battery | |
| Netzteil | power supply / charger | |
| Taster | button (hardware power button) | |
| Drehregler | rotary knob | |
| Lüfter | fan | |
| Lautstärke | volume | |
| Startbild / Startbildschirm | boot screen | shown while the box starts |
| Wartungsanzeige | maintenance screen | |
| Vorlesen | read-aloud (text to speech) | the box speaks names |
| Anmeldung | sign-in / login | |
| Passwort | password | |
| Neustart / neu starten | restart | |
| Ausschalten | shut down / switch off | |
| Sicherung / Backup | backup | |
| Protokolle | logs | |
| Freigaben | shares (network shares) | Samba, FTP, VNC |
| Fortsetzen | resume | continue where the child stopped |
| Leerlauf | idle | |
| Ordner | folder | |
| Sender | station (radio) | |
| an / aus | on / off | switch states |

The box's own display texts in all languages are in `src/frontend-box/src/assets/i18n/display-texts.json`
(e.g. what "Ruhezeit" is called on the display): use the same words where they fit.
