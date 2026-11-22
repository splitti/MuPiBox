// How many covers a row of the lists shows: the albums and artists of the tabs, the photo albums. The covers are 222 to 236 px wide and three
// of them fill the 5" display (800 px): one every 800 / 3 px. On a wider display the row shows more of them, so the distance of two covers
// stays the one of the 5" display (at least 244 px: the cover and a gap) - the covers themselves keep their size.
const PITCH = 800 / 3
const PITCH_MIN = 244

/** How many covers a row of the given width shows: three on 800 px and below, more on a wider display */
export function albumsPerView(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 3
  return Math.max(3, Math.min(Math.round(width / PITCH), Math.floor(width / PITCH_MIN)))
}
