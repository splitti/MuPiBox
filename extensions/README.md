# MuPiBox extension guideline

An extension adds something to the MuPiBox that the base does not do: a clock in the header, the weather, a USB CD drive. It is
**one file** (`<id>-<version>.mpx`, a zip) that the box installs from a catalog, or that you upload by hand, and removes again.
The base of the box works without any extension, and an extension that fails must never take the base down with it.

This page is the guideline for people who write extensions. The reference for the programming interfaces (what `player.js`,
`api.js` and `display.js` can call) is [docs/extensions.md](../docs/extensions.md) (in German). Examples are in this folder:
[`clock`](clock) (the smallest one), [`weather`](weather) (API part, display part, settings) and [`cd`](cd) (player part, udev rule).

## 1. Quick start

1. Make a folder `extensions/<id>/` with a `manifest.json` and the parts you need.
2. Pack it: `node tools/mpx/pack.mjs <id>`. This writes `extensions/dist/<id>-<version>.mpx` and adds the entry (size, SHA-256,
   what it sets up, what it needs) to `extensions/catalog.json`.
3. Try it: in the web app go to *Settings › System › Extensions › Upload file* and choose the `.mpx`. The box reads it, tests it
   against what is already in use on the box and shows you what it would set up. Nothing is installed before you confirm.
4. Commit the folder, the `.mpx` and the catalog and open a pull request against `dev5.1`.

## 2. What is in the package

| File | Runs in | What for |
|---|---|---|
| `manifest.json` | – | **Required.** Name, version, what it needs, settings, what it sets up. |
| `player.js` | the player (`spotify-control`, Node, CommonJS) | playback, devices, album sources |
| `api.js` | the API (`server`, Node, CommonJS) | routes under `/api/ext/<id>/…`, background work |
| `display.js` | the display (Chromium, ES module) | tabs, buttons, header items, overlays |
| `*.py` | a child process of the API part | Python programs the API part starts itself (`hostApi` 6), for what Node cannot do, such as speaking SPI; never served |
| `icon.svg` | the app | a small SVG shown on the extensions page (up to 4 KB it is also shown before the install) |
| `units/*.service`, `units/*.timer` | systemd | services of the extension, see section 5 |
| `*.rules` | udev | access rights for a device, see section 5 |

Every part is optional: bring only what you need. Allowed file types are `js`, `mjs`, `json`, `svg`, `png`, `jpg`, `css`, `txt`,
`md`, `html`, `rules`, `service`, `timer` and (`hostApi` 6) `py`. A package is at most **16 MB**, and what is in it may be up to three times that unpacked. The whole file is held in memory while the box reads it, so keep it as small as you can. The web app never runs code of an extension: it draws the
settings card from what the manifest declares.

## 3. `manifest.json`

```json
{
  "id": "mydevice",
  "name": "My device",
  "version": "1.0.0",
  "description": "One sentence: what it does for the person who owns the box.",
  "hostApi": 2,
  "api": "api.js",
  "icon": "icon.svg",
  "resources": {
    "ports": [{ "port": 9100, "proto": "tcp", "purpose": "talks to the device" }],
    "gpio": [{ "pin": 22, "purpose": "status LED" }],
    "services": [{ "name": "mpx-mydevice.service", "provides": true, "purpose": "reads the device" }]
  },
  "system": {
    "units": [{ "name": "mpx-mydevice.service", "file": "units/mpx-mydevice.service" }],
    "groups": ["audio"],
    "packages": ["libusb-1.0-0"]
  },
  "settings": { "interval": { "type": "number", "default": 10, "min": 1, "max": 60 } },
  "ui": { "title": "My device", "items": [{ "key": "interval", "label": "Check every (seconds)" }] }
}
```

- **`id`**: lowercase letters, digits and `-`, 2–31 characters, starting with a letter. It never changes.
- **`version`**: `major.minor.patch`. Raise it with every change you publish; the box offers an update when the catalog has a higher
  number than the installed one.
- **`hostApi`**: the number of the interface you wrote the extension for (`1` to `6`; `3` is needed for an `order` field, `4` for a `roster`, `5` for a `gpio` setting, a `heading` or a page of your own, `6` for a `status` block, see below). A box does not load an extension made for a
  newer interface than its own.
