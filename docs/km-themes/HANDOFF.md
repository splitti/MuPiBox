# Handoff: MuPiBox km-Themes (30 Designs + Cover-Flow-Variante „Bühne“)

## Überblick
Neue Theme-Familie für die MuPiBox-Kinderoberfläche (Angular 20 + Ionic 8, Chromium-Kiosk, Pi 4, Touch 800 × 480). Alle Themes teilen **einen Aufbau** (Maße, Bedienung, Zustände) und unterscheiden sich in Farben, Hintergrundmotiv, Maskottchen und ggf. Schrift.

**Themes (Id → Anzeigename):** `kuschelmond` → Kuschelmond · `moosnest` → Moosnest · `sonnenhof` → Sonnenhof · `pferdehof` → Pferdehof · `fussball` → Fußball · `fahrzeuge` → Fahrzeuge · `buecherregal` → Bücherregal · `kassettenrekorder` → Kassettenrekorder · `unterwasser` → Unterwasser · `bastelpapier` → Bastelpapier · `prinzessin` → Prinzessin · `einhorn` → Einhorn · `feenschloss` → Feenschloss · `weltraum` → Weltraum · `dinoland` → Dinoland · `piratenbucht` → Piratenbucht · `tagundnacht` → Tag & Nacht

**Ziel dieser Umsetzung**
1. Alle 30 Themes vollständig übernehmen (CSS, Assets, Aufbau-Änderungen in Angular).
2. In **MuPi-Conf → Theme** sind alle 30 auswählbar (zusätzlich zu den bestehenden Themes).
3. Für diese Themes gibt es in MuPi-Conf einen **Schieberegler „Cover-Flow-Ansicht“** (an/aus). Aus = normale Reihe (3 Einträge), an = **Bühne** (großes Cover in der Mitte, Nachbarn kleiner). Der Regler ist nur sichtbar, wenn ein km-Theme gewählt ist.
4. Bestehende Themes (inkl. dem alten `coverflow`) bleiben unverändert funktionsfähig.

## Über die Design-Dateien
Die Dateien in `design-reference/` sind **Design-Referenzen in HTML** (interaktive Prototypen), **kein Produktionscode**. Sie zeigen Aussehen und Verhalten exakt; die Aufgabe ist, dies **in der bestehenden Angular/Ionic-App** mit ihren Mustern nachzubauen. Öffnen: `design-reference/Kuschelmond Theme.dc.html` im Browser (braucht `support.js` daneben und Internet für die Vorschau-Schrift). Dort sind alle Themes, alle Zustände, die Bühne, Tag & Nacht und eine Auflösungs-Vorschau zu sehen. Jede `Mupi Screen <Theme>.dc.html` ist ein bedienbarer 800 × 480-Bildschirm eines Themes (Knöpfe darunter schalten Overlays/Ansicht).

Die Dateien in `box/` sind dagegen **direkt verwendbar**: Theme-CSS, SVG-Assets, Metadaten.

## Fidelity
**High-Fidelity.** Farben, Maße, Radien, Schatten, Schriftgrößen und Animationen sind final. Pixelgenau nachbauen. Cover-Bilder in den Prototypen sind Platzhalter (Farbfläche + Kürzel) – in der App die echten Cover.

---

## 1. Paketinhalt

```
box/
  themes/<id>.css            30 Theme-Dateien (Variablen + gemeinsamer Teil + Besonderheiten)
  themes/km-themes.json      Metadaten + alle Tokens aller Themes (für Registry/MuPi-Conf)
  theme-data/<id>/background.svg, maskottchen.svg (schlafend), maskottchen-wach.svg, cover-platzhalter.svg
  theme-data/tagundnacht/    zusätzlich background-nacht.svg, maskottchen-nacht(-wach).svg
design-reference/            HTML-Prototypen (Referenz)
screens/<id>/                22 Bildschirmfotos aller Zustände pro Theme (siehe Kapitel 11)
original-brief/              ursprüngliche Anforderungen (Bildschirme, Technik)
```

**Schriften (fehlen im Paket, bitte holen):** aus github.com/google/fonts
- `ofl/fredoka/Fredoka[wdth,wght].ttf` → `/theme-data/_fonts/Fredoka-Variable.ttf`
- `ofl/baloo2/Baloo2[wght].ttf` → `/theme-data/_fonts/Baloo2-Variable.ttf` (für `fussball`, `fahrzeuge`)
- jeweils `OFL.txt` daneben (`/theme-data/_fonts/OFL-Fredoka.txt`, `OFL-Baloo2.txt`). Keine Google-Fonts-/CDN-Links (offline).
Falls `theme-data/_fonts` nicht ausgeliefert wird, die Dateien stattdessen in jeden `theme-data/<id>/` legen und den `@font-face`-Pfad anpassen.

## 2. Architektur der Umsetzung

### 2.1 Theme-Registry (neu)
`src/app/theme/km-themes.ts` aus `km-themes.json` erzeugen (Ids, Labels, `light`, Maskottchen-Pfade, `dayNight`). Funktion `isKmTheme(id)`.

### 2.2 ThemeService / Body-Klassen (neu oder im bestehenden Theme-Code)
Beim Laden der Konfiguration und bei jeder Änderung:
- `active_theme.css` wie bisher auf `themes/<id>.css` setzen (bestehender Mechanismus).
- Wenn `isKmTheme(id)`: `<body>` bekommt `km km-theme-<id>` (+ `km-light` bei hellem Theme).
- Wenn zusätzlich Konfig **`themeStage === true`**: `km-stage`.
- `tagundnacht`: Timer (jede Minute) setzt `km-night` zwischen 18:00 und 07:00 **oder** während einer aktiven Ruhezeit. Beim Wechsel: Layer `.km-daynight-fade` (in der CSS) 300 ms einblenden → Klasse umschalten → 300 ms ausblenden. Maskottchen-Pfade nachts `maskottchen-nacht*.svg`.
- Signal/Getter `kmMascot(state: 'sleeping'|'awake')` → Pfad für die Overlays.
- Bei Nicht-km-Theme alle km-Klassen entfernen.

### 2.3 Konfiguration
- Bestehender Theme-Schlüssel (dort, wo heute `steampunk`, `coverflow`, `unicorn` … gespeichert werden) nimmt die neuen Ids auf.
- **Neuer Schlüssel `themeStage`** (boolean, Standard `false`) im selben Konfig-Objekt. Die App liest ihn wie die übrigen Theme-Einstellungen; Änderung ohne Neustart übernehmen, wenn die App Konfig-Änderungen schon live lädt, sonst wie beim Theme-Wechsel.
- Das bestehende Theme `coverflow` (3D) bleibt ein eigenes Theme und hat mit `themeStage` nichts zu tun.

### 2.4 MuPi-Conf (Admin-Oberfläche)
Die Stelle finden, an der die Theme-Auswahl gebaut wird (z. B. im Admin-Quellcode nach `steampunk` / `coverflow` suchen).
- Alle 30 Ids mit Anzeigenamen aus `km-themes.json` ergänzen; optional als eigene Gruppe „Kinder-Themes (km)“.
- Darunter ein **Schieberegler/Toggle „Cover-Flow-Ansicht“** mit Hilfetext: „Großes Cover in der Mitte, Nachbarn kleiner. Wischen oder Nachbar antippen holt ihn in die Mitte.“ Nur einblenden, wenn ein km-Theme gewählt ist; speichert `themeStage`.
- Optional (empfohlen) zweiter Toggle „Name beim Anhalten vorlesen“ (`themeStageAutoRead`, Standard aus) – nur bei aktiver Bühne sichtbar.
- Beim Speichern denselben Weg wie bei der bisherigen Theme-Auswahl gehen (Konfig schreiben, Theme-Datei kopieren/verlinken, ggf. Dienst neu laden).
- Theme-Dateien installieren: `themes/*.css` und `theme-data/*` dorthin, wo die bestehenden Themes liegen (Install-/Update-Skript ergänzen).

## 3. Aufbau-Änderungen in der App (HTML/TS)
Alle Änderungen nur wirksam, wenn `body.km` gesetzt ist bzw. über `isKmTheme()` geschaltet – bestehende Themes dürfen sich nicht ändern.

### 3.1 `swiper.component` – normale Reihe
- `swiperData`/`shownData` pro Eintrag um `kind: 'artist' | 'folder' | 'album' | 'own'` und `synced: boolean` erweitern. `kind` aus derselben Logik ableiten, die heute beim Antippen verzweigt (Ordner öffnet nächste Ebene, Album spielt, erster Eintrag mit eigenen Titeln = `own`). `synced` = automatisch aus Spotify synchronisiert.
- Cover-`ion-card`: `[class.km-folder]="d.kind==='folder'"`, `[class.km-own]="d.kind==='own'"`. Darin (nur bei km):
  - Ordner: `<span class="km-stack"></span><span class="km-stack"></span>` + `<span class="km-badge"><ion-icon name="folder"></ion-icon></span>`
  - Eigene Titel: `<span class="km-own-label">Alle Titel hier</span>` + `<span class="km-badge"><ion-icon name="play"></ion-icon></span>`
  - Sync: `<span class="km-sync"><ion-icon name="link"></ion-icon></span>`
  - Cover fehlt / Ladefehler: `<div class="km-missing"><img [src]="kmMascot('awake')"></div>`
- Namens-`ion-card`: `[class.km-speaking]="speakingName() === d.name"`. `readText()` setzt `speakingName` und löscht es beim Ende der Sprachausgabe (Ereignis `onend` bzw. Dienst-Callback), spätestens nach 1,8 s.
- Weniger als 3 Einträge: Klasse `km-few` am Container (zentriert).
- Kein Lautsprecher-Symbol in der Namensleiste (bewusst entfernt). Text mittig, einzeilig mit „…“.

### 3.2 `swiper.component` – Bühne (`km-stage`)
Eigener Zweig `@else if (kmStage())` vor dem normalen Zweig:
```html
<div class="km-stage-wrap">
  <swiper-container #swiper class="km-stage" centered-slides="true" slides-per-view="auto" space-between="0"
     watch-slides-progress="true" (swiperprogress)="applyKmStage()" (swipersettranslate)="applyKmStage()"
     (swiperinit)="applyKmStage()" (swiperslidechange)="onKmStageChange()" [attr.scrollbar]="!hideScrollbar()">
    @for (d of shownData(); track $index + ':' + d.name) {
      <swiper-slide (click)="kmStageTap($index, d)">
        <ion-card class="km-stage-card" [class.circle-card]="roundImages()" [class.km-folder]="d.kind==='folder'" [class.km-own]="d.kind==='own'">
          <img [src]="d.imgSrc | async"> <!-- + dieselben km-Abzeichen wie in 3.1 -->
        </ion-card>
      </swiper-slide>
    }
  </swiper-container>
  <div class="km-stage-name" [class.km-speaking]="speakingName() === current()?.name" (click)="readText(current()!.name)">
    <span>{{ current()?.name }}</span>
  </div>
</div>
```
- `applyKmStage()`: pro Slide `p = Math.min(Math.abs(slide.progress), 2)`; `--km-s` = 1 → 0.65 → 0.45 (linear zwischen 0/1/2), `--km-o` = 1 → 0.6 → 0.3; horizontaler Abstand der Mittelpunkte: Nachbar 250 px, übernächster 420 px (über `translateX` auf der Karte ausgleichen, da Slides 260 breit sind). Nur `transform`/`opacity`.
- `kmStageTap(i, d)`: `i === activeIndex` → wie bisher `elementClicked.emit(d)`; sonst `swiper.slideTo(i)` (öffnet nichts).
- `onKmStageChange()`: wenn `themeStageAutoRead`, `readText(current().name)`.
- Scrollbalken: Position = `activeIndex / (n − 1)`; Griff-Breite `max(24, 200 / n)`.
- Bei Wechsel der Kategorie / Seite: `slideTo(0, 0)`.
- Gilt für Startseite (runde Bilder, Ring 6 px) und Albumliste (Radius 26 px). Nachschub der Liste (15 + 30er-Schritte) wie bisher.

### 3.3 Startseite / Albumliste – Kopfleiste
- Reiter-Symbole: bestehende `book-outline` / `musical-notes-outline` / `server-outline` / `radio-outline` bleiben; Stil kommt aus der CSS (Pille 96 × 56).
- Albumliste: Titel links neben dem Zurück-Knopf, 26/600, einzeilig mit „…“.

### 3.4 Player (`player.page`)
- Knöpfe bekommen Rollen-Klassen: Play/Pause `km-play`; Lauter/Leiser (Standard, keine Klasse); Titel vor/zurück `km-skip`; Spulen + Zufall `km-minor`. Zufall aktiv wie heute über `color="dark"` (CSS macht Akzent daraus).
- Kopfleiste rechts: Lautstärke und „x/y“ als zwei `<span class="km-chip">` nebeneinander (Lautstärke mit `volume-medium`-Symbol).
- Radio/Stream: statt Fortschrittsbalken `<span class="km-live" [class.km-buffering]="buffering()"><i></i>{{ buffering() ? 'Verbinde …' : 'Live' }}</span>`; Titel- und Spul-Reihe entfallen (wie heute).
- Titelliste: links `<div class="km-tl-side"><img [src]="cover"><button class="km-tl-close"><ion-icon name="close"></ion-icon>Zu</button></div>`, rechts die bestehende Liste. Der bisherige Schließen-Knopf oben rechts entfällt bei km.
- Langes Drücken: bestehender Ring; CSS färbt ihn. Cover während des Drückens `scale(.97)`.

### 3.5 Overlays
- **`playtime-blocked-overlay`** (Tageslimit + Ruhezeit): bei km das bestehende `<ion-icon class="icon">` in einen Wrapper legen:
  ```html
  <div class="km-mascot-wrap"><img [src]="kmMascot('sleeping')" alt=""><ion-icon [name]="content().iconName" class="icon"></ion-icon></div>
  <div><h1>…</h1><p>…</p></div>
  ```
  Texte unverändert aus `display-texts.json` (`blockedHeading`/`blockedSubheading`, `quietHeading` frei wählbar/`quietSubheading`). Hintergrund = Theme-Hintergrund auf `--km-overlay`. Nicht wegtippbar (wie heute).
- **`mupi-media-unavailable`**: `<div class="km-unavail"><div class="km-mascot-small"><img [src]="kmMascot('awake')"><ion-icon name="cloud-offline-outline"></ion-icon></div><div class="km-unavail-text">{{ bestehender Text }}</div></div>`
- **`mupi-loading`**: bei km statt `ion-spinner` `<div class="km-dots"><i></i><i></i><i></i></div>` (Animation läuft nur, solange sichtbar).
- **`playtime-chip`**: nur CSS (Stufen über `data-level`).
- **`eltern-magic-link-overlay`**: nur CSS. Langes Drücken auf Status wie bisher (5–10 s).
- **Bildschirm aus**: unverändert schwarz.

## 4. Bildschirme – Maße (für alle Themes gleich, Basis 800 × 480)

**Kopfleiste** 72 hoch, transparent, Innenabstand 0 14 px, Abstand 12. Runde Knöpfe 64 ⌀ (`--km-night-3`, gedrückt `--km-night-4`, scale .9). Reiter-Pille `--km-night-2`, Radius 34, Innenabstand 4, Reiter 96 × 56 Radius 28, Symbol 30 px; aktiv `--km-apricot` + Ink-Symbol. Status: WLAN 28 px, Akku 32 × 17 + Prozent 12/600 darunter.

**Startseite**: Reihe ab y = 106, Slot 266,67 breit (3 sichtbar), Snap je Eintrag. Rundes Bild 208 ⌀ + 6 px Ring `--km-ring`, Schatten `0 6px 0 --km-shadow`, gedrückt scale .93 (180 ms Feder). Namensleiste 232 × 60, Radius 30, `--km-cream`, Schatten `0 4px 0`, Text 21/600 Ink mittig einzeilig „…“, 14 px unter dem Bild. Scrollbalken 200 × 8 mittig, 22 px über dem Rand, Spur `--km-night-3`, Griff `--km-lavender`.

**Albumliste**: Cover 204 × 204, Radius 22, Füllung `--km-night-4`, `object-fit: contain` (Hochformat mittig). Ordner: zwei Stapel-Karten 40 hoch hinter dem Cover (−11 px / −22 px, Einzug 12 / 24 px), Badge 56 ⌀ unten rechts (−10/−10) mit `folder`, Rand 4 px `--km-night`. Eigene Titel: Etikett „Alle Titel hier“ oben links (30 hoch, 15/600) + Badge `play`. Sync: 30 ⌀ oben rechts, `link`. Titel in der Kopfleiste 26/600.

**Bühne**: Mitte 260 × 260 (rund bzw. Radius 26), Nachbarn 65 % / 45 % Größe, 60 % / 30 % Deckkraft, Abstand der Mittelpunkte 250 / 420 px; Übergang 320 ms `cubic-bezier(.2,.7,.2,1)`; beim Ziehen folgt die Bühne dem Finger. Namensleiste 440 × 72 bei y = 372 (relativ Seite), Radius 36, 22/600, **zweizeilig** (line-clamp 2). Ordner-Stapel 50 hoch, Badge 64 ⌀.

**Player**: Cover 320 × 320 bei x 32, y 112 (40 unter Kopfleiste), Radius 28, Schatten `0 8px 0`. Rechte Spalte ab x 384 bis 24 vor Rand, zentriert, Abstände 12: Fortschritt (Spur 12, Radius 6, aktiv `--km-apricot`, Knopf 32 Creme mit 4 px Akzent-Rand, Zielhöhe 48; Zeiten 14/500 `--km-lavender`) · Reihe Leiser 76 ⌀ – Play 116 ⌀ (Akzent, Schatten `0 6px 0 --km-apricot-shadow`, Symbol 54) – Lauter 76 ⌀, Abstand 28 · Reihe Titel zurück/vor 96 × 72, Abstand 56 · Reihe Zurückspulen/Zufall/Vorspulen 72 × 64 `--km-night-2`, Symbol `--km-lavender`, Abstand 24. Kopfleiste: Albumname 22/600, Titel 16/500 `--km-lavender`, Pillen 34 hoch.

