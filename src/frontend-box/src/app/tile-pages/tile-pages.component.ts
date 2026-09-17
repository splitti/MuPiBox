import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core'

import { TileComponent } from '../tile/tile.component'

/** One tile of a paged grid: what to show plus the payload handed back on click. */
export interface TilePageItem<T> {
  imgSrc: string
  title: string
  data: T
}

/** Three columns times two rows fit on the 800x480 screen below the header. */
const TILES_PER_PAGE = 6

/**
 * Paged 3x2 tile grid as designed in the Figma "Album" frame: every page is one
 * viewport high and snaps into place, a column of dots on the right shows the
 * current page. Used by the album view and the resume view.
 */
@Component({
  selector: 'mupi-tile-pages',
  templateUrl: './tile-pages.component.html',
  styleUrls: ['./tile-pages.component.scss'],
  imports: [TileComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TilePagesComponent<T> {
  public items = input.required<TilePageItem<T>[]>()
  public tileClicked = output<T>()
  public labelClicked = output<T>()

  protected activePage = signal(0)
  protected pages = computed(() => {
    const items = this.items()
    const pages: TilePageItem<T>[][] = []
    for (let i = 0; i < items.length; i += TILES_PER_PAGE) {
      pages.push(items.slice(i, i + TILES_PER_PAGE))
    }
    return pages
  })

  private scroller = viewChild<ElementRef<HTMLElement>>('scroller')

  protected onScroll(): void {
    const element = this.scroller()?.nativeElement
    if (!element || element.clientHeight === 0) {
      return
    }
    this.activePage.set(Math.round(element.scrollTop / element.clientHeight))
  }

  protected scrollToPage(index: number): void {
    const element = this.scroller()?.nativeElement
    if (!element) {
      return
    }
    element.scrollTo({ top: index * element.clientHeight, behavior: 'smooth' })
  }
}
