import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core'

/**
 * At most this many dots are shown at once. With more pages the dots become a
 * sliding window around the active page (the outer dots shrink to hint at
 * further pages), so long lists such as podcast shows still show a usable
 * indicator instead of overflowing the screen.
 */
const MAX_VISIBLE_DOTS = 7

interface PageDot {
  index: number
  /** Outer dot of the window while more pages exist in that direction. */
  small: boolean
}

/**
 * Vertical column of page dots (Figma "Album" frame) shared by the paged tile
 * grid and the track list. The embedding component positions the host element
 * and can set `--mupi-dot-gap`.
 */
@Component({
  selector: 'mupi-page-dots',
  templateUrl: './page-dots.component.html',
  styleUrls: ['./page-dots.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageDotsComponent {
  public count = input.required<number>()
  public active = input.required<number>()
  public dotClicked = output<number>()

  protected dots = computed<PageDot[]>(() => {
    const count = this.count()
    const active = this.active()
    if (count <= MAX_VISIBLE_DOTS) {
      return Array.from({ length: count }, (_, index) => ({ index, small: false }))
    }

    const start = Math.min(Math.max(active - Math.floor(MAX_VISIBLE_DOTS / 2), 0), count - MAX_VISIBLE_DOTS)
    return Array.from({ length: MAX_VISIBLE_DOTS }, (_, offset) => {
      const index = start + offset
      const hidesBefore = offset === 0 && start > 0
      const hidesAfter = offset === MAX_VISIBLE_DOTS - 1 && start + MAX_VISIBLE_DOTS < count
      return { index, small: hidesBefore || hidesAfter }
    })
  })
}
