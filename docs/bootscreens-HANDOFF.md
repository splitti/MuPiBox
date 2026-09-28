# Handoff: Startbilder (Bootscreens), Wartungsbilder, eigener Box-Name

## Ziel
1. **15 Startbilder** statt des einen heutigen `splash.png`. In MuPi-Conf ist eins davon oder **„Zufällig“** auswählbar.
2. **Eigener Name der Box:** In MuPi-Conf ein Feld „Name der Box“ (max. 14 Zeichen). Er erscheint im Startbild statt „MuPiBox“. Leer bedeutet „MuPiBox“.
3. **Wartungsbild je Startbild** (Update, Installation, neues WLAN). Es ersetzt `installation.jpg` und zeigt dieselbe Szene, MuPi trägt dabei Bauhelm und Zahnräder, dazu ein Hinweistext auf Deutsch oder Englisch.
4. Konsole und Browser-Hintergrund beim Start in der **Grundfarbe des gewählten Startbilds**, damit es nicht blitzt.

Die übrigen System-Bildschirme (Tschüss, Akku leer, Neustart) bleiben vorerst wie heute.

## Über die Design-Dateien
`design-reference/Wartungsbilder.dc.html` zeigt nur die 15 Wartungsbilder (Tweaks: Wartungsart, Sprache). `design-reference/MuPi Logo Richtungen.dc.html` ist die Gesamt-Referenz (HTML-Prototyp, kein Produktionscode). Oben liegen die **Wartungsbilder**, darunter die 15 Startbilder (4a–4f, 5a–5i) mit dem Feld für den Box-Namen (Tweaks → „Name der Box“) und dem Entwurf der Auswahl in MuPi-Conf. Weiter unten liegen ältere, verworfene Entwürfe (3a–3f, 2a–2c), die du ignorieren kannst. Öffnen im Browser, `support.js` liegt daneben.

**Fidelity:** High-Fidelity. Szenen, Farben und Textpositionen sind final.

## Paketinhalt
```
bootscreens.json              alle 15 Startbilder: Id, Name DE/EN, Grundfarbe, Textbereich für Namen und Wartungstext
screens/<id>/splash.svg       Szene OHNE Schrift (800 × 480)
screens/<id>/wartung.svg      dieselbe Szene, MuPi mit Bauhelm + Zahnrädern, OHNE Schrift
tools/compose_bootscreen.py   setzt Szene + Text zu einem 800×480-PNG zusammen (Referenz-Umsetzung)
logo/mupi.svg                 MuPi (neu, frontal), Vektor
logo/mupi-handwerker.svg      MuPi mit Bauhelm
logo/mupi-app-icon.svg        App-Icon (Kreis mit Ring)
design-reference/             Prototyp + Assets
```

## Warum der Text auf der Box eingerechnet wird
Die Startbilder werden per `fbv` direkt in den Framebuffer gezeichnet, zur Laufzeit wird dort kein Text gerendert. Deshalb liegen die Szenen **ohne Schrift** vor, und die Box setzt das fertige PNG einmalig zusammen, sobald in MuPi-Conf **Startbild oder Name** gespeichert wird (bei „Zufällig“ zusätzlich bei jedem Start bzw. vorab für alle 15).

## Die 15 Startbilder
| Id | Code | Deutsch | Englisch | Grundfarbe (Konsole/Browser) |
|---|---|---|---|---|
| `abendhuegel` | 4a | Abendhügel | Evening Hills | `#EE9E86` |
| `knete` | 4b | Knete | Clay | `#CFE9F7` |
| `papier` | 4c | Papier-Collage | Paper Collage | `#F6EBD7` |
| `plakativ` | 4d | Plakativ | Poster | `#1E2A44` |
| `kinderbuch` | 4e | Kinderbuch | Picture Book | `#FBF3E4` |
| `retro` | 4f | Retro 70er | Retro 70s | `#F7D9A8` |
| `weltraum` | 5a | Weltraum | Space | `#141A40` |
| `unterwasser` | 5b | Unterwasser | Underwater | `#1678A6` |
| `winter` | 5c | Winterabend | Winter Evening | `#1C2A5A` |
| `lagerfeuer` | 5d | Lagerfeuer | Campfire | `#1E2447` |
| `ballon` | 5e | Ballonfahrt | Balloon Ride | `#BFE6F7` |
| `zimmer` | 5f | Kinderzimmer | Cozy Room | `#F6D8C2` |
| `regenbogen` | 5g | Regenbogen | Rainbow | `#FDE7F0` |
| `konzert` | 5h | Konzert | Concert | `#2A1840` |
| `baumhaus` | 5i | Baumhaus | Treehouse | `#BFE3C6` |