**Titelliste**: Panel `--km-night-2` Radius 28, 16 px Rand, oben 42 unter der Kopfleiste (Platz für Hörzeit). Links 200 breit: Mini-Cover 160 Radius 20, „Zu“ 160 × 64 Akzent. Zeilen 64 hoch Radius 20 `--km-night-3`, Abstand 6, Nummer-Kreis 44 ⌀, Name 20/500, Dauer 16; aktuell Akzent + ▶.

**Hörzeit-Abzeichen**: top 76, right 14, 32 hoch, Radius 16, 16/600, `time-outline` 18 px. >10 min `--km-night-3`, 5–10 `--km-apricot`/Ink, <5 `--km-rose`/dunkel. Kein Blur.

**Tageslimit/Ruhezeit**: vollflächig, waagerecht zentriert: Maskottchen 220 × 220 links, Abzeichen 72 ⌀ oben rechts am Maskottchen (`--km-night-3`, Symbol `--km-moon`, Rand 5 px `--km-overlay`); rechts Überschrift 44/600 (max. 2 Zeilen), 14 darunter Unterzeile 24/500 `--km-lavender` zwischen zwei `musical-notes-outline` in Akzent. Seitenabstand 60, Abstand Bild–Text 44.

**Nicht erreichbar**: mittig: Maskottchen wach 130 px, Abzeichen 62 ⌀ `cloud-offline-outline` oben rechts; Text 28/600 `--km-on-bg`, Abstand 14.

**Laden**: 3 Punkte 22 ⌀, Abstand 14, hüpfen 14 px, 1100 ms ease-in-out, 150 ms versetzt, Deckkraft .5 → 1.

**Eltern-QR**: Scrim ohne Blur; Karte 680 × 340 (max. Breite − 32), Radius 32, `--km-cream`, Innenabstand 28: QR 284 × 284 auf Weiß (QR 252), rechts Titel 30/600, Hinweis 17/500, Adresse Monospace 15 auf getönter Fläche Radius 10, Countdown 16/500, „Schließen“ 64 hoch Radius 32 Ink/Creme.

**Bildschirm aus**: `#000`, Touch gesperrt (unverändert).

## 5. Interaktion & Bewegung
- Antippen: scale .93 (Bilder), .95 (Namensleiste), .9 (runde Knöpfe), .92 (Reiter); 150–180 ms `cubic-bezier(.3,1.4,.6,1)` (Feder).
- Vorlesen: Namensleiste `--km-moon` + scale 1.05 für die Dauer der Sprachausgabe (max. 1,8 s Fallback). Keine Dauer-Animation.
- Seitenwechsel: 250 ms, translateX 24 px + opacity, `cubic-bezier(.2,.7,.2,1)` (optional, falls der Router es erlaubt).
- Nur `transform`/`opacity` animieren; keine Blur-/Backdrop-Filter; Hintergründe sind statische SVGs.
- Kein vertikales Scrollen auf Start/Liste/Player; Touch-Ziele ≥ 64 px (Namensleiste 60 hoch × 232 breit ist bewusst so, Play 116).

## 6. Andere Bildschirmgrößen
Basis 800 × 480. Jede Theme-CSS enthält am Ende: `zoom` 1.25 ab 560 px Höhe (1024 × 600), 1.5 ab 700 (1280 × 720), 1.6 ab 760 (1024 × 768), 1.6667 ab 790 (1280 × 800). Breitere Bildschirme zeigen mehr von der Reihe; bei 4 : 3 (< 760 logisch breit) Player-Cover 250 statt 320, Knopf-Abstand 12. Hintergründe: `background-size: cover`, unten verankert. Referenz: `design-reference/Mupi Aufloesung.dc.html`. Auf echter Hardware prüfen.

## 7. Themes im Detail
Alle Werte stehen zusätzlich maschinenlesbar in `box/themes/km-themes.json` und in `:root` jeder Theme-Datei. Die Abkürzungen der Rollen sind bewusst in jedem Theme gleich benannt (`--km-night` ist bei hellen Themes z. B. Himmelblau) – so bleibt der gemeinsame CSS-Teil identisch.

### Kuschelmond — `kuschelmond`

- **Grund:** dunkel → Kopfleisten-Text und Status hell (`--km-on-bg` = Creme)
- **Schrift:** Fredoka (`/theme-data/_fonts/Fredoka-Variable.ttf`)
- **Maskottchen:** Mondi – schläfriger Halbmond. Schlafend: `/theme-data/kuschelmond/maskottchen.svg` (Tageslimit, Ruhezeit) · wach: `/theme-data/kuschelmond/maskottchen-wach.svg` (Nicht erreichbar, Cover fehlt)
- **Hintergrund:** `/theme-data/kuschelmond/background.svg` (SVG, viewBox 800 × 480, `cover`, unten verankert). Motive: Abendhimmel in Pflaume/Indigo mit Sternen, Halbmond, Sternschnuppe, schlafendes Dorf mit leuchtenden Fenstern, Bäume, Eule auf dem Ast, Schäfchen, Glühwürmchen.
- **Referenz:** `design-reference/Mupi Screen.dc.html`
- **Theme-Datei:** `box/themes/kuschelmond.css`

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#241E3D` | Hintergrund |
| `--km-night-2` | `#2E2750` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Info-Pillen |
| `--km-night-3` | `#3A3160` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#4A3F78` | Gedrückt, Cover-Füllfläche (Hochformat) |
| `--km-stack-1` | `#8B7CC4` | Ordner-Stapel vorne |
| `--km-stack-2` | `#5B4E8C` | Ordner-Stapel hinten |
| `--km-shadow` | `#1A1530` | Harte Versatz-Schatten (ohne Blur) |
| `--km-overlay` | `#1B1630` | Tageslimit/Ruhezeit-Grund |
| `--km-cream` | `#FFF3E0` | Namensleiste, Karten |
| `--km-ring` | `#FFE9C9` | Ring um runde Startseiten-Bilder |
| `--km-ink` | `#2A2140` | Text auf hellen Flächen |
| `--km-lavender` | `#CFC6E8` | Sekundärtext, inaktive Reiter-Symbole |
| `--km-apricot` | `#FFB36B` | Akzent: aktiver Reiter, Play, Badges, Balken aktiv |
| `--km-apricot-shadow` | `#B8672C` | Schatten unter Play |
| `--km-moon` | `#FFE3A3` | Namensleiste „liest vor“, Lade-Punkte, Symbol im Overlay-Abzeichen |
| `--km-rose` | `#F2877E` | Hörzeit fast vorbei, Live-Punkt |
| `--km-on-bg` | `#FFF3E0` | Text/Symbole direkt auf dem Hintergrund (Kopfleiste, Status, Overlays) |
| `--km-sync-bg` | `#241E3D` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#FFF3E0` | Sync-Abzeichen Symbol |

**Zustände in diesem Theme** (Aufbau überall gleich, siehe Kapitel 5; hier die konkreten Farben/Assets):

| Zustand | Grund | Hauptelement | Text |
|---|---|---|---|
| Startseite / Albumliste | `#241E3D` + background.svg | Namensleiste `#FFF3E0`, Ring `#FFE9C9` | `#2A2140` |
| Name wird vorgelesen | – | Namensleiste `#FFE3A3`, scale 1.05 | `#2A2140` |
| Aktiver Reiter | Pille `#2E2750` | Reiter `#FFB36B` | Symbol `#2A2140`, inaktiv `#CFC6E8` |
| Player | background.svg | Play `#FFB36B` (Schatten `#B8672C`), Knöpfe `#3A3160` | Symbole `#FFF3E0` |
| Titelliste | Panel `#2E2750` | Zeile `#3A3160`, aktuell `#FFB36B` | `#FFF3E0` / aktuell `#2A2140` |
| Hörzeit normal / knapp / fast vorbei | – | `#3A3160` / `#FFB36B` / `#F2877E` | `#FFF3E0` / `#2A2140` / dunkel |
| **Tageslimit** | `#1B1630` + background.svg | Maskottchen schlafend 220 px + Abzeichen `hourglass-outline` | Überschrift `#FFF3E0`, Unterzeile `#CFC6E8`, Noten `#FFB36B` |
| **Ruhezeit** | wie Tageslimit | Maskottchen schlafend + Abzeichen (Mond-Symbol der App) | wie Tageslimit, Überschrift frei wählbar |
| **NAS/Internet nicht erreichbar** | background.svg | Maskottchen wach 130 px + Abzeichen `cloud-offline-outline` (`#3A3160`) | `#FFF3E0` 28/600 |
| **Laden** | `#241E3D` | 3 Punkte `#FFE3A3` / `#FFB36B` / `#FFE3A3` | – |
| **Cover fehlt** | `#3A3160` | Maskottchen wach 110 px | – |
| **Eltern-QR** | Scrim (siehe CSS) | Karte `#FFF3E0` | `#2A2140`, Knopf `#2A2140` |
| **Bildschirm aus** | `#000000` | – | – |

### Moosnest — `moosnest`

- **Grund:** dunkel → Kopfleisten-Text und Status hell (`--km-on-bg` = Creme)
- **Schrift:** Fredoka (`/theme-data/_fonts/Fredoka-Variable.ttf`)
- **Maskottchen:** Pilzi – Fliegenpilz. Schlafend: `/theme-data/moosnest/maskottchen.svg` (Tageslimit, Ruhezeit) · wach: `/theme-data/moosnest/maskottchen-wach.svg` (Nicht erreichbar, Cover fehlt)
- **Hintergrund:** `/theme-data/moosnest/background.svg` (SVG, viewBox 800 × 480, `cover`, unten verankert). Motive: Waldboden in der Dämmerung: Tannenreihe hinten, große Tannen an den Rändern, Farne, Bäumchen, Fliegen- und Steinpilze, Eicheln, Haselnüsse, Glühwürmchen.
- **Referenz:** `design-reference/Mupi Screen Moosnest.dc.html`
- **Theme-Datei:** `box/themes/moosnest.css`

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#26301F` | Hintergrund |
| `--km-night-2` | `#303C28` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Info-Pillen |
| `--km-night-3` | `#3E4D33` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#4F5F42` | Gedrückt, Cover-Füllfläche (Hochformat) |
| `--km-stack-1` | `#9C7B52` | Ordner-Stapel vorne |
| `--km-stack-2` | `#6A5438` | Ordner-Stapel hinten |
| `--km-shadow` | `#161D12` | Harte Versatz-Schatten (ohne Blur) |
| `--km-overlay` | `#1B2316` | Tageslimit/Ruhezeit-Grund |
| `--km-cream` | `#F3EAD3` | Namensleiste, Karten |
| `--km-ring` | `#E8D9B5` | Ring um runde Startseiten-Bilder |
| `--km-ink` | `#2A2A1C` | Text auf hellen Flächen |
| `--km-lavender` | `#C9D4B8` | Sekundärtext, inaktive Reiter-Symbole |
| `--km-apricot` | `#E39A55` | Akzent: aktiver Reiter, Play, Badges, Balken aktiv |
| `--km-apricot-shadow` | `#9E5E28` | Schatten unter Play |
| `--km-moon` | `#F2D98A` | Namensleiste „liest vor“, Lade-Punkte, Symbol im Overlay-Abzeichen |
| `--km-rose` | `#E07A5F` | Hörzeit fast vorbei, Live-Punkt |
| `--km-on-bg` | `#F3EAD3` | Text/Symbole direkt auf dem Hintergrund (Kopfleiste, Status, Overlays) |
| `--km-sync-bg` | `#26301F` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#F3EAD3` | Sync-Abzeichen Symbol |

**Zustände in diesem Theme** (Aufbau überall gleich, siehe Kapitel 5; hier die konkreten Farben/Assets):

| Zustand | Grund | Hauptelement | Text |
|---|---|---|---|
| Startseite / Albumliste | `#26301F` + background.svg | Namensleiste `#F3EAD3`, Ring `#E8D9B5` | `#2A2A1C` |
| Name wird vorgelesen | – | Namensleiste `#F2D98A`, scale 1.05 | `#2A2A1C` |
| Aktiver Reiter | Pille `#303C28` | Reiter `#E39A55` | Symbol `#2A2A1C`, inaktiv `#C9D4B8` |
| Player | background.svg | Play `#E39A55` (Schatten `#9E5E28`), Knöpfe `#3E4D33` | Symbole `#F3EAD3` |
| Titelliste | Panel `#303C28` | Zeile `#3E4D33`, aktuell `#E39A55` | `#F3EAD3` / aktuell `#2A2A1C` |
| Hörzeit normal / knapp / fast vorbei | – | `#3E4D33` / `#E39A55` / `#E07A5F` | `#F3EAD3` / `#2A2A1C` / dunkel |
| **Tageslimit** | `#1B2316` + background.svg | Maskottchen schlafend 220 px + Abzeichen `hourglass-outline` | Überschrift `#F3EAD3`, Unterzeile `#C9D4B8`, Noten `#E39A55` |
| **Ruhezeit** | wie Tageslimit | Maskottchen schlafend + Abzeichen (Mond-Symbol der App) | wie Tageslimit, Überschrift frei wählbar |
| **NAS/Internet nicht erreichbar** | background.svg | Maskottchen wach 130 px + Abzeichen `cloud-offline-outline` (`#3E4D33`) | `#F3EAD3` 28/600 |
| **Laden** | `#26301F` | 3 Punkte `#F2D98A` / `#E39A55` / `#F2D98A` | – |
| **Cover fehlt** | `#3E4D33` | Maskottchen wach 110 px | – |
| **Eltern-QR** | Scrim (siehe CSS) | Karte `#F3EAD3` | `#2A2A1C`, Knopf `#2A2A1C` |
| **Bildschirm aus** | `#000000` | – | – |

### Sonnenhof — `sonnenhof`

- **Grund:** hell → Kopfleisten-Text, Statussymbole und Overlay-Texte dunkel (`--km-on-bg` = Ink)
- **Schrift:** Fredoka (`/theme-data/_fonts/Fredoka-Variable.ttf`)
- **Maskottchen:** Sonni – Sonne mit Strahlen. Schlafend: `/theme-data/sonnenhof/maskottchen.svg` (Tageslimit, Ruhezeit) · wach: `/theme-data/sonnenhof/maskottchen-wach.svg` (Nicht erreichbar, Cover fehlt)
- **Hintergrund:** `/theme-data/sonnenhof/background.svg` (SVG, viewBox 800 × 480, `cover`, unten verankert). Motive: Sommertag auf dem Bauernhof: Sonne, Wolken, rote Scheune mit weißem Zaun, Apfelbaum, Heuballen, Sonnenblumen, Blumenwiese, Schmetterlinge.
- **Referenz:** `design-reference/Mupi Screen Sonnenhof.dc.html`
- **Theme-Datei:** `box/themes/sonnenhof.css`

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#BFE3E6` | Hintergrund |
| `--km-night-2` | `#FFFFFF` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Info-Pillen |
| `--km-night-3` | `#2F7F8C` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#256B76` | Gedrückt, Cover-Füllfläche (Hochformat) |
| `--km-stack-1` | `#FFF7EA` | Ordner-Stapel vorne |
| `--km-stack-2` | `#E9D6B3` | Ordner-Stapel hinten |
| `--km-shadow` | `#93C3C8` | Harte Versatz-Schatten (ohne Blur) |
| `--km-overlay` | `#F6EBD9` | Tageslimit/Ruhezeit-Grund |
| `--km-cream` | `#FFFFFF` | Namensleiste, Karten |
| `--km-ring` | `#FFFFFF` | Ring um runde Startseiten-Bilder |
| `--km-ink` | `#3B2F2A` | Text auf hellen Flächen |
| `--km-lavender` | `#2F5E66` | Sekundärtext, inaktive Reiter-Symbole |
| `--km-apricot` | `#F28C6B` | Akzent: aktiver Reiter, Play, Badges, Balken aktiv |
| `--km-apricot-shadow` | `#C4613F` | Schatten unter Play |
| `--km-moon` | `#FFD66B` | Namensleiste „liest vor“, Lade-Punkte, Symbol im Overlay-Abzeichen |
| `--km-rose` | `#E85A5A` | Hörzeit fast vorbei, Live-Punkt |
| `--km-on-bg` | `#3B2F2A` | Text/Symbole direkt auf dem Hintergrund (Kopfleiste, Status, Overlays) |
| `--km-sync-bg` | `#256B76` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#FFFFFF` | Sync-Abzeichen Symbol |

**Zustände in diesem Theme** (Aufbau überall gleich, siehe Kapitel 5; hier die konkreten Farben/Assets):

| Zustand | Grund | Hauptelement | Text |
|---|---|---|---|
| Startseite / Albumliste | `#BFE3E6` + background.svg | Namensleiste `#FFFFFF`, Ring `#FFFFFF` | `#3B2F2A` |
| Name wird vorgelesen | – | Namensleiste `#FFD66B`, scale 1.05 | `#3B2F2A` |
| Aktiver Reiter | Pille `#FFFFFF` | Reiter `#F28C6B` | Symbol `#3B2F2A`, inaktiv `#2F5E66` |
| Player | background.svg | Play `#F28C6B` (Schatten `#C4613F`), Knöpfe `#2F7F8C` | Symbole `#FFFFFF` |
| Titelliste | Panel `#FFFFFF` | Zeile `#2F7F8C`, aktuell `#F28C6B` | `#FFFFFF` / aktuell `#3B2F2A` |
| Hörzeit normal / knapp / fast vorbei | – | `#2F7F8C` / `#F28C6B` / `#E85A5A` | `#FFFFFF` / `#3B2F2A` / dunkel |
| **Tageslimit** | `#F6EBD9` + background.svg | Maskottchen schlafend 220 px + Abzeichen `hourglass-outline` | Überschrift `#3B2F2A`, Unterzeile `#2F5E66`, Noten `#F28C6B` |
| **Ruhezeit** | wie Tageslimit | Maskottchen schlafend + Abzeichen (Mond-Symbol der App) | wie Tageslimit, Überschrift frei wählbar |
| **NAS/Internet nicht erreichbar** | background.svg | Maskottchen wach 130 px + Abzeichen `cloud-offline-outline` (`#2F7F8C`) | `#3B2F2A` 28/600 |
| **Laden** | `#BFE3E6` | 3 Punkte `#FFD66B` / `#F28C6B` / `#FFD66B` | – |
| **Cover fehlt** | `#2F7F8C` | Maskottchen wach 110 px | – |
| **Eltern-QR** | Scrim (siehe CSS) | Karte `#FFFFFF` | `#3B2F2A`, Knopf `#3B2F2A` |
| **Bildschirm aus** | `#000000` | – | – |