- **`resources`** is **required** (`{}` means "needs nothing"), see section 4.
- **`settings`** and **`ui`**: what the extension stores and how the settings card looks. Types are `boolean`, `string`, `number`
  and `secret` (a token or password: the box never sends it back to the app, only whether one is set).
  A `ui` item can also be a list the user puts in order by dragging (`hostApi` 3): `"type": "order"` with `choices` (the names and
  labels), for a `string` setting whose value is the names, comma separated, in the chosen order (the default must name every choice once).
  A `ui` item can also be a `roster` (`hostApi` 4): a list the extension keeps itself, such as the users of the box. It has no setting and no `key`, but four
  addresses of the extension's own API part, `list` (GET, `{ current, users: [{ id, name }], busy }`), `add` (`{ name }`), `remove` (`{ id }`) and `select` (`{ id }`), and optionally `color` (`{ id, color }`: the entries have a colour, `#RRGGBB`, that can be changed from a list of `colors` that `list` gives);
  the app shows the entries with buttons to switch and delete, and a field to add one. With `hostApi` 4 the API part also gets `host.updateConfig(mutate)`,
  `host.paths` (`{ library, data, extensions }`) and `host.restartServices()`.
  With `hostApi` 5 a setting can be a **pin the user chooses**: `"type": "gpio"`, default `0` (none), otherwise the BCM number 2–27 (at most 16
  such settings, no `options`, `min`/`max` or `pattern`). The app shows a list of the pins and disables those in use, naming who holds them;
  the box checks again when the value is saved, and a chosen pin counts as taken for everyone else. Use this instead of `resources.gpio` when
  the wiring is the user's decision, and read the pins again when the settings change: `host.onSettings(fn)` calls `fn(settings)` in the API
  part after every save (`host.apiUrl` is the address of the box's own server). Also with `hostApi` 5: a `ui` item `{ "type": "heading",
  "label": "…" }` (no `key`) puts a headline between groups of fields, up to 80 items are allowed, and `dep` may name a `gpio` setting (the
  field appears once a pin is chosen). A field with `choices` can have a second choice beside it: `"extra": { "key": "<a setting with options>", "label": "…", "when": [values of
  the field], "choices": [...] }` is a list shown right of the field while the field has one of the values of `when` (by how much, beside
  "louder"). A heading and the fields up to the next one are a group: `"rename": "<a string setting>"` lets the user
  name the group (the heading becomes a text field with the label as its placeholder), `"optional": "<a boolean setting>"` makes it a group
  the user adds with a "+" and removes again (groups in a row with the same label share one "+"; removing clears the group's pins and name).
  `"place": "system"` in `ui` gives the extension a page of its own under Settings › System › "The box";
  `"adopt": ["rotary"]` shows the core's "rotary encoder and buttons" page there and hides it in its old place while the extension is on.
  With `hostApi` 6 a `ui` item can be a **status block**: `{ "type": "status", "label": "…", "state": "/api/ext/<id>/<name>" }` (no `key`). The
  route is in your API part and needs the login of the parents; it answers `{ "rows": [{ "label": "…", "value": "…", "tone": "ok|warn|error" }] }`
  (at most 12 rows), and the app asks it every 2.5 seconds while the card is open. Report fixed sentences, not composed ones: the app translates a
  text if it knows it exactly.
- **`system`**: what the box sets up as root, see section 5.
- Texts in the manifest are shown as written. The app translates a text only if it knows it exactly, so write yours in English
  unless the extension is meant for one language only. (The extensions shipped in this repository are written in German, the source
  language of the app, and their texts are translated by the app's own language files, `src/backend-api/src/mupi-app/i18n/`.)

## 4. Declare what you need: `resources`

Before anything is installed the box **tests** what the extension declares against what is already in use, and the app shows both
to the person who installs it. So say it honestly and completely:

- **`ports`**: every port you listen on (1024 and above, `tcp` or `udp`).
- **`gpio`**: every pin you use, as the BCM number 2–27.
- **`services`**: systemd services. `"provides": true` means *you bring it* (it must not exist yet). Without it you only *rely on* it
  (a missing one is a warning).

The test compares with the core of the box (its ports, the pins of its configuration), the boot configuration (`dtoverlay`, `dtparam`),
all other extensions (also switched-off ones) and what runs right now. A clash is an **error**: nothing is installed, and the app says
who holds it. The same test runs again when someone switches the extension on. A new version is not in conflict with its own old one.

The declaration is checked, not enforced: an extension is a program of the box's user, so it can do more than it says. That is why
extensions come from the catalog or from sources the owner trusts. Declare anyway: it is how clashes are found before they hurt.

## 5. What the box sets up for you: `system`

Everything here happens once, at install time, with root rights, and **only these four kinds exist**. Each is checked.

### `udev`: access to a device
`{ "name": "99-mpx-<id>.rules", "file": "99-mpx-<id>.rules" }`. The file may only match (`KERNEL`, `SUBSYSTEM`, `ATTRS{…}`, …) and
assign `MODE`, `GROUP`, `OWNER`, `TAG` and `SYMLINK`. `RUN`, `PROGRAM`, `IMPORT` and `ENV` are refused.

### `units`: systemd services and timers from the package
`{ "name": "mpx-<id>[-suffix].service" | ".timer", "file": "units/<name>" }`, at most four.

- The name **must** start with `mpx-<id>`, and every unit **must** also be listed in `resources.services` with `"provides": true`.
  That way the conflict test knows it.
- The unit file may only use a short list of plain settings:
  - `[Unit]`: `Description`, `After`, `Before`, `Wants`, `Requires`
  - `[Service]`: `Type`, `ExecStart`, `ExecStartPre`, `ExecStartPost`, `ExecStop`, `ExecReload`, `Restart`, `RestartSec`,
    `WorkingDirectory`, `Environment`, `TimeoutStartSec`, `TimeoutStopSec`, `RemainAfterExit`, `StandardOutput`, `StandardError`,
    `SyslogIdentifier`, `Nice`, `KillMode`
  - `[Timer]` (timers only): `OnCalendar`, `OnBootSec`, `OnStartupSec`, `OnActiveSec`, `OnUnitActiveSec`, `OnUnitInactiveSec`,
    `Persistent`, `AccuracySec`, `RandomizedDelaySec`
  - `[Install]`: `WantedBy=multi-user.target` or `timers.target`
- Programs need an absolute path. Write `@EXT_DIR@` for the folder of your extension; the box puts the real path in:
  `ExecStart=/usr/bin/node @EXT_DIR@/daemon.js`. The prefixes `+` and `!` (which lift restrictions) are refused, and so is a line that
  continues on the next one.
- **Not allowed** (and therefore refused): `User`, `Group`, capabilities, `PermissionsStartOnly` and every other setting not in the list.
- Your service does **not** run as root. The box adds a drop-in that sets `User=dietpi` and `NoNewPrivileges=yes`.
- The box enables and (re)starts the units after installing, stops and disables them when the extension is switched off, and removes
  the files when the extension is removed. A unit that an update no longer has is removed too.

```ini
[Unit]
Description=My device reader
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/node @EXT_DIR@/daemon.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### `groups`: group membership
The user `dietpi` is added to the group. Allowed: `cdrom`, `audio`, `video`, `plugdev`. Groups stay when the extension is removed,
because other programs may need them.