Standard: `abendhuegel`. Die Liste in MuPi-Conf in dieser Reihenfolge anzeigen, als erste Option „Zufällig“ (`random`).

## Textbereich je Startbild (Name)
Aus `bootscreens.json → bootscreens[].name`: `x`, `y` (Oberkante), `maxWidth`, `align` (`left` = ab x, `center` = um 400), `fontSize`, `fontWeight` 600, `letterSpacing` −2, `color`, `textShadow` (CSS-Schreibweise; harte Schatten als zusätzliche versetzte Textlage zeichnen, Blur-Schatten weglassen).
- **Automatisch verkleinern:** Die tatsächliche Textbreite messen (mit der Fredoka-Datei). Ist sie größer als `maxWidth`, gleichmäßig skalieren. Die Schrift wird nie vergrößert. So bleiben ≥ 40 px Abstand zum Rand.
- Namen auf 14 Zeichen begrenzen, führende und nachgestellte Leerzeichen entfernen. Leer ergibt `MuPiBox`.
- Erlaubt sind alle Zeichen, die Fredoka enthält (inkl. Umlaute). XML-Sonderzeichen escapen.

## Wartungsbild
- Szene `screens/<id>/wartung.svg` + Text aus `bootscreens[].maintenanceText`. Der Text steht an derselben Stelle wie der Name: Überschrift (`titleSize`, 600, bricht bei Bedarf an Wörtern auf **max. 2 Zeilen** um und bleibt immer innerhalb von `maxWidth`; nur ein einzelnes zu langes Wort wird verkleinert), darunter die Unterzeile 21/500 in Tinte `#1E2A44` auf einer weißen Pille (92 %, Radius 16, Innenabstand 6/14). Maximal 2 Zeilen mit Umbruch an Wörtern, je Zeile eine Pille, Abstand 6. Die Überschrift hat Farbe und Schatten wie der Name. So ist der Hinweis auf jeder Szene lesbar.
- Texte (`texts` in der JSON), Sprache nach Box-Sprache (`de`, sonst `en`):
  - `update`: „Update läuft“ / „Bitte nicht ausschalten – das dauert ein paar Minuten“
  - `install`: „Installation läuft“ / „Bitte nicht ausschalten – das kann etwas dauern“
  - `wlan`: „Neues WLAN wird eingerichtet“ / „Die Box startet gleich neu“
- Welche Szene: die aktuell gewählte. Bei „Zufällig“ die zuletzt gezeigte (Id merken).
- Die Wartungsbilder vorab erzeugen (je gewählter Szene: 3 Arten × Box-Sprache), damit sie während eines Updates ohne Rechenzeit bereitliegen. Die Update-Skripte sollen **nicht mehr** das Bild aus dem Original-Repository nachladen, sondern das lokal erzeugte verwenden. Fallback ist das alte `installation.jpg`.