### Pferdehof — `pferdehof`

- **Grund:** hell → Kopfleisten-Text, Statussymbole und Overlay-Texte dunkel (`--km-on-bg` = Ink)
- **Schrift:** Fredoka (`/theme-data/_fonts/Fredoka-Variable.ttf`)
- **Maskottchen:** Pünktchen – weißes Pony mit hellgrauer Mähne und rosa Schleife. Schlafend: `/theme-data/pferdehof/maskottchen.svg` (Tageslimit, Ruhezeit) · wach: `/theme-data/pferdehof/maskottchen-wach.svg` (Nicht erreichbar, Cover fehlt)
- **Hintergrund:** `/theme-data/pferdehof/background.svg` (SVG, viewBox 800 × 480, `cover`, unten verankert). Motive: Pastell-Koppel: Flieder-Himmel mit Sonne und Wolken, weißer Stall mit rosa Dach, großes braunes Pferd hinter dem Zaun (schaut zwischen 2. und 3. Karte hervor), kleine Stute mit Fohlen, Heuballen, Hufeisen, Herz, Blumen, Schmetterlinge.
- **Referenz:** `design-reference/Mupi Screen Pferdehof.dc.html`
- **Theme-Datei:** `box/themes/pferdehof.css`

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#F3E6F0` | Hintergrund |
| `--km-night-2` | `#FFFFFF` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Info-Pillen |
| `--km-night-3` | `#8E5FA8` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#7A4E94` | Gedrückt, Cover-Füllfläche (Hochformat) |
| `--km-stack-1` | `#FFFFFF` | Ordner-Stapel vorne |
| `--km-stack-2` | `#E4CFE8` | Ordner-Stapel hinten |
| `--km-shadow` | `#D2B9D6` | Harte Versatz-Schatten (ohne Blur) |
| `--km-overlay` | `#F7ECF4` | Tageslimit/Ruhezeit-Grund |
| `--km-cream` | `#FFFFFF` | Namensleiste, Karten |
| `--km-ring` | `#FFFFFF` | Ring um runde Startseiten-Bilder |
| `--km-ink` | `#3A2340` | Text auf hellen Flächen |
| `--km-lavender` | `#6E4A7E` | Sekundärtext, inaktive Reiter-Symbole |
| `--km-apricot` | `#F28DB2` | Akzent: aktiver Reiter, Play, Badges, Balken aktiv |
| `--km-apricot-shadow` | `#C45C86` | Schatten unter Play |
| `--km-moon` | `#FFD86B` | Namensleiste „liest vor“, Lade-Punkte, Symbol im Overlay-Abzeichen |
| `--km-rose` | `#E85A7A` | Hörzeit fast vorbei, Live-Punkt |
| `--km-on-bg` | `#3A2340` | Text/Symbole direkt auf dem Hintergrund (Kopfleiste, Status, Overlays) |
| `--km-sync-bg` | `#7A4E94` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#FFFFFF` | Sync-Abzeichen Symbol |

**Zustände in diesem Theme** (Aufbau überall gleich, siehe Kapitel 5; hier die konkreten Farben/Assets):

| Zustand | Grund | Hauptelement | Text |
|---|---|---|---|
| Startseite / Albumliste | `#F3E6F0` + background.svg | Namensleiste `#FFFFFF`, Ring `#FFFFFF` | `#3A2340` |
| Name wird vorgelesen | – | Namensleiste `#FFD86B`, scale 1.05 | `#3A2340` |
| Aktiver Reiter | Pille `#FFFFFF` | Reiter `#F28DB2` | Symbol `#3A2340`, inaktiv `#6E4A7E` |
| Player | background.svg | Play `#F28DB2` (Schatten `#C45C86`), Knöpfe `#8E5FA8` | Symbole `#FFFFFF` |
| Titelliste | Panel `#FFFFFF` | Zeile `#8E5FA8`, aktuell `#F28DB2` | `#FFFFFF` / aktuell `#3A2340` |
| Hörzeit normal / knapp / fast vorbei | – | `#8E5FA8` / `#F28DB2` / `#E85A7A` | `#FFFFFF` / `#3A2340` / dunkel |
| **Tageslimit** | `#F7ECF4` + background.svg | Maskottchen schlafend 220 px + Abzeichen `hourglass-outline` | Überschrift `#3A2340`, Unterzeile `#6E4A7E`, Noten `#F28DB2` |
| **Ruhezeit** | wie Tageslimit | Maskottchen schlafend + Abzeichen (Mond-Symbol der App) | wie Tageslimit, Überschrift frei wählbar |
| **NAS/Internet nicht erreichbar** | background.svg | Maskottchen wach 130 px + Abzeichen `cloud-offline-outline` (`#8E5FA8`) | `#3A2340` 28/600 |
| **Laden** | `#F3E6F0` | 3 Punkte `#FFD86B` / `#F28DB2` / `#FFD86B` | – |
| **Cover fehlt** | `#8E5FA8` | Maskottchen wach 110 px | – |
| **Eltern-QR** | Scrim (siehe CSS) | Karte `#FFFFFF` | `#3A2340`, Knopf `#3A2340` |
| **Bildschirm aus** | `#000000` | – | – |

### Fußball — `fussball`

- **Grund:** dunkel → Kopfleisten-Text und Status hell (`--km-on-bg` = Creme)
- **Schrift:** Baloo 2 (`/theme-data/_fonts/Baloo2-Variable.ttf`)
- **Maskottchen:** Balli – Fußball mit Gesicht. Schlafend: `/theme-data/fussball/maskottchen.svg` (Tageslimit, Ruhezeit) · wach: `/theme-data/fussball/maskottchen-wach.svg` (Nicht erreichbar, Cover fehlt)
- **Hintergrund:** `/theme-data/fussball/background.svg` (SVG, viewBox 800 × 480, `cover`, unten verankert). Motive: Stadion bei Flutlicht: Rasen mit Mähstreifen, Spielfeldlinien, Tore an beiden Rändern, Eckfahnen, Flutlichter, Fußbälle, Pokal, Hütchen, Anzeigetafel „2 : 1“.
- **Referenz:** `design-reference/Mupi Screen Fussball.dc.html`
- **Theme-Datei:** `box/themes/fussball.css`

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#1F3B2A` | Hintergrund |
| `--km-night-2` | `#244634` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Info-Pillen |
| `--km-night-3` | `#2E5A42` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#3A6E52` | Gedrückt, Cover-Füllfläche (Hochformat) |
| `--km-stack-1` | `#E9F1EA` | Ordner-Stapel vorne |
| `--km-stack-2` | `#B9D3C0` | Ordner-Stapel hinten |
| `--km-shadow` | `#13261B` | Harte Versatz-Schatten (ohne Blur) |
| `--km-overlay` | `#173022` | Tageslimit/Ruhezeit-Grund |
| `--km-cream` | `#FFFFFF` | Namensleiste, Karten |
| `--km-ring` | `#FFFFFF` | Ring um runde Startseiten-Bilder |
| `--km-ink` | `#16261C` | Text auf hellen Flächen |
| `--km-lavender` | `#CDE3D3` | Sekundärtext, inaktive Reiter-Symbole |
| `--km-apricot` | `#FFD23F` | Akzent: aktiver Reiter, Play, Badges, Balken aktiv |
| `--km-apricot-shadow` | `#B8901A` | Schatten unter Play |
| `--km-moon` | `#FFF1A8` | Namensleiste „liest vor“, Lade-Punkte, Symbol im Overlay-Abzeichen |
| `--km-rose` | `#FF7A59` | Hörzeit fast vorbei, Live-Punkt |
| `--km-on-bg` | `#FFFFFF` | Text/Symbole direkt auf dem Hintergrund (Kopfleiste, Status, Overlays) |
| `--km-sync-bg` | `#1F3B2A` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#FFFFFF` | Sync-Abzeichen Symbol |

**Zustände in diesem Theme** (Aufbau überall gleich, siehe Kapitel 5; hier die konkreten Farben/Assets):

| Zustand | Grund | Hauptelement | Text |
|---|---|---|---|
| Startseite / Albumliste | `#1F3B2A` + background.svg | Namensleiste `#FFFFFF`, Ring `#FFFFFF` | `#16261C` |
| Name wird vorgelesen | – | Namensleiste `#FFF1A8`, scale 1.05 | `#16261C` |
| Aktiver Reiter | Pille `#244634` | Reiter `#FFD23F` | Symbol `#16261C`, inaktiv `#CDE3D3` |
| Player | background.svg | Play `#FFD23F` (Schatten `#B8901A`), Knöpfe `#2E5A42` | Symbole `#FFFFFF` |
| Titelliste | Panel `#244634` | Zeile `#2E5A42`, aktuell `#FFD23F` | `#FFFFFF` / aktuell `#16261C` |
| Hörzeit normal / knapp / fast vorbei | – | `#2E5A42` / `#FFD23F` / `#FF7A59` | `#FFFFFF` / `#16261C` / dunkel |
| **Tageslimit** | `#173022` + background.svg | Maskottchen schlafend 220 px + Abzeichen `hourglass-outline` | Überschrift `#FFFFFF`, Unterzeile `#CDE3D3`, Noten `#FFD23F` |
| **Ruhezeit** | wie Tageslimit | Maskottchen schlafend + Abzeichen (Mond-Symbol der App) | wie Tageslimit, Überschrift frei wählbar |
| **NAS/Internet nicht erreichbar** | background.svg | Maskottchen wach 130 px + Abzeichen `cloud-offline-outline` (`#2E5A42`) | `#FFFFFF` 28/600 |
| **Laden** | `#1F3B2A` | 3 Punkte `#FFF1A8` / `#FFD23F` / `#FFF1A8` | – |
| **Cover fehlt** | `#2E5A42` | Maskottchen wach 110 px | – |
| **Eltern-QR** | Scrim (siehe CSS) | Karte `#FFFFFF` | `#16261C`, Knopf `#16261C` |
| **Bildschirm aus** | `#000000` | – | – |

### Fahrzeuge — `fahrzeuge`

- **Grund:** dunkel → Kopfleisten-Text und Status hell (`--km-on-bg` = Creme)
- **Schrift:** Baloo 2 (`/theme-data/_fonts/Baloo2-Variable.ttf`)
- **Maskottchen:** Pylo – Leitkegel mit Gesicht. Schlafend: `/theme-data/fahrzeuge/maskottchen.svg` (Tageslimit, Ruhezeit) · wach: `/theme-data/fahrzeuge/maskottchen-wach.svg` (Nicht erreichbar, Cover fehlt)
- **Hintergrund:** `/theme-data/fahrzeuge/background.svg` (SVG, viewBox 800 × 480, `cover`, unten verankert). Motive: Baustelle und Straße: Asphalt, Warnbake, Mittelstreifen, Bagger, Walze, Kipper, Kranausleger, Ampel, Warnschild, Absperrung, Rennwagen Nr. 7, Leitkegel.
- **Referenz:** `design-reference/Mupi Screen Fahrzeuge.dc.html`
- **Theme-Datei:** `box/themes/fahrzeuge.css` – gelber Ring um runde Bilder

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#2B2F36` | Hintergrund |
| `--km-night-2` | `#353A43` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Info-Pillen |
| `--km-night-3` | `#424854` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#525A68` | Gedrückt, Cover-Füllfläche (Hochformat) |
| `--km-stack-1` | `#E0B53A` | Ordner-Stapel vorne |
| `--km-stack-2` | `#9C7E22` | Ordner-Stapel hinten |
| `--km-shadow` | `#1A1D22` | Harte Versatz-Schatten (ohne Blur) |
| `--km-overlay` | `#1E2126` | Tageslimit/Ruhezeit-Grund |
| `--km-cream` | `#F5F2EA` | Namensleiste, Karten |
| `--km-ring` | `#FFC83D` | Ring um runde Startseiten-Bilder |
| `--km-ink` | `#1E2126` | Text auf hellen Flächen |
| `--km-lavender` | `#C9CED8` | Sekundärtext, inaktive Reiter-Symbole |
| `--km-apricot` | `#FFC83D` | Akzent: aktiver Reiter, Play, Badges, Balken aktiv |
| `--km-apricot-shadow` | `#A67C00` | Schatten unter Play |
| `--km-moon` | `#FFE58A` | Namensleiste „liest vor“, Lade-Punkte, Symbol im Overlay-Abzeichen |
| `--km-rose` | `#FF6B4A` | Hörzeit fast vorbei, Live-Punkt |
| `--km-on-bg` | `#F5F2EA` | Text/Symbole direkt auf dem Hintergrund (Kopfleiste, Status, Overlays) |
| `--km-sync-bg` | `#2B2F36` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#F5F2EA` | Sync-Abzeichen Symbol |

**Zustände in diesem Theme** (Aufbau überall gleich, siehe Kapitel 5; hier die konkreten Farben/Assets):

| Zustand | Grund | Hauptelement | Text |
|---|---|---|---|
| Startseite / Albumliste | `#2B2F36` + background.svg | Namensleiste `#F5F2EA`, Ring `#FFC83D` | `#1E2126` |
| Name wird vorgelesen | – | Namensleiste `#FFE58A`, scale 1.05 | `#1E2126` |
| Aktiver Reiter | Pille `#353A43` | Reiter `#FFC83D` | Symbol `#1E2126`, inaktiv `#C9CED8` |
| Player | background.svg | Play `#FFC83D` (Schatten `#A67C00`), Knöpfe `#424854` | Symbole `#F5F2EA` |
| Titelliste | Panel `#353A43` | Zeile `#424854`, aktuell `#FFC83D` | `#F5F2EA` / aktuell `#1E2126` |
| Hörzeit normal / knapp / fast vorbei | – | `#424854` / `#FFC83D` / `#FF6B4A` | `#F5F2EA` / `#1E2126` / dunkel |
| **Tageslimit** | `#1E2126` + background.svg | Maskottchen schlafend 220 px + Abzeichen `hourglass-outline` | Überschrift `#F5F2EA`, Unterzeile `#C9CED8`, Noten `#FFC83D` |
| **Ruhezeit** | wie Tageslimit | Maskottchen schlafend + Abzeichen (Mond-Symbol der App) | wie Tageslimit, Überschrift frei wählbar |
| **NAS/Internet nicht erreichbar** | background.svg | Maskottchen wach 130 px + Abzeichen `cloud-offline-outline` (`#424854`) | `#F5F2EA` 28/600 |
| **Laden** | `#2B2F36` | 3 Punkte `#FFE58A` / `#FFC83D` / `#FFE58A` | – |
| **Cover fehlt** | `#424854` | Maskottchen wach 110 px | – |
| **Eltern-QR** | Scrim (siehe CSS) | Karte `#F5F2EA` | `#1E2126`, Knopf `#1E2126` |
| **Bildschirm aus** | `#000000` | – | – |

### Bücherregal — `buecherregal`

- **Grund:** dunkel → Kopfleisten-Text und Status hell (`--km-on-bg` = Creme)
- **Schrift:** Fredoka (`/theme-data/_fonts/Fredoka-Variable.ttf`)
- **Maskottchen:** Buchi – Buch mit Gesicht. Schlafend: `/theme-data/buecherregal/maskottchen.svg` (Tageslimit, Ruhezeit) · wach: `/theme-data/buecherregal/maskottchen-wach.svg` (Nicht erreichbar, Cover fehlt)
- **Hintergrund:** `/theme-data/buecherregal/background.svg` (SVG, viewBox 800 × 480, `cover`, unten verankert). Motive: Leseecke aus Nussholz: Wandbretter, Wimpelkette, Regalbrett unter den Namen, Bücherfach mit bunten Buchrücken, Buchstapel, Globus, Zimmerpflanze.
- **Referenz:** `design-reference/Mupi Screen Buecherregal.dc.html`
- **Theme-Datei:** `box/themes/buecherregal.css`

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#3A2A20` | Hintergrund |
| `--km-night-2` | `#46332A` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Info-Pillen |
| `--km-night-3` | `#5A4234` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#6B5040` | Gedrückt, Cover-Füllfläche (Hochformat) |
| `--km-stack-1` | `#C9A77C` | Ordner-Stapel vorne |
| `--km-stack-2` | `#8C6A48` | Ordner-Stapel hinten |
| `--km-shadow` | `#22170F` | Harte Versatz-Schatten (ohne Blur) |
| `--km-overlay` | `#2A1E17` | Tageslimit/Ruhezeit-Grund |
| `--km-cream` | `#FBF1DE` | Namensleiste, Karten |
| `--km-ring` | `#E8D3AE` | Ring um runde Startseiten-Bilder |
| `--km-ink` | `#2A1E17` | Text auf hellen Flächen |
| `--km-lavender` | `#E0CDB4` | Sekundärtext, inaktive Reiter-Symbole |
| `--km-apricot` | `#E8794A` | Akzent: aktiver Reiter, Play, Badges, Balken aktiv |
| `--km-apricot-shadow` | `#A04A24` | Schatten unter Play |
| `--km-moon` | `#F6D57A` | Namensleiste „liest vor“, Lade-Punkte, Symbol im Overlay-Abzeichen |
| `--km-rose` | `#E0604A` | Hörzeit fast vorbei, Live-Punkt |
| `--km-on-bg` | `#FBF1DE` | Text/Symbole direkt auf dem Hintergrund (Kopfleiste, Status, Overlays) |
| `--km-sync-bg` | `#3A2A20` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#FBF1DE` | Sync-Abzeichen Symbol |