### `packages`: Debian packages
Installed with `apt-get install` (no recommended extras). Names look like `libusb-1.0-0`. Packages stay when the extension is removed.

### What there is no field for
- **Downloading code at install time** (from GitHub or anywhere else). The package is fixed by its checksum; what it would fetch is
  not. If you need a program, put it into the package (16 MB) or use a Debian package.
- Running your own script as root, `pip`, `npm`, changing system files, other users, firewall rules.

If you need one of these, open an issue first: the answer is to add a new checked kind of step, not to work around the checks.

## 6. Rules for a good extension

**Be safe**
- An extension runs without protection. Do what the description says and nothing else.
- Keep tokens and passwords in `secret` settings. Never write them to a log, never send them anywhere the user has not chosen.
- Say in the description if the extension talks to the internet, and to whom. Do not contact anything the user did not ask for.
- Validate what you read from outside (network, device, user input). Never build a shell command from it.
- Take care with licenses: bundled third-party code needs its license in the package (see `weather/LICENSE-steelseries.md`) and an entry
  in `THIRD_PARTY_NOTICES.md`.

**Be quiet**
- Catch your own errors. A throwing `activate` or a failing route only switches your extension off; make sure it does no more than that.
- Playback has priority. Do not block the player, do not poll fast (cache results, one request per minute is plenty for most things),
  do not wake the display.
- Keep to your own port, pin and service names. Do not edit files you did not create.
- Store your data in `host.dataDir`; it survives updates.

**Be small**
- Prefer the simplest part: a header item needs only `display.js`. Add `api.js` only if you need the network or a background job.
- Keep the package well below the 16 MB limit: it is downloaded and unpacked on a small computer, and every extra megabyte is memory the player could use.

## 7. Publishing and updates

- Put the folder in `extensions/<id>/`, the packed file in `extensions/dist/` and the entry in `extensions/catalog.json` (`pack.mjs` does
  the last two). Never change a published `.mpx`: its checksum is in the catalog. Publish a new version number instead.
- When the catalog has a higher version, the installed extension shows *"There is a new version of … available. View details or
  update now."* under its buttons. An update runs the same test and the same question as an install.
- Tests of your extension go to `extensions/<id>/test/*.test.js` and are not packed:
  `node --test extensions/<id>/test/*.test.js`.
- New code comments are written in English.

## 8. Checklist before you open a pull request

- [ ] `manifest.json` has `id`, `name`, `version`, `description`, `hostApi` and **`resources`** (`{}` if nothing)
- [ ] every port, pin and service is declared, and every unit is also in `resources.services` with `"provides": true`
- [ ] unit files use only allowed settings and `@EXT_DIR@` paths; udev rules only match and assign
- [ ] uploading the packed file in the app shows what you expect, and the conflict test passes on a real box
- [ ] switching it off and removing it leaves nothing running and nothing behind (except groups and packages)
- [ ] nothing secret in logs or in the package; third-party code has its license
- [ ] version raised, `.mpx` packed again, catalog updated; your tests pass
