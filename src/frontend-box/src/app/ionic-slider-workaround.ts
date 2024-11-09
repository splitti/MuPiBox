import { Directive, ElementRef, Signal, WritableSignal, computed, signal, viewChild } from '@angular/core'

import Swiper from 'swiper'

/**
 * This class provides a signal {@link pageIsShown} that is set to `true` when ionic shows
 * a page and `false` when the page is not shown. This can be used to show/hide the slider
 * component of a page to prevent initializing problems when returning to a page.
 */
@Directive()
export class IonicSliderWorkaround {
  // This is a workaround for the slider bug that happens due to the way ionic handles
  // navigation, see https://github.com/ionic-team/ionic-framework/issues/10101
  protected pageIsShown: WritableSignal<boolean> = signal(true)

  protected swiper: Signal<Swiper> = computed(() => {
    return this.swiperElem()?.nativeElement.swiper
  })
  private swiperElem = viewChild<ElementRef>('swiper')

  public ionViewWillEnter(): void {
    this.pageIsShown.set(true)
    // Hopefully this activates the swiper after ionic navigation.
    this.swiper().disable()
    this.swiper().enable()
    this.swiper().update()
  }

  public ionViewWillLeave(): void {
    this.pageIsShown.set(false)
  }
}