**Zustände in diesem Theme** (Aufbau überall gleich, siehe Kapitel 5; hier die konkreten Farben/Assets):

| Zustand | Grund | Hauptelement | Text |
|---|---|---|---|
| Startseite / Albumliste | `#3A2A20` + background.svg | Namensleiste `#FBF1DE`, Ring `#E8D3AE` | `#2A1E17` |
| Name wird vorgelesen | – | Namensleiste `#F6D57A`, scale 1.05 | `#2A1E17` |
| Aktiver Reiter | Pille `#46332A` | Reiter `#E8794A` | Symbol `#2A1E17`, inaktiv `#E0CDB4` |
| Player | background.svg | Play `#E8794A` (Schatten `#A04A24`), Knöpfe `#5A4234` | Symbole `#FBF1DE` |
| Titelliste | Panel `#46332A` | Zeile `#5A4234`, aktuell `#E8794A` | `#FBF1DE` / aktuell `#2A1E17` |
| Hörzeit normal / knapp / fast vorbei | – | `#5A4234` / `#E8794A` / `#E0604A` | `#FBF1DE` / `#2A1E17` / dunkel |
| **Tageslimit** | `#2A1E17` + background.svg | Maskottchen schlafend 220 px + Abzeichen `hourglass-outline` | Überschrift `#FBF1DE`, Unterzeile `#E0CDB4`, Noten `#E8794A` |
| **Ruhezeit** | wie Tageslimit | Maskottchen schlafend + Abzeichen (Mond-Symbol der App) | wie Tageslimit, Überschrift frei wählbar |
| **NAS/Internet nicht erreichbar** | background.svg | Maskottchen wach 130 px + Abzeichen `cloud-offline-outline` (`#5A4234`) | `#FBF1DE` 28/600 |
| **Laden** | `#3A2A20` | 3 Punkte `#F6D57A` / `#E8794A` / `#F6D57A` | – |
| **Cover fehlt** | `#5A4234` | Maskottchen wach 110 px | – |
| **Eltern-QR** | Scrim (siehe CSS) | Karte `#FBF1DE` | `#2A1E17`, Knopf `#2A1E17` |
| **Bildschirm aus** | `#000000` | – | – |

### Kassettenrekorder — `kassettenrekorder`

- **Grund:** dunkel → Kopfleisten-Text und Status hell (`--km-on-bg` = Creme)
- **Schrift:** Fredoka (`/theme-data/_fonts/Fredoka-Variable.ttf`)
- **Maskottchen:** Kassi – Kassette, Spulen sind die Augen. Schlafend: `/theme-data/kassettenrekorder/maskottchen.svg` (Tageslimit, Ruhezeit) · wach: `/theme-data/kassettenrekorder/maskottchen-wach.svg` (Nicht erreichbar, Cover fehlt)
- **Hintergrund:** `/theme-data/kassettenrekorder/background.svg` (SVG, viewBox 800 × 480, `cover`, unten verankert). Motive: 70er-Stereoanlage: Holzmaserung, loses Tonband oben, Musiknoten, Gerätefront mit Farbstreifen, zwei Lautsprecher, Pegelanzeigen, Bandzählwerk, Kassetten. Eckige Tasten im Player.
- **Referenz:** `design-reference/Mupi Screen Kassettenrekorder.dc.html`
- **Theme-Datei:** `box/themes/kassettenrekorder.css` – Besonderheit: eckige Tasten (Radius 12–18), Play 128 × 108, Cover mit 10 px Etikett-Rahmen in Creme

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#2E2521` | Hintergrund |
| `--km-night-2` | `#3A2F29` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Info-Pillen |
| `--km-night-3` | `#4A3C33` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#5C4B40` | Gedrückt, Cover-Füllfläche (Hochformat) |
| `--km-stack-1` | `#E0A458` | Ordner-Stapel vorne |
| `--km-stack-2` | `#B5763A` | Ordner-Stapel hinten |
| `--km-shadow` | `#1A1411` | Harte Versatz-Schatten (ohne Blur) |
| `--km-overlay` | `#221B18` | Tageslimit/Ruhezeit-Grund |
| `--km-cream` | `#F1E6D0` | Namensleiste, Karten |
| `--km-ring` | `#E8A15A` | Ring um runde Startseiten-Bilder |
| `--km-ink` | `#2A201B` | Text auf hellen Flächen |
| `--km-lavender` | `#D9C9B0` | Sekundärtext, inaktive Reiter-Symbole |
| `--km-apricot` | `#E8A15A` | Akzent: aktiver Reiter, Play, Badges, Balken aktiv |
| `--km-apricot-shadow` | `#9A5E26` | Schatten unter Play |
| `--km-moon` | `#F2D27A` | Namensleiste „liest vor“, Lade-Punkte, Symbol im Overlay-Abzeichen |
| `--km-rose` | `#D9573F` | Hörzeit fast vorbei, Live-Punkt |
| `--km-on-bg` | `#F1E6D0` | Text/Symbole direkt auf dem Hintergrund (Kopfleiste, Status, Overlays) |
| `--km-sync-bg` | `#2E2521` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#F1E6D0` | Sync-Abzeichen Symbol |

**Zustände in diesem Theme** (Aufbau überall gleich, siehe Kapitel 5; hier die konkreten Farben/Assets):

| Zustand | Grund | Hauptelement | Text |
|---|---|---|---|
| Startseite / Albumliste | `#2E2521` + background.svg | Namensleiste `#F1E6D0`, Ring `#E8A15A` | `#2A201B` |
| Name wird vorgelesen | – | Namensleiste `#F2D27A`, scale 1.05 | `#2A201B` |
| Aktiver Reiter | Pille `#3A2F29` | Reiter `#E8A15A` | Symbol `#2A201B`, inaktiv `#D9C9B0` |
| Player | background.svg | Play `#E8A15A` (Schatten `#9A5E26`), Knöpfe `#4A3C33` | Symbole `#F1E6D0` |
| Titelliste | Panel `#3A2F29` | Zeile `#4A3C33`, aktuell `#E8A15A` | `#F1E6D0` / aktuell `#2A201B` |
| Hörzeit normal / knapp / fast vorbei | – | `#4A3C33` / `#E8A15A` / `#D9573F` | `#F1E6D0` / `#2A201B` / dunkel |
| **Tageslimit** | `#221B18` + background.svg | Maskottchen schlafend 220 px + Abzeichen `hourglass-outline` | Überschrift `#F1E6D0`, Unterzeile `#D9C9B0`, Noten `#E8A15A` |
| **Ruhezeit** | wie Tageslimit | Maskottchen schlafend + Abzeichen (Mond-Symbol der App) | wie Tageslimit, Überschrift frei wählbar |
| **NAS/Internet nicht erreichbar** | background.svg | Maskottchen wach 130 px + Abzeichen `cloud-offline-outline` (`#4A3C33`) | `#F1E6D0` 28/600 |
| **Laden** | `#2E2521` | 3 Punkte `#F2D27A` / `#E8A15A` / `#F2D27A` | – |
| **Cover fehlt** | `#4A3C33` | Maskottchen wach 110 px | – |
| **Eltern-QR** | Scrim (siehe CSS) | Karte `#F1E6D0` | `#2A201B`, Knopf `#2A201B` |
| **Bildschirm aus** | `#000000` | – | – |

### Unterwasser — `unterwasser`

- **Grund:** dunkel → Kopfleisten-Text und Status hell (`--km-on-bg` = Creme)
- **Schrift:** Fredoka (`/theme-data/_fonts/Fredoka-Variable.ttf`)
- **Maskottchen:** Blubb – gelber Fisch. Schlafend: `/theme-data/unterwasser/maskottchen.svg` (Tageslimit, Ruhezeit) · wach: `/theme-data/unterwasser/maskottchen-wach.svg` (Nicht erreichbar, Cover fehlt)
- **Hintergrund:** `/theme-data/unterwasser/background.svg` (SVG, viewBox 800 × 480, `cover`, unten verankert). Motive: Tiefsee: Meeresboden, Algen, bunte Fische, Luftbläschen.
- **Referenz:** `design-reference/Mupi Screen Unterwasser.dc.html`
- **Theme-Datei:** `box/themes/unterwasser.css`

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#0F2A44` | Hintergrund |
| `--km-night-2` | `#143552` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Info-Pillen |
| `--km-night-3` | `#1C4668` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#25567C` | Gedrückt, Cover-Füllfläche (Hochformat) |
| `--km-stack-1` | `#7FD1C7` | Ordner-Stapel vorne |
| `--km-stack-2` | `#3E8E9A` | Ordner-Stapel hinten |
| `--km-shadow` | `#081A2B` | Harte Versatz-Schatten (ohne Blur) |
| `--km-overlay` | `#0B2036` | Tageslimit/Ruhezeit-Grund |
| `--km-cream` | `#EAF7F5` | Namensleiste, Karten |
| `--km-ring` | `#BDEBE4` | Ring um runde Startseiten-Bilder |
| `--km-ink` | `#0F2A3A` | Text auf hellen Flächen |
| `--km-lavender` | `#B9D6E6` | Sekundärtext, inaktive Reiter-Symbole |
| `--km-apricot` | `#5FD3C1` | Akzent: aktiver Reiter, Play, Badges, Balken aktiv |
| `--km-apricot-shadow` | `#2F8F82` | Schatten unter Play |
| `--km-moon` | `#FFE08A` | Namensleiste „liest vor“, Lade-Punkte, Symbol im Overlay-Abzeichen |
| `--km-rose` | `#FF8A7A` | Hörzeit fast vorbei, Live-Punkt |
| `--km-on-bg` | `#EAF7F5` | Text/Symbole direkt auf dem Hintergrund (Kopfleiste, Status, Overlays) |
| `--km-sync-bg` | `#0F2A44` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#EAF7F5` | Sync-Abzeichen Symbol |

**Zustände in diesem Theme** (Aufbau überall gleich, siehe Kapitel 5; hier die konkreten Farben/Assets):

| Zustand | Grund | Hauptelement | Text |
|---|---|---|---|
| Startseite / Albumliste | `#0F2A44` + background.svg | Namensleiste `#EAF7F5`, Ring `#BDEBE4` | `#0F2A3A` |
| Name wird vorgelesen | – | Namensleiste `#FFE08A`, scale 1.05 | `#0F2A3A` |
| Aktiver Reiter | Pille `#143552` | Reiter `#5FD3C1` | Symbol `#0F2A3A`, inaktiv `#B9D6E6` |
| Player | background.svg | Play `#5FD3C1` (Schatten `#2F8F82`), Knöpfe `#1C4668` | Symbole `#EAF7F5` |
| Titelliste | Panel `#143552` | Zeile `#1C4668`, aktuell `#5FD3C1` | `#EAF7F5` / aktuell `#0F2A3A` |
| Hörzeit normal / knapp / fast vorbei | – | `#1C4668` / `#5FD3C1` / `#FF8A7A` | `#EAF7F5` / `#0F2A3A` / dunkel |
| **Tageslimit** | `#0B2036` + background.svg | Maskottchen schlafend 220 px + Abzeichen `hourglass-outline` | Überschrift `#EAF7F5`, Unterzeile `#B9D6E6`, Noten `#5FD3C1` |
| **Ruhezeit** | wie Tageslimit | Maskottchen schlafend + Abzeichen (Mond-Symbol der App) | wie Tageslimit, Überschrift frei wählbar |
| **NAS/Internet nicht erreichbar** | background.svg | Maskottchen wach 130 px + Abzeichen `cloud-offline-outline` (`#1C4668`) | `#EAF7F5` 28/600 |
| **Laden** | `#0F2A44` | 3 Punkte `#FFE08A` / `#5FD3C1` / `#FFE08A` | – |
| **Cover fehlt** | `#1C4668` | Maskottchen wach 110 px | – |
| **Eltern-QR** | Scrim (siehe CSS) | Karte `#EAF7F5` | `#0F2A3A`, Knopf `#0F2A3A` |
| **Bildschirm aus** | `#000000` | – | – |

### Bastelpapier — `bastelpapier`

- **Grund:** hell → Kopfleisten-Text, Statussymbole und Overlay-Texte dunkel (`--km-on-bg` = Ink)
- **Schrift:** Fredoka (`/theme-data/_fonts/Fredoka-Variable.ttf`)
- **Maskottchen:** Sterni – Papierstern. Schlafend: `/theme-data/bastelpapier/maskottchen.svg` (Tageslimit, Ruhezeit) · wach: `/theme-data/bastelpapier/maskottchen-wach.svg` (Nicht erreichbar, Cover fehlt)
- **Hintergrund:** `/theme-data/bastelpapier/background.svg` (SVG, viewBox 800 × 480, `cover`, unten verankert). Motive: Tonpapier-Collage: Packpapier-Grund, Papierhügel mit Stichlinien, Papiersonne und -wolke, Konfetti, Papierbäumchen, Papierblumen, Papierboot, Schmetterlinge. Karten leicht schief mit Papierschatten.
- **Referenz:** `design-reference/Mupi Screen Bastelpapier.dc.html`
- **Theme-Datei:** `box/themes/bastelpapier.css` – Besonderheit: Namensleisten −1,2°, Bilder +1° gedreht, Schatten seitlich (3 px 4 px / 4 px 6 px)

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#E9D8B8` | Hintergrund |
| `--km-night-2` | `#FFFDF7` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Info-Pillen |
| `--km-night-3` | `#3F6FB5` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#345E9C` | Gedrückt, Cover-Füllfläche (Hochformat) |
| `--km-stack-1` | `#F2C94C` | Ordner-Stapel vorne |
| `--km-stack-2` | `#F06A5A` | Ordner-Stapel hinten |
| `--km-shadow` | `#B89A6A` | Harte Versatz-Schatten (ohne Blur) |
| `--km-overlay` | `#EFE2C8` | Tageslimit/Ruhezeit-Grund |
| `--km-cream` | `#FFFDF7` | Namensleiste, Karten |
| `--km-ring` | `#FFFDF7` | Ring um runde Startseiten-Bilder |
| `--km-ink` | `#2B2622` | Text auf hellen Flächen |
| `--km-lavender` | `#4F463E` | Sekundärtext, inaktive Reiter-Symbole |
| `--km-apricot` | `#F07A4A` | Akzent: aktiver Reiter, Play, Badges, Balken aktiv |
| `--km-apricot-shadow` | `#B8452A` | Schatten unter Play |
| `--km-moon` | `#F2C94C` | Namensleiste „liest vor“, Lade-Punkte, Symbol im Overlay-Abzeichen |
| `--km-rose` | `#F06A5A` | Hörzeit fast vorbei, Live-Punkt |
| `--km-on-bg` | `#2B2622` | Text/Symbole direkt auf dem Hintergrund (Kopfleiste, Status, Overlays) |
| `--km-sync-bg` | `#345E9C` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#FFFFFF` | Sync-Abzeichen Symbol |

**Zustände in diesem Theme** (Aufbau überall gleich, siehe Kapitel 5; hier die konkreten Farben/Assets):

| Zustand | Grund | Hauptelement | Text |
|---|---|---|---|
| Startseite / Albumliste | `#E9D8B8` + background.svg | Namensleiste `#FFFDF7`, Ring `#FFFDF7` | `#2B2622` |
| Name wird vorgelesen | – | Namensleiste `#F2C94C`, scale 1.05 | `#2B2622` |
| Aktiver Reiter | Pille `#FFFDF7` | Reiter `#F07A4A` | Symbol `#2B2622`, inaktiv `#4F463E` |
| Player | background.svg | Play `#F07A4A` (Schatten `#B8452A`), Knöpfe `#3F6FB5` | Symbole `#FFFDF7` |
| Titelliste | Panel `#FFFDF7` | Zeile `#3F6FB5`, aktuell `#F07A4A` | `#FFFDF7` / aktuell `#2B2622` |
| Hörzeit normal / knapp / fast vorbei | – | `#3F6FB5` / `#F07A4A` / `#F06A5A` | `#FFFDF7` / `#2B2622` / dunkel |
| **Tageslimit** | `#EFE2C8` + background.svg | Maskottchen schlafend 220 px + Abzeichen `hourglass-outline` | Überschrift `#2B2622`, Unterzeile `#4F463E`, Noten `#F07A4A` |
| **Ruhezeit** | wie Tageslimit | Maskottchen schlafend + Abzeichen (Mond-Symbol der App) | wie Tageslimit, Überschrift frei wählbar |
| **NAS/Internet nicht erreichbar** | background.svg | Maskottchen wach 130 px + Abzeichen `cloud-offline-outline` (`#3F6FB5`) | `#2B2622` 28/600 |
| **Laden** | `#E9D8B8` | 3 Punkte `#F2C94C` / `#F07A4A` / `#F2C94C` | – |
| **Cover fehlt** | `#3F6FB5` | Maskottchen wach 110 px | – |
| **Eltern-QR** | Scrim (siehe CSS) | Karte `#FFFDF7` | `#2B2622`, Knopf `#2B2622` |
| **Bildschirm aus** | `#000000` | – | – |

### Prinzessin — `prinzessin`

