# Theme previews

The pictures of the theme tiles in the parents' app (Settings › Appearance › Theme) and in MuPi-Conf are made from
the real display: every theme photographed with the same neutral demo library, so the tiles only differ in what the
theme changes (colours, background, ring, name bars, font).

```
cd src/frontend-box && npx ng build      # the display build the pictures are made from
cd ../..
node tools/theme-preview/render.mjs      # all themes -> AdminInterface/www/images/<id>.png
node tools/theme-preview/render.mjs --only blue,kuschelmond
```

Options: `--www <display build>` (default `src/frontend-box/www/browser`), `--out <folder>` (default
`AdminInterface/www/images`), `--only <ids>`, `--chrome <path>` (or `CHROME=`). Needs Node 22+ and Chrome or Chromium.

## What a preview shows

- The start page in the grid view, the first category, three covers: Lumi, Tilo and Professorin Pimpelbart (the long
  name ends with "…" in the name bar, in every theme font).
- Header as on the box: history, categories, WiFi full, battery 80 % without charging. No "Now playing" pill, no
  listening-time chip, no lock screens.
- `coverflow`: its own cover band with all six covers, Nuri in the middle.
- `custom`: the example landscape `demo-bibliothek/custom-beispiel.svg` instead of the parents' picture, with the hint
  "Beispiel".
- `tagundnacht`: the day (the script sets the clock to 12:00).

The demo library (`demo-bibliothek/`) is made up: six covers without text and short invented names, no real audio
plays, characters or brands. The pictures may go into the public repository.

## A new theme

Nothing to do here: the script takes every `themes/<id>.css`. Add the theme, build the display, run the script and
commit `AdminInterface/www/images/<id>.png` together with the theme (and the rebuilt `AdminInterface/release/www.zip`).

## How it works

The script serves the display build, the theme files (`themes/`) and the demo files itself and answers every request
of the display with the demo data through the Chrome DevTools protocol. The display on the box never has a demo mode.
Pictures are 640 × 384 PNG; a picture over 150 KB (a photo background) is reduced to 256 colours.