## Zusammensetzen – Referenz
`tools/compose_bootscreen.py` ist eine lauffähige Referenz (Pillow zum Messen, `rsvg-convert` zum Rendern):
```
compose_bootscreen.py splash  abendhuegel "MuPiBox" /home/dietpi/MuPiBox/media/images/splash.png
compose_bootscreen.py wartung abendhuegel update de /home/dietpi/MuPiBox/media/images/installation.jpg  (PNG, Endung anpassen)
```
Voraussetzungen: `python3-pil`, `librsvg2-bin`, Fredoka unter `/theme-data/_fonts/Fredoka-Variable.ttf` **und** als Systemschrift für librsvg (z. B. nach `/usr/local/share/fonts/` kopieren + `fc-cache -f`). Du darfst das Skript an die Struktur des Repos anpassen oder in die vorhandene Sprache portieren. Das Ergebnis muss pixelgleich zur Referenz sein.

## Einbau – Schritte
1. `screens/`, `bootscreens.json`, `tools/` ins Repo (z. B. `media/bootscreens/`), Install-/Update-Skripte ergänzen, Abhängigkeiten installieren.
2. **Konfiguration:** neue Schlüssel `bootscreen` (Id oder `random`, Standard `abendhuegel`) und `boxName` (String, Standard leer) im selben Konfig-Objekt wie die übrigen Anzeige-Einstellungen.
3. **MuPi-Conf:** in der Rubrik Theme/Anzeige:
   - Textfeld „Name der Box“ (max. 14, Platzhalter „MuPiBox“);
   - Auswahl „Startbild“ als Raster mit Vorschaubildern (`splash.svg` direkt als `<img>`, darüber der Name per HTML in Fredoka an der Position aus der JSON, skaliert auf Vorschaugröße), dazu „Zufällig“;
   - beim Speichern `splash.png` + Wartungsbilder neu erzeugen und kurz „Wird beim nächsten Start angezeigt“ melden.
4. **Start:** Das Boot-Skript zeigt `splash.png` wie bisher. Bei `random` vorher eine Szene wählen und neu zusammensetzen. Ist das zu langsam, alle 15 bei jedem Speichern vorab erzeugen (`splash-<id>.png`) und nur auswählen.
5. **Grundfarbe:** Konsolen-Hintergrund und Browser-Starthintergrund (heute fest `#44AFE2`) auf `baseColor` des gezeigten Startbilds setzen. Beim Speichern in MuPi-Conf in die jeweilige Konfig schreiben, bei `random` pro Start.
6. **Dateien ersetzen:**
   - `media/images/splash.png` → erzeugtes Startbild (Name + Szene);
   - `media/images/installation.jpg` → erzeugtes Wartungsbild (`update`/`install`/`wlan` je nach Anlass; heute ein Bild für alle drei Fälle);
   - `goodbye.png`, `battery_low.jpg` bleiben vorerst unverändert;
   - Logos: `logo/mupi.svg` steht für die neue Figur bereit. Admin-Bilder, Favicons und Ersatz-Cover erst tauschen, wenn freigegeben (nicht Teil dieses Auftrags).
7. **Abnahme** (siehe unten).

## Abnahme-Checkliste
- [ ] Alle 15 Startbilder erscheinen korrekt beim Start (Motiv, Farben, Name an der richtigen Stelle, ≥ 40 px zum Rand).
- [ ] „MuPiBox“ ohne Eintrag, „MuPiBox“ mit Eintrag, ein langer Name (14 Zeichen, z. B. „WilhelminesBox“) wird verkleinert und nicht abgeschnitten, Umlaute funktionieren.
- [ ] „Zufällig“ wechselt bei jedem Start.
- [ ] Kein Farbblitz: Konsole → Startbild → Browser in derselben Grundfarbe.
- [ ] Wartungsbild bei Update, Installation und neuem WLAN mit der passenden Szene und dem richtigen Text (DE/EN).
- [ ] Update-Skripte laden kein Bild mehr aus dem Original-Repository.
- [ ] MuPi-Conf-Vorschau entspricht dem erzeugten PNG.
- [ ] Offline lauffähig.

## Lizenzen
Szenen, MuPi-Neuzeichnung und Logo sind eigene Werke aus diesem Design, frei nutzbar (CC0). Fredoka: SIL OFL (bereits auf der Box).
