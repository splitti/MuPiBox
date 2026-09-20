# Prompt: Cover Flow theme for MuPiBox

A prompt for an AI coding assistant that rebuilds the Cover Flow theme of this fork in your own
MuPiBox project (Angular 20 + Ionic 8 + Swiper 12). Paste the block below into the assistant. For
smaller models, hand over sections 1-7 one after the other; always include the rules of section 0.

The numbers (65 degrees, 193 px, 300 px, `space-between` -272, 130 px of finger travel per cover,
750 ms) are the values this fork ended up with. Change them to taste. Adjust file names and versions
in section 0 if your project differs.

Not covered here: NAS, WiFi and podcast changes of this fork, only the Cover Flow theme with the
cover flip animation, thumbnails and the radio cover cache.

````text
You are working in a fork of splitti/MuPiBox (Raspberry Pi kids' audio player). Frontend: Angular 20
standalone components + Ionic 8 + Swiper 12 (web component), in `src/frontend-box`. Display: 800x480
touch screen in a kiosk browser on a weak Raspberry Pi. Implement an opt-in "Cover Flow" theme for the
artist/album lists, in small steps, building and verifying after each step. Do not change behaviour
of other themes.

## 0. Rules
- Comments in English, matching the surrounding code style (few comments, explain the WHY).
- Theme-gated: everything below is active only when the MuPiBox config has `mupibox.theme === 'coverflow'`
  (read once from `GET /api/config` in the swiper component). Other themes keep the old look.
- Add a theme entry "coverflow" (theme list in the config template, an empty-ish `themes/coverflow.css`,
  a select option in the admin "MuPiBox settings" page) and a second, theme-independent option
  `mupibox.hideScrollbar` (toggle "Hide horizontal scrollbar") that hides the swiper scrollbar.
- Keep the existing swiper component (`src/app/swiper/swiper.component.*`) as the single place for the layout.
- Performance matters: only style what is visible, never restyle hundreds of slides per frame.

## 1. Lists with 10 or more covers (scrolling Cover Flow)
Use `<swiper-container>` with `centered-slides`, `slides-per-view="auto"`, `watch-slides-progress`,
`space-between="-272"`, `touch-ratio="0.67"` (dragging needs 50% more finger travel), scrollbar enabled
unless hidden. Do NOT use Swiper's built-in coverflow effect (it rotates further the further away a slide
is). Instead style every slide from `slide.progress` on `swiperprogress`, `swipersettranslate`, `swiperinit`
and whenever slides change (also once more after ~400 ms because the scrollbar appears late):
- centered cover: flat, 300x300 px, top edge 20 px below the toolbar, no card frame, no titles, rectangular
- neighbours: same tilt for all: `perspective(1000px) translateX(-side*193*a px) translateZ(-100*a px)
  rotateY(side*65*a deg)` with `a = min(|progress|, 1)`, `side = sign(progress)`
- z-index by distance to the center so nearer covers are on top
- slides with |progress| > 7: `visibility:hidden; transform:none` (skip restyling)
- Tapping a tilted side cover slides it to the center; only the centered cover opens. Tilted, overlapping
  covers get wrong click targets from the browser, so find the tapped slide by `getBoundingClientRect()`
  hit-testing, nearest-to-center first.

## 2. Lists with 4 to 9 covers (no swiper scrolling)
- Layout: the first cover starts at the left screen edge and the last ends at the right screen edge
  (no side margin); the selected cover is flat and 300 px wide, all others tilted 65° towards it.
- Do not calculate the tilted widths, MEASURE them: for every possible selection set the transform, read
  `getBoundingClientRect()` of the `ion-card`, correct the translateX for 3 rounds, and cache the result
  (`fewLayouts[selected][index] = {shift, rotate, z}`, key = count + swiper width). Compensate for the swiper's
  own translate with an outer `translateX` (outside the perspective) so tilted shapes keep their measured form.
- Selection by tap, and by drag with pointer events: the position moves continuously (130 px of finger travel
  per cover), covers interpolate between two cached layouts, on release they glide (`transition: transform
  .4s ease`) to the nearest selection. Suppress the click after a drag.