- **Grund:** hell → Kopfleisten-Text, Statussymbole und Overlay-Texte dunkel (`--km-on-bg` = Ink)
- **Schrift:** Fredoka (`/theme-data/_fonts/Fredoka-Variable.ttf`)
- **Maskottchen:** Krönchen – goldene Krone mit Gesicht. Schlafend: `/theme-data/prinzessin/maskottchen.svg` (Tageslimit, Ruhezeit) · wach: `/theme-data/prinzessin/maskottchen-wach.svg` (Nicht erreichbar, Cover fehlt)
- **Hintergrund:** `/theme-data/prinzessin/background.svg` (SVG, viewBox 800 × 480, `cover`, unten verankert). Motive: Rosa Märchenland: zwei Schlösser, Wimpelkette, Krönchen, Kürbiskutsche, Rosen, Herzen, Glitzer. Goldene Ringe um die runden Bilder.
- **Referenz:** `design-reference/Mupi Screen Prinzessin.dc.html`
- **Theme-Datei:** `box/themes/prinzessin.css` – goldener Ring um runde Bilder (`--km-ring`)

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#FCE8EF` | Hintergrund |
| `--km-night-2` | `#FFFFFF` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Info-Pillen |
| `--km-night-3` | `#C2417A` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#A8336A` | Gedrückt, Cover-Füllfläche (Hochformat) |
| `--km-stack-1` | `#FFFFFF` | Ordner-Stapel vorne |
| `--km-stack-2` | `#F2C1D3` | Ordner-Stapel hinten |
| `--km-shadow` | `#E3B3C6` | Harte Versatz-Schatten (ohne Blur) |
| `--km-overlay` | `#FFF0F5` | Tageslimit/Ruhezeit-Grund |
| `--km-cream` | `#FFFFFF` | Namensleiste, Karten |
| `--km-ring` | `#F5B83D` | Ring um runde Startseiten-Bilder |
| `--km-ink` | `#3A1F2E` | Text auf hellen Flächen |
| `--km-lavender` | `#7A4063` | Sekundärtext, inaktive Reiter-Symbole |
| `--km-apricot` | `#F5B83D` | Akzent: aktiver Reiter, Play, Badges, Balken aktiv |
| `--km-apricot-shadow` | `#B8841A` | Schatten unter Play |
| `--km-moon` | `#FFE08A` | Namensleiste „liest vor“, Lade-Punkte, Symbol im Overlay-Abzeichen |
| `--km-rose` | `#E0485A` | Hörzeit fast vorbei, Live-Punkt |
| `--km-on-bg` | `#3A1F2E` | Text/Symbole direkt auf dem Hintergrund (Kopfleiste, Status, Overlays) |
| `--km-sync-bg` | `#A8336A` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#FFFFFF` | Sync-Abzeichen Symbol |

**Zustände in diesem Theme** (Aufbau überall gleich, siehe Kapitel 5; hier die konkreten Farben/Assets):

| Zustand | Grund | Hauptelement | Text |
|---|---|---|---|
| Startseite / Albumliste | `#FCE8EF` + background.svg | Namensleiste `#FFFFFF`, Ring `#F5B83D` | `#3A1F2E` |
| Name wird vorgelesen | – | Namensleiste `#FFE08A`, scale 1.05 | `#3A1F2E` |
| Aktiver Reiter | Pille `#FFFFFF` | Reiter `#F5B83D` | Symbol `#3A1F2E`, inaktiv `#7A4063` |
| Player | background.svg | Play `#F5B83D` (Schatten `#B8841A`), Knöpfe `#C2417A` | Symbole `#FFFFFF` |
| Titelliste | Panel `#FFFFFF` | Zeile `#C2417A`, aktuell `#F5B83D` | `#FFFFFF` / aktuell `#3A1F2E` |
| Hörzeit normal / knapp / fast vorbei | – | `#C2417A` / `#F5B83D` / `#E0485A` | `#FFFFFF` / `#3A1F2E` / dunkel |
| **Tageslimit** | `#FFF0F5` + background.svg | Maskottchen schlafend 220 px + Abzeichen `hourglass-outline` | Überschrift `#3A1F2E`, Unterzeile `#7A4063`, Noten `#F5B83D` |
| **Ruhezeit** | wie Tageslimit | Maskottchen schlafend + Abzeichen (Mond-Symbol der App) | wie Tageslimit, Überschrift frei wählbar |
| **NAS/Internet nicht erreichbar** | background.svg | Maskottchen wach 130 px + Abzeichen `cloud-offline-outline` (`#C2417A`) | `#3A1F2E` 28/600 |
| **Laden** | `#FCE8EF` | 3 Punkte `#FFE08A` / `#F5B83D` / `#FFE08A` | – |
| **Cover fehlt** | `#C2417A` | Maskottchen wach 110 px | – |
| **Eltern-QR** | Scrim (siehe CSS) | Karte `#FFFFFF` | `#3A1F2E`, Knopf `#3A1F2E` |
| **Bildschirm aus** | `#000000` | – | – |

### Einhorn — `einhorn`

- **Grund:** hell → Kopfleisten-Text, Statussymbole und Overlay-Texte dunkel (`--km-on-bg` = Ink)
- **Schrift:** Fredoka (`/theme-data/_fonts/Fredoka-Variable.ttf`)
- **Maskottchen:** Glitzer – weißes Einhorn mit Regenbogenmähne. Schlafend: `/theme-data/einhorn/maskottchen.svg` (Tageslimit, Ruhezeit) · wach: `/theme-data/einhorn/maskottchen-wach.svg` (Nicht erreichbar, Cover fehlt)
- **Hintergrund:** `/theme-data/einhorn/background.svg` (SVG, viewBox 800 × 480, `cover`, unten verankert). Motive: Flieder-Himmel über Mintwiese: großes Einhorn (schaut zwischen den ersten beiden Karten hervor), Regenbogen auf Wolken rechts, Luftballons, Blumen, Schmetterlinge, Herzen, Sterne.
- **Referenz:** `design-reference/Mupi Screen Einhorn.dc.html`
- **Theme-Datei:** `box/themes/einhorn.css`

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#E6E4FB` | Hintergrund |
| `--km-night-2` | `#FFFFFF` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Info-Pillen |
| `--km-night-3` | `#6C63C7` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#5A51B0` | Gedrückt, Cover-Füllfläche (Hochformat) |
| `--km-stack-1` | `#FFFFFF` | Ordner-Stapel vorne |
| `--km-stack-2` | `#D8D4F7` | Ordner-Stapel hinten |
| `--km-shadow` | `#C9C4EE` | Harte Versatz-Schatten (ohne Blur) |
| `--km-overlay` | `#F3F1FE` | Tageslimit/Ruhezeit-Grund |
| `--km-cream` | `#FFFFFF` | Namensleiste, Karten |
| `--km-ring` | `#FFFFFF` | Ring um runde Startseiten-Bilder |
| `--km-ink` | `#2E2A4A` | Text auf hellen Flächen |
| `--km-lavender` | `#5A5488` | Sekundärtext, inaktive Reiter-Symbole |
| `--km-apricot` | `#FF9EC7` | Akzent: aktiver Reiter, Play, Badges, Balken aktiv |
| `--km-apricot-shadow` | `#D0628F` | Schatten unter Play |
| `--km-moon` | `#FFE58A` | Namensleiste „liest vor“, Lade-Punkte, Symbol im Overlay-Abzeichen |
| `--km-rose` | `#EF5A7A` | Hörzeit fast vorbei, Live-Punkt |
| `--km-on-bg` | `#2E2A4A` | Text/Symbole direkt auf dem Hintergrund (Kopfleiste, Status, Overlays) |
| `--km-sync-bg` | `#5A51B0` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#FFFFFF` | Sync-Abzeichen Symbol |

**Zustände in diesem Theme** (Aufbau überall gleich, siehe Kapitel 5; hier die konkreten Farben/Assets):

| Zustand | Grund | Hauptelement | Text |
|---|---|---|---|
| Startseite / Albumliste | `#E6E4FB` + background.svg | Namensleiste `#FFFFFF`, Ring `#FFFFFF` | `#2E2A4A` |
| Name wird vorgelesen | – | Namensleiste `#FFE58A`, scale 1.05 | `#2E2A4A` |
| Aktiver Reiter | Pille `#FFFFFF` | Reiter `#FF9EC7` | Symbol `#2E2A4A`, inaktiv `#5A5488` |
| Player | background.svg | Play `#FF9EC7` (Schatten `#D0628F`), Knöpfe `#6C63C7` | Symbole `#FFFFFF` |
| Titelliste | Panel `#FFFFFF` | Zeile `#6C63C7`, aktuell `#FF9EC7` | `#FFFFFF` / aktuell `#2E2A4A` |
| Hörzeit normal / knapp / fast vorbei | – | `#6C63C7` / `#FF9EC7` / `#EF5A7A` | `#FFFFFF` / `#2E2A4A` / dunkel |
| **Tageslimit** | `#F3F1FE` + background.svg | Maskottchen schlafend 220 px + Abzeichen `hourglass-outline` | Überschrift `#2E2A4A`, Unterzeile `#5A5488`, Noten `#FF9EC7` |
| **Ruhezeit** | wie Tageslimit | Maskottchen schlafend + Abzeichen (Mond-Symbol der App) | wie Tageslimit, Überschrift frei wählbar |
| **NAS/Internet nicht erreichbar** | background.svg | Maskottchen wach 130 px + Abzeichen `cloud-offline-outline` (`#6C63C7`) | `#2E2A4A` 28/600 |
| **Laden** | `#E6E4FB` | 3 Punkte `#FFE58A` / `#FF9EC7` / `#FFE58A` | – |
| **Cover fehlt** | `#6C63C7` | Maskottchen wach 110 px | – |
| **Eltern-QR** | Scrim (siehe CSS) | Karte `#FFFFFF` | `#2E2A4A`, Knopf `#2E2A4A` |
| **Bildschirm aus** | `#000000` | – | – |

### Feenschloss — `feenschloss`

- **Grund:** dunkel → Kopfleisten-Text und Status hell (`--km-on-bg` = Creme)
- **Schrift:** Fredoka (`/theme-data/_fonts/Fredoka-Variable.ttf`)
- **Maskottchen:** Funkel – Zauberstab-Stern. Schlafend: `/theme-data/feenschloss/maskottchen.svg` (Tageslimit, Ruhezeit) · wach: `/theme-data/feenschloss/maskottchen-wach.svg` (Nicht erreichbar, Cover fehlt)
- **Hintergrund:** `/theme-data/feenschloss/background.svg` (SVG, viewBox 800 × 480, `cover`, unten verankert). Motive: Schloss bei Nacht: Sterne, leuchtender Halbmond, Schloss-Silhouetten mit leuchtenden Fenstern, leuchtende Pilze, Feen, Laternen, Glühwürmchen.
- **Referenz:** `design-reference/Mupi Screen Feenschloss.dc.html`
- **Theme-Datei:** `box/themes/feenschloss.css`

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#2A1E45` | Hintergrund |
| `--km-night-2` | `#33264F` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Info-Pillen |
| `--km-night-3` | `#43336A` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#54427F` | Gedrückt, Cover-Füllfläche (Hochformat) |
| `--km-stack-1` | `#B79AE0` | Ordner-Stapel vorne |
| `--km-stack-2` | `#7B63AE` | Ordner-Stapel hinten |
| `--km-shadow` | `#1A1230` | Harte Versatz-Schatten (ohne Blur) |
| `--km-overlay` | `#1E1535` | Tageslimit/Ruhezeit-Grund |
| `--km-cream` | `#FFF0F6` | Namensleiste, Karten |
| `--km-ring` | `#F7C8DF` | Ring um runde Startseiten-Bilder |
| `--km-ink` | `#2A1E45` | Text auf hellen Flächen |
| `--km-lavender` | `#D8CCF0` | Sekundärtext, inaktive Reiter-Symbole |
| `--km-apricot` | `#F7A8CF` | Akzent: aktiver Reiter, Play, Badges, Balken aktiv |
| `--km-apricot-shadow` | `#B8628F` | Schatten unter Play |
| `--km-moon` | `#FFE3A3` | Namensleiste „liest vor“, Lade-Punkte, Symbol im Overlay-Abzeichen |
| `--km-rose` | `#F2877E` | Hörzeit fast vorbei, Live-Punkt |
| `--km-on-bg` | `#FFF0F6` | Text/Symbole direkt auf dem Hintergrund (Kopfleiste, Status, Overlays) |
| `--km-sync-bg` | `#2A1E45` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#FFF0F6` | Sync-Abzeichen Symbol |

**Zustände in diesem Theme** (Aufbau überall gleich, siehe Kapitel 5; hier die konkreten Farben/Assets):

| Zustand | Grund | Hauptelement | Text |
|---|---|---|---|
| Startseite / Albumliste | `#2A1E45` + background.svg | Namensleiste `#FFF0F6`, Ring `#F7C8DF` | `#2A1E45` |
| Name wird vorgelesen | – | Namensleiste `#FFE3A3`, scale 1.05 | `#2A1E45` |
| Aktiver Reiter | Pille `#33264F` | Reiter `#F7A8CF` | Symbol `#2A1E45`, inaktiv `#D8CCF0` |
| Player | background.svg | Play `#F7A8CF` (Schatten `#B8628F`), Knöpfe `#43336A` | Symbole `#FFF0F6` |
| Titelliste | Panel `#33264F` | Zeile `#43336A`, aktuell `#F7A8CF` | `#FFF0F6` / aktuell `#2A1E45` |
| Hörzeit normal / knapp / fast vorbei | – | `#43336A` / `#F7A8CF` / `#F2877E` | `#FFF0F6` / `#2A1E45` / dunkel |
| **Tageslimit** | `#1E1535` + background.svg | Maskottchen schlafend 220 px + Abzeichen `hourglass-outline` | Überschrift `#FFF0F6`, Unterzeile `#D8CCF0`, Noten `#F7A8CF` |
| **Ruhezeit** | wie Tageslimit | Maskottchen schlafend + Abzeichen (Mond-Symbol der App) | wie Tageslimit, Überschrift frei wählbar |
| **NAS/Internet nicht erreichbar** | background.svg | Maskottchen wach 130 px + Abzeichen `cloud-offline-outline` (`#43336A`) | `#FFF0F6` 28/600 |
| **Laden** | `#2A1E45` | 3 Punkte `#FFE3A3` / `#F7A8CF` / `#FFE3A3` | – |
| **Cover fehlt** | `#43336A` | Maskottchen wach 110 px | – |
| **Eltern-QR** | Scrim (siehe CSS) | Karte `#FFF0F6` | `#2A1E45`, Knopf `#2A1E45` |
| **Bildschirm aus** | `#000000` | – | – |

### Weltraum — `weltraum`

- **Grund:** dunkel → Kopfleisten-Text und Status hell (`--km-on-bg` = Creme)
- **Schrift:** Fredoka (`/theme-data/_fonts/Fredoka-Variable.ttf`)
- **Maskottchen:** Zisch – kleine Rakete, Gesicht im Bullauge (wach mit Flamme). Schlafend: `/theme-data/weltraum/maskottchen.svg` (Tageslimit, Ruhezeit) · wach: `/theme-data/weltraum/maskottchen-wach.svg` (Nicht erreichbar, Cover fehlt)
- **Hintergrund:** `/theme-data/weltraum/background.svg` (SVG, viewBox 800 × 480, `cover`, unten verankert). Motive: Raketenbasis auf dem Mond: Sterne, Ringplanet, Mars, Satellit, Mondboden mit Kratern, Rakete auf Startrampe, Astronautenhelm, Fahne, Fußspuren.
- **Referenz:** `design-reference/Mupi Screen Weltraum.dc.html`
- **Theme-Datei:** `box/themes/weltraum.css`

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#141A33` | Hintergrund |
| `--km-night-2` | `#1C2445` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Info-Pillen |
| `--km-night-3` | `#28335C` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#36437A` | Gedrückt, Cover-Füllfläche (Hochformat) |
| `--km-stack-1` | `#8A9AD6` | Ordner-Stapel vorne |
| `--km-stack-2` | `#4B5A96` | Ordner-Stapel hinten |
| `--km-shadow` | `#0B0F22` | Harte Versatz-Schatten (ohne Blur) |
| `--km-overlay` | `#10152B` | Tageslimit/Ruhezeit-Grund |
| `--km-cream` | `#F2F4FF` | Namensleiste, Karten |
| `--km-ring` | `#C9D2FF` | Ring um runde Startseiten-Bilder |
| `--km-ink` | `#151B38` | Text auf hellen Flächen |
| `--km-lavender` | `#BCC6EE` | Sekundärtext, inaktive Reiter-Symbole |
| `--km-apricot` | `#FF8A3D` | Akzent: aktiver Reiter, Play, Badges, Balken aktiv |
| `--km-apricot-shadow` | `#B8551A` | Schatten unter Play |
| `--km-moon` | `#FFD66B` | Namensleiste „liest vor“, Lade-Punkte, Symbol im Overlay-Abzeichen |
| `--km-rose` | `#FF6B6B` | Hörzeit fast vorbei, Live-Punkt |
| `--km-on-bg` | `#F2F4FF` | Text/Symbole direkt auf dem Hintergrund (Kopfleiste, Status, Overlays) |
| `--km-sync-bg` | `#141A33` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#F2F4FF` | Sync-Abzeichen Symbol |

**Zustände in diesem Theme** (Aufbau überall gleich, siehe Kapitel 5; hier die konkreten Farben/Assets):

| Zustand | Grund | Hauptelement | Text |
|---|---|---|---|
| Startseite / Albumliste | `#141A33` + background.svg | Namensleiste `#F2F4FF`, Ring `#C9D2FF` | `#151B38` |
| Name wird vorgelesen | – | Namensleiste `#FFD66B`, scale 1.05 | `#151B38` |
| Aktiver Reiter | Pille `#1C2445` | Reiter `#FF8A3D` | Symbol `#151B38`, inaktiv `#BCC6EE` |
| Player | background.svg | Play `#FF8A3D` (Schatten `#B8551A`), Knöpfe `#28335C` | Symbole `#F2F4FF` |
| Titelliste | Panel `#1C2445` | Zeile `#28335C`, aktuell `#FF8A3D` | `#F2F4FF` / aktuell `#151B38` |
| Hörzeit normal / knapp / fast vorbei | – | `#28335C` / `#FF8A3D` / `#FF6B6B` | `#F2F4FF` / `#151B38` / dunkel |
| **Tageslimit** | `#10152B` + background.svg | Maskottchen schlafend 220 px + Abzeichen `hourglass-outline` | Überschrift `#F2F4FF`, Unterzeile `#BCC6EE`, Noten `#FF8A3D` |
| **Ruhezeit** | wie Tageslimit | Maskottchen schlafend + Abzeichen (Mond-Symbol der App) | wie Tageslimit, Überschrift frei wählbar |
| **NAS/Internet nicht erreichbar** | background.svg | Maskottchen wach 130 px + Abzeichen `cloud-offline-outline` (`#28335C`) | `#F2F4FF` 28/600 |
| **Laden** | `#141A33` | 3 Punkte `#FFD66B` / `#FF8A3D` / `#FFD66B` | – |
| **Cover fehlt** | `#28335C` | Maskottchen wach 110 px | – |
| **Eltern-QR** | Scrim (siehe CSS) | Karte `#F2F4FF` | `#151B38`, Knopf `#151B38` |
| **Bildschirm aus** | `#000000` | – | – |

### Dinoland — `dinoland`

- **Grund:** dunkel → Kopfleisten-Text und Status hell (`--km-on-bg` = Creme)
- **Schrift:** Fredoka (`/theme-data/_fonts/Fredoka-Variable.ttf`)
- **Maskottchen:** Rexi – Baby-Dino im Ei (bei Ruhe Schale zu). Schlafend: `/theme-data/dinoland/maskottchen.svg` (Tageslimit, Ruhezeit) · wach: `/theme-data/dinoland/maskottchen-wach.svg` (Nicht erreichbar, Cover fehlt)
- **Hintergrund:** `/theme-data/dinoland/background.svg` (SVG, viewBox 800 × 480, `cover`, unten verankert). Motive: Urzeit-Dschungel: Vulkan mit Lava und Rauch, Palmen, Sandboden, Langhals-Dino, T-Rex, Nest mit Eiern, Farne, Fußspuren.
- **Referenz:** `design-reference/Mupi Screen Dinoland.dc.html`
- **Theme-Datei:** `box/themes/dinoland.css`

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#1E3B34` | Hintergrund |
| `--km-night-2` | `#244A40` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Info-Pillen |
| `--km-night-3` | `#2F5C50` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#3C6E60` | Gedrückt, Cover-Füllfläche (Hochformat) |
| `--km-stack-1` | `#B5CF7A` | Ordner-Stapel vorne |
| `--km-stack-2` | `#7A9A5A` | Ordner-Stapel hinten |
| `--km-shadow` | `#122620` | Harte Versatz-Schatten (ohne Blur) |
| `--km-overlay` | `#16302A` | Tageslimit/Ruhezeit-Grund |
| `--km-cream` | `#FFF6E3` | Namensleiste, Karten |
| `--km-ring` | `#FFD08A` | Ring um runde Startseiten-Bilder |
| `--km-ink` | `#1E2A22` | Text auf hellen Flächen |
| `--km-lavender` | `#CFE3D6` | Sekundärtext, inaktive Reiter-Symbole |
| `--km-apricot` | `#FF8A3D` | Akzent: aktiver Reiter, Play, Badges, Balken aktiv |
| `--km-apricot-shadow` | `#B5521A` | Schatten unter Play |
| `--km-moon` | `#FFE08A` | Namensleiste „liest vor“, Lade-Punkte, Symbol im Overlay-Abzeichen |
| `--km-rose` | `#F26B5B` | Hörzeit fast vorbei, Live-Punkt |
| `--km-on-bg` | `#FFF6E3` | Text/Symbole direkt auf dem Hintergrund (Kopfleiste, Status, Overlays) |
| `--km-sync-bg` | `#1E3B34` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#FFF6E3` | Sync-Abzeichen Symbol |

**Zustände in diesem Theme** (Aufbau überall gleich, siehe Kapitel 5; hier die konkreten Farben/Assets):

| Zustand | Grund | Hauptelement | Text |
|---|---|---|---|
| Startseite / Albumliste | `#1E3B34` + background.svg | Namensleiste `#FFF6E3`, Ring `#FFD08A` | `#1E2A22` |
| Name wird vorgelesen | – | Namensleiste `#FFE08A`, scale 1.05 | `#1E2A22` |
| Aktiver Reiter | Pille `#244A40` | Reiter `#FF8A3D` | Symbol `#1E2A22`, inaktiv `#CFE3D6` |
| Player | background.svg | Play `#FF8A3D` (Schatten `#B5521A`), Knöpfe `#2F5C50` | Symbole `#FFF6E3` |
| Titelliste | Panel `#244A40` | Zeile `#2F5C50`, aktuell `#FF8A3D` | `#FFF6E3` / aktuell `#1E2A22` |
| Hörzeit normal / knapp / fast vorbei | – | `#2F5C50` / `#FF8A3D` / `#F26B5B` | `#FFF6E3` / `#1E2A22` / dunkel |
| **Tageslimit** | `#16302A` + background.svg | Maskottchen schlafend 220 px + Abzeichen `hourglass-outline` | Überschrift `#FFF6E3`, Unterzeile `#CFE3D6`, Noten `#FF8A3D` |
| **Ruhezeit** | wie Tageslimit | Maskottchen schlafend + Abzeichen (Mond-Symbol der App) | wie Tageslimit, Überschrift frei wählbar |
| **NAS/Internet nicht erreichbar** | background.svg | Maskottchen wach 130 px + Abzeichen `cloud-offline-outline` (`#2F5C50`) | `#FFF6E3` 28/600 |
| **Laden** | `#1E3B34` | 3 Punkte `#FFE08A` / `#FF8A3D` / `#FFE08A` | – |
| **Cover fehlt** | `#2F5C50` | Maskottchen wach 110 px | – |
| **Eltern-QR** | Scrim (siehe CSS) | Karte `#FFF6E3` | `#1E2A22`, Knopf `#1E2A22` |
| **Bildschirm aus** | `#000000` | – | – |

### Piratenbucht — `piratenbucht`

- **Grund:** hell → Kopfleisten-Text, Statussymbole und Overlay-Texte dunkel (`--km-on-bg` = Ink)
- **Schrift:** Fredoka (`/theme-data/_fonts/Fredoka-Variable.ttf`)
- **Maskottchen:** Kapitän Kiwi – Papagei mit Piratenhut und Augenklappe. Schlafend: `/theme-data/piratenbucht/maskottchen.svg` (Tageslimit, Ruhezeit) · wach: `/theme-data/piratenbucht/maskottchen-wach.svg` (Nicht erreichbar, Cover fehlt)
- **Hintergrund:** `/theme-data/piratenbucht/background.svg` (SVG, viewBox 800 × 480, `cover`, unten verankert). Motive: Karibik-Bucht: Sonne, Wolken, Meer mit Wellen, Piratenschiff, Sandstrand, Palme, Schatzkiste, Anker, Seesterne, Muschel, Flaschenpost.
- **Referenz:** `design-reference/Mupi Screen Piratenbucht.dc.html`
- **Theme-Datei:** `box/themes/piratenbucht.css`

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#BFE8EE` | Hintergrund |
| `--km-night-2` | `#FFFFFF` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Info-Pillen |
| `--km-night-3` | `#1F6F8B` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#185B73` | Gedrückt, Cover-Füllfläche (Hochformat) |
| `--km-stack-1` | `#FFF4DE` | Ordner-Stapel vorne |
| `--km-stack-2` | `#E8C98E` | Ordner-Stapel hinten |
| `--km-shadow` | `#9CCBD2` | Harte Versatz-Schatten (ohne Blur) |
| `--km-overlay` | `#EAF7F8` | Tageslimit/Ruhezeit-Grund |
| `--km-cream` | `#FFFFFF` | Namensleiste, Karten |
| `--km-ring` | `#F5B83D` | Ring um runde Startseiten-Bilder |
| `--km-ink` | `#1E2A33` | Text auf hellen Flächen |
| `--km-lavender` | `#245468` | Sekundärtext, inaktive Reiter-Symbole |
| `--km-apricot` | `#F5B83D` | Akzent: aktiver Reiter, Play, Badges, Balken aktiv |
| `--km-apricot-shadow` | `#B8841A` | Schatten unter Play |
| `--km-moon` | `#FFE08A` | Namensleiste „liest vor“, Lade-Punkte, Symbol im Overlay-Abzeichen |
| `--km-rose` | `#E0485A` | Hörzeit fast vorbei, Live-Punkt |
| `--km-on-bg` | `#1E2A33` | Text/Symbole direkt auf dem Hintergrund (Kopfleiste, Status, Overlays) |
| `--km-sync-bg` | `#185B73` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#FFFFFF` | Sync-Abzeichen Symbol |

**Zustände in diesem Theme** (Aufbau überall gleich, siehe Kapitel 5; hier die konkreten Farben/Assets):

| Zustand | Grund | Hauptelement | Text |
|---|---|---|---|
| Startseite / Albumliste | `#BFE8EE` + background.svg | Namensleiste `#FFFFFF`, Ring `#F5B83D` | `#1E2A33` |
| Name wird vorgelesen | – | Namensleiste `#FFE08A`, scale 1.05 | `#1E2A33` |
| Aktiver Reiter | Pille `#FFFFFF` | Reiter `#F5B83D` | Symbol `#1E2A33`, inaktiv `#245468` |
| Player | background.svg | Play `#F5B83D` (Schatten `#B8841A`), Knöpfe `#1F6F8B` | Symbole `#FFFFFF` |
| Titelliste | Panel `#FFFFFF` | Zeile `#1F6F8B`, aktuell `#F5B83D` | `#FFFFFF` / aktuell `#1E2A33` |
| Hörzeit normal / knapp / fast vorbei | – | `#1F6F8B` / `#F5B83D` / `#E0485A` | `#FFFFFF` / `#1E2A33` / dunkel |
| **Tageslimit** | `#EAF7F8` + background.svg | Maskottchen schlafend 220 px + Abzeichen `hourglass-outline` | Überschrift `#1E2A33`, Unterzeile `#245468`, Noten `#F5B83D` |
| **Ruhezeit** | wie Tageslimit | Maskottchen schlafend + Abzeichen (Mond-Symbol der App) | wie Tageslimit, Überschrift frei wählbar |
| **NAS/Internet nicht erreichbar** | background.svg | Maskottchen wach 130 px + Abzeichen `cloud-offline-outline` (`#1F6F8B`) | `#1E2A33` 28/600 |
| **Laden** | `#BFE8EE` | 3 Punkte `#FFE08A` / `#F5B83D` / `#FFE08A` | – |
| **Cover fehlt** | `#1F6F8B` | Maskottchen wach 110 px | – |
| **Eltern-QR** | Scrim (siehe CSS) | Karte `#FFFFFF` | `#1E2A33`, Knopf `#1E2A33` |
| **Bildschirm aus** | `#000000` | – | – |

### Tag & Nacht — `tagundnacht`

- **Grund:** hell → Kopfleisten-Text, Statussymbole und Overlay-Texte dunkel (`--km-on-bg` = Ink); nachts dunkel (Kuschelmond-Werte, siehe unten)
- **Schrift:** Fredoka (`/theme-data/_fonts/Fredoka-Variable.ttf`)
- **Maskottchen:** Sonni (Tag) / Mondi (Nacht). Schlafend: `/theme-data/tagundnacht/maskottchen.svg` (Tageslimit, Ruhezeit) · wach: `/theme-data/tagundnacht/maskottchen-wach.svg` (Nicht erreichbar, Cover fehlt) · nachts: `/theme-data/tagundnacht/maskottchen-nacht.svg` / `/theme-data/tagundnacht/maskottchen-nacht-wach.svg`
- **Hintergrund:** `/theme-data/tagundnacht/background.svg` · nachts `/theme-data/tagundnacht/background-nacht.svg` (SVG, viewBox 800 × 480, `cover`, unten verankert). Motive: Derselbe Bauernhof: tagsüber Sonnenhof (Sonne, rote Scheune, Blumen), nachts in Kuschelmond-Farben mit Mond, Licht im Scheunenfenster, hängenden Sonnenblumen, schlafenden Schäfchen, Glühwürmchen. Scheune/Zaun/Apfelbaum/Heuballen an denselben Stellen.
- **Referenz:** `design-reference/Mupi Tag Nacht.dc.html`
- **Theme-Datei:** `box/themes/tagundnacht.css`

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#BFE3E6` | Hintergrund |
| `--km-night-2` | `#FFFFFF` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Info-Pillen |
| `--km-night-3` | `#2F7F8C` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#256B76` | Gedrückt, Cover-Füllfläche (Hochformat) |
| `--km-stack-1` | `#FFF7EA` | Ordner-Stapel vorne |
| `--km-stack-2` | `#E9D6B3` | Ordner-Stapel hinten |
| `--km-shadow` | `#93C3C8` | Harte Versatz-Schatten (ohne Blur) |
| `--km-overlay` | `#F6EBD9` | Tageslimit/Ruhezeit-Grund |
| `--km-cream` | `#FFFFFF` | Namensleiste, Karten |
| `--km-ring` | `#FFFFFF` | Ring um runde Startseiten-Bilder |
| `--km-ink` | `#3B2F2A` | Text auf hellen Flächen |
| `--km-lavender` | `#2F5E66` | Sekundärtext, inaktive Reiter-Symbole |
| `--km-apricot` | `#F28C6B` | Akzent: aktiver Reiter, Play, Badges, Balken aktiv |
| `--km-apricot-shadow` | `#C4613F` | Schatten unter Play |
| `--km-moon` | `#FFD66B` | Namensleiste „liest vor“, Lade-Punkte, Symbol im Overlay-Abzeichen |
| `--km-rose` | `#E85A5A` | Hörzeit fast vorbei, Live-Punkt |
| `--km-on-bg` | `#3B2F2A` | Text/Symbole direkt auf dem Hintergrund (Kopfleiste, Status, Overlays) |
| `--km-sync-bg` | `#256B76` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#FFFFFF` | Sync-Abzeichen Symbol |

**Nacht-Werte** (`body.km-night`): `--km-night: #241E3D` · `--km-night-2: #2E2750` · `--km-night-3: #3A3160` · `--km-night-4: #4A3F78` · `--km-stack-1: #8B7CC4` · `--km-stack-2: #5B4E8C` · `--km-shadow: #1A1530` · `--km-overlay: #1B1630` · `--km-cream: #FFF3E0` · `--km-ring: #FFE9C9` · `--km-ink: #2A2140` · `--km-lavender: #CFC6E8` · `--km-apricot: #FFB36B` · `--km-apricot-shadow: #B8672C` · `--km-moon: #FFE3A3` · `--km-rose: #F2877E` · `--km-on-bg: #FFF3E0` · `--km-sync-bg: #241E3D` · `--km-sync-fg: #FFF3E0`

**Zustände in diesem Theme** (Aufbau überall gleich, siehe Kapitel 5; hier die konkreten Farben/Assets):

| Zustand | Grund | Hauptelement | Text |
|---|---|---|---|
| Startseite / Albumliste | `#BFE3E6` + background.svg | Namensleiste `#FFFFFF`, Ring `#FFFFFF` | `#3B2F2A` |
| Name wird vorgelesen | – | Namensleiste `#FFD66B`, scale 1.05 | `#3B2F2A` |
| Aktiver Reiter | Pille `#FFFFFF` | Reiter `#F28C6B` | Symbol `#3B2F2A`, inaktiv `#2F5E66` |
| Player | background.svg | Play `#F28C6B` (Schatten `#C4613F`), Knöpfe `#2F7F8C` | Symbole `#FFFFFF` |
| Titelliste | Panel `#FFFFFF` | Zeile `#2F7F8C`, aktuell `#F28C6B` | `#FFFFFF` / aktuell `#3B2F2A` |
| Hörzeit normal / knapp / fast vorbei | – | `#2F7F8C` / `#F28C6B` / `#E85A5A` | `#FFFFFF` / `#3B2F2A` / dunkel |
| **Tageslimit** | `#F6EBD9` + background.svg | Maskottchen schlafend 220 px + Abzeichen `hourglass-outline` | Überschrift `#3B2F2A`, Unterzeile `#2F5E66`, Noten `#F28C6B` |
| **Ruhezeit** | wie Tageslimit | Maskottchen schlafend + Abzeichen (Mond-Symbol der App) | wie Tageslimit, Überschrift frei wählbar |
| **NAS/Internet nicht erreichbar** | background.svg | Maskottchen wach 130 px + Abzeichen `cloud-offline-outline` (`#2F7F8C`) | `#3B2F2A` 28/600 |
| **Laden** | `#BFE3E6` | 3 Punkte `#FFD66B` / `#F28C6B` / `#FFD66B` | – |
| **Cover fehlt** | `#2F7F8C` | Maskottchen wach 110 px | – |
| **Eltern-QR** | Scrim (siehe CSS) | Karte `#FFFFFF` | `#3B2F2A`, Knopf `#3B2F2A` |
| **Bildschirm aus** | `#000000` | – | – |


### Feuerwehr / Fire Station — `feuerwehr`
- **Grund:** hell → `km-light`, Kopfleisten-Text/Status dunkel (`--km-on-bg` = Ink)
- **Schrift:** Baloo 2 (`/theme-data/_fonts/Baloo2-Variable.ttf`)
- **Maskottchen:** Tupfi – Dalmatiner-Welpe mit rotem Feuerwehrhelm
- **Hintergrund-Motive:** Feuerwache mit zwei Toren und Glocke, Löschfahrzeug mit Leiter, Hydrant, Leiter in der Lücke zwischen Karte 1 und 2, Straße mit Mittelstreifen, Helm und Leitkegel, Wolken.
- **Referenz:** `design-reference/Mupi Screen Feuerwehr.dc.html`

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#CFE6F5` | Hintergrund (Grundfarbe) |
| `--km-night-2` | `#FFFFFF` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Pillen |
| `--km-night-3` | `#C8372D` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#A42A22` | Gedrückt, Cover-Füllung, Platzhalter-Grund |
| `--km-stack-1` | `#FFFFFF` | Ordner-Stapel vorne |
| `--km-stack-2` | `#F3C7C1` | Ordner-Stapel hinten |
| `--km-shadow` | `#9DBFD8` | Harte Versatz-Schatten |
| `--km-overlay` | `#FFF2E8` | Tageslimit/Ruhezeit/Eltern-Pause (einfarbig) |
| `--km-cream` | `#FFFFFF` | Namensleiste, Karten |
| `--km-ring` | `#FFFFFF` | Ring um runde Bilder |
| `--km-ink` | `#2B2230` | Text auf hellen Flächen |
| `--km-lavender` | `#4A3B48` | Sekundärtext, Zeiten, Akku-Prozent |
| `--km-apricot` | `#FFC23D` | Akzent: aktiver Reiter, Play, Badges, Fortschritt |
| `--km-apricot-shadow` | `#C98E12` | Schatten unter Play |
| `--km-moon` | `#FFE27A` | Namensleiste „liest vor“, Lade-Punkte, Overlay-Abzeichen-Inhalt |
| `--km-rose` | `#E8503F` | Hörzeit < 5 min, Live-Punkt, Akku fast leer |
| `--km-on-bg` | `#2B2230` | Text/Symbole direkt auf dem Hintergrund |
| `--km-sync-bg` | `#A42A22` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#FFFFFF` | Sync-Abzeichen Symbol |