- The swiper scrollbar stays visible as a position indicator (thumb width = track/count, min 40 px, moved by
  hand, `pointer-events:none`), unless `hideScrollbar` is set.

## 3. Lists with 3 covers or fewer
Plain row of equal squares (max 300 px, min gap 20 px, equal gaps around), all facing front, no tilt, no
animation, no scrollbar, tap opens directly.

## 4. Pictures
- Slides use `data-src`, not `src`; set `src` only for covers near the center (radius ~9 progress), nearest
  first; abort covers that are far away and still loading. Re-run this when `data-src` changes
  (MutationObserver).
- Backend (Express): serve library/NAS/RSS covers as cached JPEG thumbnails (`&w=400`), generated with
  python3-pil in a `nice`d child process, max 2 in parallel, cache in `~/.mupibox/thumbs` keyed by path+size+mtime;
  fall back to the original file if PIL is missing.
- Radio covers (remote URLs): fetch once and serve from a local cache keyed by the URL hash (a changed
  URL is downloaded again).

## 5. Page transition "cover flip" (list -> player) and its reverse
Create `CoverFlipService` (providedIn root) with an Ionic `AnimationBuilder` (`createAnimation`):
- The swiper calls `capture(slide)` right before it emits the click: remember the `ion-card` element, its rect and image src.
- The page that opens the player uses `navController.navigateForward(['/player'], {state, animation: service.animation})`
  (fresh capture only, otherwise the normal animation).
- Builder (750 ms, ease-in-out): entering page fades in during the second half (`beforeRemoveClass('ion-page-invisible')`),
  leaving page fades out in the first 30 %. In `beforeAddWrite` create a `position:fixed` overlay at the source rect
  with two `<img>` faces (`backface-visibility:hidden`, back face `rotateY(180deg)` showing the player cover),
  `transform-style:preserve-3d`, `z-index:100000`, `pointer-events:none`. Animate it with the Web Animations API:
  `perspective(1400px) translate3d(0,0,0) rotateY(0) scale(1)` -> at 50 %: half way, `translateZ(120px) rotateY(90deg)` ->
  `translate3d(dx,dy,0) rotateY(180deg) scale(s)` where dx/dy/s move it exactly onto `.cover-card` of the player.
  Hide the source card and the player's own cover until `onFinish`, then remove the overlay.
- Reverse on the player's `<ion-back-button [routerAnimation]="service.returnAnimation">`: same movement in
  reverse order, landing on the remembered list rect; keep the overlay ~250 ms and fade it out over 300 ms,
  because the list slides are re-created only after the page is shown.
- The player must know its cover immediately (`this.cover = media.cover` in the constructor), not only after the
  first status poll, otherwise the flip has nothing to land on.

## 6. Pitfalls found the hard way
- Reused slide DOM keeps the previous transform and animates from it (looks like shaking during page transitions):
  after every content change apply layouts WITHOUT transition for ~900 ms; new short lists fade in (opacity only),
  never glide or rise from a stale state. Do not run layout code while measuring during a page animation
  (rects are wrong while the page moves).
- Measure `getBoundingClientRect` only after setting `transition:none; transform:none` on all slides.
- `NavController.back()` uses browser history; use the Ionic stack (`pop()`) for "one level up".
- Do not put the click handler on the tilted slides themselves (hit-testing, see 1).
- Disabling Ionic page animations globally is NOT the fix for shaking; snapping the layout is.

## 7. Verify (headless, no guessing)
Drive the kiosk URL with Chrome DevTools Protocol at 800x480 and sample every 50 ms during navigation: slide
rect left/width and computed opacity, the overlay's rect and `transform`. Expected: cover widths stay constant
while moving, the overlay ends exactly on the player's `.cover-card` rect (e.g. 28,100,350x350), no
intermediate layouts, lists of 3/4-9/10+ covers each behave as specified. Take screenshots mid-flip and at the end.
Build (`npm run build` in `src/frontend-box`), then deploy the built `browser/` contents into the box's `www/`
and check that the served `main-*.js` is the new bundle.
````