### Ritterburg / Knight Castle — `ritterburg`
- **Grund:** hell → `km-light`, Kopfleisten-Text/Status dunkel (`--km-on-bg` = Ink)
- **Schrift:** Fredoka (`/theme-data/_fonts/Fredoka-Variable.ttf`)
- **Maskottchen:** Drako – kleiner grüner Drache mit Hörnchen
- **Hintergrund-Motive:** Burg bei Tag: zwei Türme mit Fahnen in den Lücken zwischen den Karten, Burgmauer mit Zinnen und Holztor, grüne Hügel, Wappenschilde, Schwert, Krone, Blümchen, Wolken.
- **Referenz:** `design-reference/Mupi Screen Ritterburg.dc.html`

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#D7E9F7` | Hintergrund (Grundfarbe) |
| `--km-night-2` | `#FFFFFF` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Pillen |
| `--km-night-3` | `#3F6FB5` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#325A96` | Gedrückt, Cover-Füllung, Platzhalter-Grund |
| `--km-stack-1` | `#FFFFFF` | Ordner-Stapel vorne |
| `--km-stack-2` | `#C9D8EE` | Ordner-Stapel hinten |
| `--km-shadow` | `#A6C1DD` | Harte Versatz-Schatten |
| `--km-overlay` | `#F3F6FB` | Tageslimit/Ruhezeit/Eltern-Pause (einfarbig) |
| `--km-cream` | `#FFFFFF` | Namensleiste, Karten |
| `--km-ring` | `#FFFFFF` | Ring um runde Bilder |
| `--km-ink` | `#22283A` | Text auf hellen Flächen |
| `--km-lavender` | `#3D4A66` | Sekundärtext, Zeiten, Akku-Prozent |
| `--km-apricot` | `#F2B134` | Akzent: aktiver Reiter, Play, Badges, Fortschritt |
| `--km-apricot-shadow` | `#B7801A` | Schatten unter Play |
| `--km-moon` | `#FFE08A` | Namensleiste „liest vor“, Lade-Punkte, Overlay-Abzeichen-Inhalt |
| `--km-rose` | `#E0524A` | Hörzeit < 5 min, Live-Punkt, Akku fast leer |
| `--km-on-bg` | `#22283A` | Text/Symbole direkt auf dem Hintergrund |
| `--km-sync-bg` | `#325A96` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#FFFFFF` | Sync-Abzeichen Symbol |

### Eisenbahn / Railway — `eisenbahn`
- **Grund:** hell → `km-light`, Kopfleisten-Text/Status dunkel (`--km-on-bg` = Ink)
- **Schrift:** Fredoka (`/theme-data/_fonts/Fredoka-Variable.ttf`)
- **Maskottchen:** Tuffi – kleine grüne Lok mit Gesicht (wach mit Dampfwölkchen)
- **Hintergrund-Motive:** Grüne Hügel mit Tunnel, Gleis mit Holzschwellen am unteren Rand, grüne Dampflok mit zwei bunten Waggons und Dampfwolken, Signal in der Lücke zwischen Karte 2 und 3, Bäume, Blumen, Wolken.
- **Referenz:** `design-reference/Mupi Screen Eisenbahn.dc.html`

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#CDEBF2` | Hintergrund (Grundfarbe) |
| `--km-night-2` | `#FFFFFF` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Pillen |
| `--km-night-3` | `#2F7A5A` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#256248` | Gedrückt, Cover-Füllung, Platzhalter-Grund |
| `--km-stack-1` | `#FFFFFF` | Ordner-Stapel vorne |
| `--km-stack-2` | `#CFE6D8` | Ordner-Stapel hinten |
| `--km-shadow` | `#9CCBD6` | Harte Versatz-Schatten |
| `--km-overlay` | `#F4F8EE` | Tageslimit/Ruhezeit/Eltern-Pause (einfarbig) |
| `--km-cream` | `#FFFFFF` | Namensleiste, Karten |
| `--km-ring` | `#FFFFFF` | Ring um runde Bilder |
| `--km-ink` | `#26302B` | Text auf hellen Flächen |
| `--km-lavender` | `#3A5147` | Sekundärtext, Zeiten, Akku-Prozent |
| `--km-apricot` | `#F2663B` | Akzent: aktiver Reiter, Play, Badges, Fortschritt |
| `--km-apricot-shadow` | `#B8452A` | Schatten unter Play |
| `--km-moon` | `#FFD65C` | Namensleiste „liest vor“, Lade-Punkte, Overlay-Abzeichen-Inhalt |
| `--km-rose` | `#E0463C` | Hörzeit < 5 min, Live-Punkt, Akku fast leer |
| `--km-on-bg` | `#26302B` | Text/Symbole direkt auf dem Hintergrund |
| `--km-sync-bg` | `#256248` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#FFFFFF` | Sync-Abzeichen Symbol |

### Roboterwerkstatt / Robot Workshop — `roboter`
- **Grund:** dunkel → Kopfleisten-Text/Status hell (`--km-on-bg` = Creme)
- **Schrift:** Baloo 2 (`/theme-data/_fonts/Baloo2-Variable.ttf`)
- **Maskottchen:** Bolti – runder Roboter mit Bildschirm-Gesicht und Antenne
- **Hintergrund-Motive:** Werkstatt in Petrol: Rasterwand, Zahnräder, Greifarm in der Lücke zwischen Karte 1 und 2, Zahnradpaar, kleiner Roboter auf Rädern, Messgerät mit Kurve, Schraubenschlüssel, Förderband mit Warnstreifen.
- **Referenz:** `design-reference/Mupi Screen Roboter.dc.html`

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#15303A` | Hintergrund (Grundfarbe) |
| `--km-night-2` | `#1C3E4A` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Pillen |
| `--km-night-3` | `#28525F` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#336473` | Gedrückt, Cover-Füllung, Platzhalter-Grund |
| `--km-stack-1` | `#6FB7C4` | Ordner-Stapel vorne |
| `--km-stack-2` | `#3F7F8C` | Ordner-Stapel hinten |
| `--km-shadow` | `#0C1F26` | Harte Versatz-Schatten |
| `--km-overlay` | `#10262E` | Tageslimit/Ruhezeit/Eltern-Pause (einfarbig) |
| `--km-cream` | `#EAF7F5` | Namensleiste, Karten |
| `--km-ring` | `#CFEFEA` | Ring um runde Bilder |
| `--km-ink` | `#15262B` | Text auf hellen Flächen |
| `--km-lavender` | `#A9CFD2` | Sekundärtext, Zeiten, Akku-Prozent |
| `--km-apricot` | `#FF9F43` | Akzent: aktiver Reiter, Play, Badges, Fortschritt |
| `--km-apricot-shadow` | `#B86A1F` | Schatten unter Play |
| `--km-moon` | `#7FF0DC` | Namensleiste „liest vor“, Lade-Punkte, Overlay-Abzeichen-Inhalt |
| `--km-rose` | `#FF6B6B` | Hörzeit < 5 min, Live-Punkt, Akku fast leer |
| `--km-on-bg` | `#EAF7F5` | Text/Symbole direkt auf dem Hintergrund |
| `--km-sync-bg` | `#15303A` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#EAF7F5` | Sync-Abzeichen Symbol |

### Heldenstadt / Hero City — `heldenstadt`
- **Grund:** dunkel → Kopfleisten-Text/Status hell (`--km-on-bg` = Creme)
- **Schrift:** Baloo 2 (`/theme-data/_fonts/Baloo2-Variable.ttf`)
- **Maskottchen:** Kapi – runder kleiner Held mit Maske, Stern und rotem Umhang
- **Hintergrund-Motive:** Stadt bei Nacht: Sterne, Mondsichel, Suchscheinwerfer-Kegel, Hochhäuser mit leuchtenden Fenstern (zwei schmale Türme in den Kartenlücken mit Antennen-Lichtern), Straße, Held fliegt am Himmel, Blitz-Symbol, Heldenwagen, Stern-Umhang.
- **Referenz:** `design-reference/Mupi Screen Heldenstadt.dc.html`

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#1A2150` | Hintergrund (Grundfarbe) |
| `--km-night-2` | `#232C66` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Pillen |
| `--km-night-3` | `#2F3A80` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#3B4796` | Gedrückt, Cover-Füllung, Platzhalter-Grund |
| `--km-stack-1` | `#8C98E8` | Ordner-Stapel vorne |
| `--km-stack-2` | `#5663B8` | Ordner-Stapel hinten |
| `--km-shadow` | `#10153A` | Harte Versatz-Schatten |
| `--km-overlay` | `#141A42` | Tageslimit/Ruhezeit/Eltern-Pause (einfarbig) |
| `--km-cream` | `#FFF6E8` | Namensleiste, Karten |
| `--km-ring` | `#FFE28A` | Ring um runde Bilder |
| `--km-ink` | `#1E1A33` | Text auf hellen Flächen |
| `--km-lavender` | `#C3C8F0` | Sekundärtext, Zeiten, Akku-Prozent |
| `--km-apricot` | `#FFC53D` | Akzent: aktiver Reiter, Play, Badges, Fortschritt |
| `--km-apricot-shadow` | `#B8861A` | Schatten unter Play |
| `--km-moon` | `#FFE28A` | Namensleiste „liest vor“, Lade-Punkte, Overlay-Abzeichen-Inhalt |
| `--km-rose` | `#FF5C6C` | Hörzeit < 5 min, Live-Punkt, Akku fast leer |
| `--km-on-bg` | `#FFF6E8` | Text/Symbole direkt auf dem Hintergrund |
| `--km-sync-bg` | `#1A2150` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#FFF6E8` | Sync-Abzeichen Symbol |

### Safari / Safari Trail — `safari`
- **Grund:** hell → `km-light`, Kopfleisten-Text/Status dunkel (`--km-on-bg` = Ink)
- **Schrift:** Fredoka (`/theme-data/_fonts/Fredoka-Variable.ttf`)
- **Maskottchen:** Leo – Löwenjunges mit runder Mähne
- **Hintergrund-Motive:** Savanne am Nachmittag: warme Sonne, Vögel, Sandhügel, zwei Akazien, Giraffe mit langem Hals in der Lücke zwischen Karte 1 und 2, Elefant, Zebra, Grasbüschel.
- **Referenz:** `design-reference/Mupi Screen Safari.dc.html`

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#FBE7B5` | Hintergrund (Grundfarbe) |
| `--km-night-2` | `#FFFFFF` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Pillen |
| `--km-night-3` | `#A0602E` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#874E22` | Gedrückt, Cover-Füllung, Platzhalter-Grund |
| `--km-stack-1` | `#FFFFFF` | Ordner-Stapel vorne |
| `--km-stack-2` | `#F2D28E` | Ordner-Stapel hinten |
| `--km-shadow` | `#E0C27F` | Harte Versatz-Schatten |
| `--km-overlay` | `#FFF6E0` | Tageslimit/Ruhezeit/Eltern-Pause (einfarbig) |
| `--km-cream` | `#FFFFFF` | Namensleiste, Karten |
| `--km-ring` | `#FFFFFF` | Ring um runde Bilder |
| `--km-ink` | `#33261B` | Text auf hellen Flächen |
| `--km-lavender` | `#5E4631` | Sekundärtext, Zeiten, Akku-Prozent |
| `--km-apricot` | `#6FB24A` | Akzent: aktiver Reiter, Play, Badges, Fortschritt |
| `--km-apricot-shadow` | `#4A8430` | Schatten unter Play |
| `--km-moon` | `#FFD23F` | Namensleiste „liest vor“, Lade-Punkte, Overlay-Abzeichen-Inhalt |
| `--km-rose` | `#E2553B` | Hörzeit < 5 min, Live-Punkt, Akku fast leer |
| `--km-on-bg` | `#33261B` | Text/Symbole direkt auf dem Hintergrund |
| `--km-sync-bg` | `#874E22` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#FFFFFF` | Sync-Abzeichen Symbol |

### Pinguin-Eiswelt / Penguin Ice — `eiswelt`
- **Grund:** hell → `km-light`, Kopfleisten-Text/Status dunkel (`--km-on-bg` = Ink)
- **Schrift:** Fredoka (`/theme-data/_fonts/Fredoka-Variable.ttf`)
- **Maskottchen:** Pingo – Pinguin mit oranger Wollmütze
- **Hintergrund-Motive:** Eislandschaft: blasse Sonne, Schneeflocken, Eisberge, zwei Eiszapfen-Spitzen in den Kartenlücken, Iglu, drei Pinguine, Eisloch, Robbe, Schneefeld.
- **Referenz:** `design-reference/Mupi Screen Eiswelt.dc.html`

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#DDF1FB` | Hintergrund (Grundfarbe) |
| `--km-night-2` | `#FFFFFF` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Pillen |
| `--km-night-3` | `#2E7DB5` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#236795` | Gedrückt, Cover-Füllung, Platzhalter-Grund |
| `--km-stack-1` | `#FFFFFF` | Ordner-Stapel vorne |
| `--km-stack-2` | `#C8E4F4` | Ordner-Stapel hinten |
| `--km-shadow` | `#A9D2EA` | Harte Versatz-Schatten |
| `--km-overlay` | `#F2FAFE` | Tageslimit/Ruhezeit/Eltern-Pause (einfarbig) |
| `--km-cream` | `#FFFFFF` | Namensleiste, Karten |
| `--km-ring` | `#FFFFFF` | Ring um runde Bilder |
| `--km-ink` | `#1E2C3A` | Text auf hellen Flächen |
| `--km-lavender` | `#355468` | Sekundärtext, Zeiten, Akku-Prozent |
| `--km-apricot` | `#FF8A5C` | Akzent: aktiver Reiter, Play, Badges, Fortschritt |
| `--km-apricot-shadow` | `#C75A32` | Schatten unter Play |
| `--km-moon` | `#FFE07A` | Namensleiste „liest vor“, Lade-Punkte, Overlay-Abzeichen-Inhalt |
| `--km-rose` | `#E8505B` | Hörzeit < 5 min, Live-Punkt, Akku fast leer |
| `--km-on-bg` | `#1E2C3A` | Text/Symbole direkt auf dem Hintergrund |
| `--km-sync-bg` | `#236795` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#FFFFFF` | Sync-Abzeichen Symbol |

### Zirkus / Circus Tent — `zirkus`
- **Grund:** dunkel → Kopfleisten-Text/Status hell (`--km-on-bg` = Creme)
- **Schrift:** Fredoka (`/theme-data/_fonts/Fredoka-Variable.ttf`)
- **Maskottchen:** Trööt – kleiner Elefant mit rotem Zirkushütchen
- **Hintergrund-Motive:** Im Zirkuszelt am Abend: rot-weiße Zeltbahnen, Wimpel oben, Lichterkette, runde Manege, zwei Podeste mit Bällen in den Kartenlücken, Trommel, Ball, Luftballons, goldene Sterne.
- **Referenz:** `design-reference/Mupi Screen Zirkus.dc.html`

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#2A1838` | Hintergrund (Grundfarbe) |
| `--km-night-2` | `#37204A` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Pillen |
| `--km-night-3` | `#4A2C60` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#5C3876` | Gedrückt, Cover-Füllung, Platzhalter-Grund |
| `--km-stack-1` | `#E86A6A` | Ordner-Stapel vorne |
| `--km-stack-2` | `#A9477A` | Ordner-Stapel hinten |
| `--km-shadow` | `#190E22` | Harte Versatz-Schatten |
| `--km-overlay` | `#221430` | Tageslimit/Ruhezeit/Eltern-Pause (einfarbig) |
| `--km-cream` | `#FFF4E4` | Namensleiste, Karten |
| `--km-ring` | `#FFD36B` | Ring um runde Bilder |
| `--km-ink` | `#2A1A2E` | Text auf hellen Flächen |
| `--km-lavender` | `#E3C9E8` | Sekundärtext, Zeiten, Akku-Prozent |
| `--km-apricot` | `#FFD36B` | Akzent: aktiver Reiter, Play, Badges, Fortschritt |
| `--km-apricot-shadow` | `#B8912A` | Schatten unter Play |
| `--km-moon` | `#FFE7A8` | Namensleiste „liest vor“, Lade-Punkte, Overlay-Abzeichen-Inhalt |
| `--km-rose` | `#FF6B7A` | Hörzeit < 5 min, Live-Punkt, Akku fast leer |
| `--km-on-bg` | `#FFF4E4` | Text/Symbole direkt auf dem Hintergrund |
| `--km-sync-bg` | `#2A1838` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#FFF4E4` | Sync-Abzeichen Symbol |

### Meerjungfrau-Lagune / Mermaid Lagoon — `meerjungfrau`
- **Grund:** hell → `km-light`, Kopfleisten-Text/Status dunkel (`--km-on-bg` = Ink)
- **Schrift:** Fredoka (`/theme-data/_fonts/Fredoka-Variable.ttf`)
- **Maskottchen:** Perla – rosa Muschel mit Perle als Gesicht
- **Hintergrund-Motive:** Helle Lagune: Lichtwellen oben, Luftblasen, bunte Fische, zwei Seegrashalme in den Kartenlücken, Sandboden, rosa Koralle, offene Muschel mit Perle, Seestern, Muschel.
- **Referenz:** `design-reference/Mupi Screen Meerjungfrau.dc.html`

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#C9F0EC` | Hintergrund (Grundfarbe) |
| `--km-night-2` | `#FFFFFF` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Pillen |
| `--km-night-3` | `#2A9A9A` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#1F7F80` | Gedrückt, Cover-Füllung, Platzhalter-Grund |
| `--km-stack-1` | `#FFFFFF` | Ordner-Stapel vorne |
| `--km-stack-2` | `#BDE7E2` | Ordner-Stapel hinten |
| `--km-shadow` | `#94D2CC` | Harte Versatz-Schatten |
| `--km-overlay` | `#F0FBF9` | Tageslimit/Ruhezeit/Eltern-Pause (einfarbig) |
| `--km-cream` | `#FFFFFF` | Namensleiste, Karten |
| `--km-ring` | `#FFFFFF` | Ring um runde Bilder |
| `--km-ink` | `#1F2E3A` | Text auf hellen Flächen |
| `--km-lavender` | `#2F5A60` | Sekundärtext, Zeiten, Akku-Prozent |
| `--km-apricot` | `#FF8FB1` | Akzent: aktiver Reiter, Play, Badges, Fortschritt |
| `--km-apricot-shadow` | `#CF5C82` | Schatten unter Play |
| `--km-moon` | `#FFE58A` | Namensleiste „liest vor“, Lade-Punkte, Overlay-Abzeichen-Inhalt |
| `--km-rose` | `#EF5A6A` | Hörzeit < 5 min, Live-Punkt, Akku fast leer |
| `--km-on-bg` | `#1F2E3A` | Text/Symbole direkt auf dem Hintergrund |
| `--km-sync-bg` | `#1F7F80` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#FFFFFF` | Sync-Abzeichen Symbol |

### Ballettbühne / Ballet Stage — `ballett`
- **Grund:** dunkel → Kopfleisten-Text/Status hell (`--km-on-bg` = Creme)
- **Schrift:** Fredoka (`/theme-data/_fonts/Fredoka-Variable.ttf`)
- **Maskottchen:** Tutu – weißes Häschen mit rosa Schleife
- **Hintergrund-Motive:** Bühne am Abend: roter Samtvorhang links und rechts, Volant mit Goldkante oben, Scheinwerferkegel, Holzbühne mit Lichtpunkten, Ballerina in der Lücke zwischen Karte 2 und 3, Ballettschuhe, Rosenstrauß, Krönchen.
- **Referenz:** `design-reference/Mupi Screen Ballett.dc.html`

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#2B1A3A` | Hintergrund (Grundfarbe) |
| `--km-night-2` | `#38224C` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Pillen |
| `--km-night-3` | `#4B2E64` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#5E3A7C` | Gedrückt, Cover-Füllung, Platzhalter-Grund |
| `--km-stack-1` | `#E7A6D0` | Ordner-Stapel vorne |
| `--km-stack-2` | `#A86A9E` | Ordner-Stapel hinten |
| `--km-shadow` | `#1A0F24` | Harte Versatz-Schatten |
| `--km-overlay` | `#22142E` | Tageslimit/Ruhezeit/Eltern-Pause (einfarbig) |
| `--km-cream` | `#FFF3F6` | Namensleiste, Karten |
| `--km-ring` | `#F7C6DA` | Ring um runde Bilder |
| `--km-ink` | `#2B1A33` | Text auf hellen Flächen |
| `--km-lavender` | `#E2CBEA` | Sekundärtext, Zeiten, Akku-Prozent |
| `--km-apricot` | `#FF9EC2` | Akzent: aktiver Reiter, Play, Badges, Fortschritt |
| `--km-apricot-shadow` | `#C4628A` | Schatten unter Play |
| `--km-moon` | `#FFE3A8` | Namensleiste „liest vor“, Lade-Punkte, Overlay-Abzeichen-Inhalt |
| `--km-rose` | `#FF6B7E` | Hörzeit < 5 min, Live-Punkt, Akku fast leer |
| `--km-on-bg` | `#FFF3F6` | Text/Symbole direkt auf dem Hintergrund |
| `--km-sync-bg` | `#2B1A3A` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#FFF3F6` | Sync-Abzeichen Symbol |

### Kätzchenzimmer / Kitten Room — `kaetzchen`
- **Grund:** hell → `km-light`, Kopfleisten-Text/Status dunkel (`--km-on-bg` = Ink)
- **Schrift:** Fredoka (`/theme-data/_fonts/Fredoka-Variable.ttf`)
- **Maskottchen:** Mimi – rotgetigertes Kätzchen mit Schnurrhaaren
- **Hintergrund-Motive:** Gemütliches Zimmer: Fenster mit Vorhang und Sonne, Rautentapete, Holzboden, blauer Teppich, Kratzbaum mit Wollball in der Lücke zwischen Karte 1 und 2, Wollknäuel, Katzenkorb mit schlafendem Kätzchen, Napf, Spielmaus.
- **Referenz:** `design-reference/Mupi Screen Kaetzchen.dc.html`

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#FCE3D2` | Hintergrund (Grundfarbe) |
| `--km-night-2` | `#FFFFFF` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Pillen |
| `--km-night-3` | `#C9694A` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#A9543A` | Gedrückt, Cover-Füllung, Platzhalter-Grund |
| `--km-stack-1` | `#FFFFFF` | Ordner-Stapel vorne |
| `--km-stack-2` | `#F6CDB6` | Ordner-Stapel hinten |
| `--km-shadow` | `#E8BFA6` | Harte Versatz-Schatten |
| `--km-overlay` | `#FFF5EE` | Tageslimit/Ruhezeit/Eltern-Pause (einfarbig) |
| `--km-cream` | `#FFFFFF` | Namensleiste, Karten |
| `--km-ring` | `#FFFFFF` | Ring um runde Bilder |
| `--km-ink` | `#35242A` | Text auf hellen Flächen |
| `--km-lavender` | `#6A4A48` | Sekundärtext, Zeiten, Akku-Prozent |
| `--km-apricot` | `#7FB8E0` | Akzent: aktiver Reiter, Play, Badges, Fortschritt |
| `--km-apricot-shadow` | `#4E88B0` | Schatten unter Play |
| `--km-moon` | `#FFD970` | Namensleiste „liest vor“, Lade-Punkte, Overlay-Abzeichen-Inhalt |
| `--km-rose` | `#E5566A` | Hörzeit < 5 min, Live-Punkt, Akku fast leer |
| `--km-on-bg` | `#35242A` | Text/Symbole direkt auf dem Hintergrund |
| `--km-sync-bg` | `#A9543A` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#FFFFFF` | Sync-Abzeichen Symbol |

### Zuckerland / Candy Land — `zuckerland`
- **Grund:** hell → `km-light`, Kopfleisten-Text/Status dunkel (`--km-on-bg` = Ink)
- **Schrift:** Fredoka (`/theme-data/_fonts/Fredoka-Variable.ttf`)
- **Maskottchen:** Muffi – Cupcake mit Sahnehaube und Kirsche
- **Hintergrund-Motive:** Süßigkeitenland: Zuckerwolken, Streusel, Zuckerguss-Hügel mit Schokoboden, Zuckerstange und Lolli in den Kartenlücken, Lebkuchenhaus, Törtchen, Eis in der Waffel, Bonbon.
- **Referenz:** `design-reference/Mupi Screen Zuckerland.dc.html`

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#FDE0EC` | Hintergrund (Grundfarbe) |
| `--km-night-2` | `#FFFFFF` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Pillen |
| `--km-night-3` | `#D0508A` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#B03E74` | Gedrückt, Cover-Füllung, Platzhalter-Grund |
| `--km-stack-1` | `#FFFFFF` | Ordner-Stapel vorne |
| `--km-stack-2` | `#F7C6DB` | Ordner-Stapel hinten |
| `--km-shadow` | `#EDB6CE` | Harte Versatz-Schatten |
| `--km-overlay` | `#FFF4F8` | Tageslimit/Ruhezeit/Eltern-Pause (einfarbig) |
| `--km-cream` | `#FFFFFF` | Namensleiste, Karten |
| `--km-ring` | `#FFFFFF` | Ring um runde Bilder |
| `--km-ink` | `#3A2030` | Text auf hellen Flächen |
| `--km-lavender` | `#6C3A55` | Sekundärtext, Zeiten, Akku-Prozent |
| `--km-apricot` | `#6FCDB8` | Akzent: aktiver Reiter, Play, Badges, Fortschritt |
| `--km-apricot-shadow` | `#3E9E8A` | Schatten unter Play |
| `--km-moon` | `#FFE27A` | Namensleiste „liest vor“, Lade-Punkte, Overlay-Abzeichen-Inhalt |
| `--km-rose` | `#E8455A` | Hörzeit < 5 min, Live-Punkt, Akku fast leer |
| `--km-on-bg` | `#3A2030` | Text/Symbole direkt auf dem Hintergrund |
| `--km-sync-bg` | `#B03E74` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#FFFFFF` | Sync-Abzeichen Symbol |

### Schmetterlingsgarten / Butterfly Garden — `schmetterlinge`
- **Grund:** hell → `km-light`, Kopfleisten-Text/Status dunkel (`--km-on-bg` = Ink)
- **Schrift:** Fredoka (`/theme-data/_fonts/Fredoka-Variable.ttf`)
- **Maskottchen:** Flatter – lila-oranger Schmetterling mit Fühlern
- **Hintergrund-Motive:** Sommergarten: Sonne, bunte Schmetterlinge, grüne Hügel, zwei hohe Blumen in den Kartenlücken, Rosenbogen aus Gitter, kleine Blumen, Marienkäfer, Blatt.
- **Referenz:** `design-reference/Mupi Screen Schmetterlinge.dc.html`

| Variable | Wert | Rolle |
|---|---|---|
| `--km-night` | `#E4F4DC` | Hintergrund (Grundfarbe) |
| `--km-night-2` | `#FFFFFF` | Reiterleiste, Titelliste-Panel, Spul-/Zufall-Knöpfe, Pillen |
| `--km-night-3` | `#7A5CB8` | Runde Knöpfe, Hörzeit normal, Balken-Spur, Abzeichen-Grund |
| `--km-night-4` | `#654A9C` | Gedrückt, Cover-Füllung, Platzhalter-Grund |
| `--km-stack-1` | `#FFFFFF` | Ordner-Stapel vorne |
| `--km-stack-2` | `#D7CCEF` | Ordner-Stapel hinten |
| `--km-shadow` | `#BFDDB0` | Harte Versatz-Schatten |
| `--km-overlay` | `#F6FBF2` | Tageslimit/Ruhezeit/Eltern-Pause (einfarbig) |
| `--km-cream` | `#FFFFFF` | Namensleiste, Karten |
| `--km-ring` | `#FFFFFF` | Ring um runde Bilder |
| `--km-ink` | `#2C2838` | Text auf hellen Flächen |
| `--km-lavender` | `#4E4668` | Sekundärtext, Zeiten, Akku-Prozent |
| `--km-apricot` | `#FFA64D` | Akzent: aktiver Reiter, Play, Badges, Fortschritt |
| `--km-apricot-shadow` | `#C4731F` | Schatten unter Play |
| `--km-moon` | `#FFE066` | Namensleiste „liest vor“, Lade-Punkte, Overlay-Abzeichen-Inhalt |
| `--km-rose` | `#E8506A` | Hörzeit < 5 min, Live-Punkt, Akku fast leer |
| `--km-on-bg` | `#2C2838` | Text/Symbole direkt auf dem Hintergrund |
| `--km-sync-bg` | `#654A9C` | Sync-Abzeichen Grund |
| `--km-sync-fg` | `#FFFFFF` | Sync-Abzeichen Symbol |

## 8. Assets & Lizenzen
- Alle SVGs in `theme-data/` (Hintergründe, Maskottchen) sind eigene Werke aus diesem Design, frei nutzbar (CC0). Hintergründe 1600 × 960 Ausgabegröße, wenige KB.
- Symbole: Ionicons (MIT), bereits in der App: `folder`, `play`, `link`, `time-outline`, `hourglass-outline`, `cloud-offline-outline`, `musical-notes-outline`, `volume-medium`, `close`, `book-outline`, `server-outline`, `radio-outline`, `timer-outline`, `arrow-back-outline`.
- Schriften: Fredoka, Baloo 2 – SIL Open Font License 1.1 (siehe Abschnitt 1).

## 9. Abnahme-Checkliste (je Theme)
- [ ] In MuPi-Conf auswählbar, wird auf der Box aktiv; Wechsel zu altem Theme entfernt alle km-Klassen.
- [ ] Schieberegler „Cover-Flow-Ansicht“ nur bei km-Themes sichtbar; an = Bühne auf Start + Liste, aus = Reihe.
- [ ] Startseite: Reiter, runde Bilder mit Ring, Namensleiste liest vor und leuchtet.
- [ ] Albumliste: Ordner-Stapel + Badge, „Alle Titel hier“, Sync-Abzeichen, Hochformat-Cover, Cover fehlt (Maskottchen), wenige Einträge zentriert, 190 Einträge flüssig.
- [ ] Player: spielt/pausiert, Zufall an, Radio mit Live/Verbinde, Titelliste mit „Zu“, langes Drücken.
- [ ] Hörzeit 3 Stufen; Tageslimit; Ruhezeit (freie Überschrift); NAS nicht erreichbar; Laden; Eltern-QR; Bildschirm aus.
- [ ] Helle Themes: Kopfleisten-Text/Status dunkel lesbar (sonnenhof, pferdehof, bastelpapier, prinzessin, einhorn, piratenbucht, tagundnacht tagsüber).
- [ ] Tag & Nacht wechselt um 18/7 Uhr und bei Ruhezeit, mit Überblendung.
- [ ] Offline (keine externen Requests), flüssig auf Pi 4.
- [ ] 1024 × 600 und 1280 × 800 geprüft (falls vorhanden).

## 10. Hinweise
- Die CSS-Selektoren wurden gegen die mitgelieferten Quell-Ausschnitte geschrieben, nicht gegen die laufende App – bei Ionic-Shadow-DOM ggf. auf `::part()`/CSS-Variablen umstellen. Der **Maßstab ist die Referenz** (`design-reference/`), nicht der exakte Selektor.
- Die Motive in den Hintergründen liegen bewusst im unteren Streifen und in den Lücken; die Cover verdecken den Rest.

## 11. Bildschirmfotos aller Zustände (`screens/`)
Pro Theme ein Ordner `screens/<id>/` mit 22 Bildern (800 × 480, JPG, aus den Referenz-Prototypen). `tagundnacht/` enthält beide Sätze mit Präfix `tag-` (= Sonnenhof) und `nacht-`. Cover sind Platzhalter.

| Datei | Zustand |
|---|---|
| 01-startseite | Startseite, Hörspiele, Hörzeit „wird knapp“ (8 min) |
| 02-startseite-vorlesen | Namensleiste liest vor (mondgelb, scale 1.05) |
| 03-startseite-antippen | Bild wird angetippt (scale .93) |
| 04-startseite-buehne | Cover-Flow-Ansicht „Bühne“ auf der Startseite |
| 05-albumliste-ordner-alle-titel | „Alle Titel hier“ + Ordner (Kartenstapel, Badge) + Sync-Abzeichen |
| 06-albumliste-hochformat-cover-fehlt | Ordner, Hochformat-Cover, Cover fehlt (Maskottchen) |
| 07-albumliste-viele-sync | 190 Einträge (TKKG), Hochformat, Sync, Scrollbalken |
| 08-albumliste-wenige | Weiterhören-Liste, wenige Einträge |
| 09-albumliste-buehne-ordner | Bühne in der Albumliste, Ordner in der Mitte |
| 10-player-spielt | Player spielt (Hörspiel) |
| 11-player-pausiert | Player pausiert |
| 12-player-musik-zufall | Musik, Zufall an |
| 13-player-langes-druecken | Langes Drücken aufs Cover, Ring füllt sich |
| 14-player-titelliste | Titelliste mit Mini-Cover und „Zu“ |
| 15-player-radio-puffert | Radio, Stream puffert („Verbinde …“) |
| 16-player-radio-live-hoerzeit-kritisch | Radio live, Hörzeit fast vorbei (2 min) |
| 17-hoerzeit-normal-2-kategorien | Musik, nur 2 Kategorien, Hörzeit normal (25 min) |
| 18-laden | Laden (drei Punkte) |
| 19-nas-nicht-erreichbar | NAS nicht erreichbar |
| 20-tageslimit | Tageslimit erreicht |
| 21-ruhezeit | Ruhezeit („Schlafenszeit“, frei wählbar) |
| 22-eltern-qr | Eltern-QR-Code |

„Bildschirm aus“ ist reines Schwarz und nicht abgebildet.

## 12. Cover-Platzhalter im Player (ersetzt den Bären mit Kopfhörer)
Heute zeigt der Player für Titel ohne Cover einen Bären mit Kopfhörer. Bei km-Themes stattdessen das Maskottchen des Themes (ohne Kopfhörer):

- Datei: `/theme-data/<id>/cover-platzhalter.svg` (quadratisch, viewBox 100 × 100, Ausgabe 640 × 640). Pfad auch in `km-themes.json` → `coverPlaceholder`.
- `tagundnacht`: tagsüber `cover-platzhalter.svg` (Sonni), nachts (`body.km-night`) `cover-platzhalter-nacht.svg` (Mondi) → `coverPlaceholderNight`.
- Aufbau: Grund `--km-night-4` mit Pünktchen in `--km-moon`, zwei helle Kreise, Maskottchen (wach) mittig, drei Noten in `--km-moon`.
- **Umsetzung:** die Stelle im Code finden, an der das Standard-Cover (Bär) gesetzt wird (Suche nach dem Bilddateinamen bzw. dem Fallback bei fehlendem `imgSrc` im Player und im Cover-Dienst). Bei `isKmTheme()` dort `kmCoverPlaceholder()` aus dem ThemeService liefern (bei `tagundnacht` nachts die Nacht-Datei). Gilt auch für das Mini-Cover in der Titelliste und – empfohlen – für die Albumliste/Bühne statt `.km-missing` (dann dieselbe Datei als `img`, `object-fit: cover`).
- Nicht-km-Themes behalten den Bären.
