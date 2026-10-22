import { Directive, viewChild } from '@angular/core'

import { SwiperComponent } from './swiper.component'

/**
 * Pages using the {@link SwiperComponent} should extend this class
 * so that the {@link SwiperComponent} gets notified of ionic navitation events.
 * It also provides a utlity function {@link resetSwiperPosition} to reset the slider
 * to the first slide.
 */
@Directive()
export class SwiperIonicEventsHelper {
  protected swiperComponent = viewChild(SwiperComponent)

  // At the start of the page change, not only at its end: the list is drawn while the page comes in (back from the
  // player: the covers are there as the page fades in, not three quarters of a second later)
  public ionViewWillEnter(): void {
    this.swiperComponent()?.ionViewWillEnter()
  }

  public ionViewDidEnter(): void {
    this.swiperComponent().ionViewDidEnter()
  }

  public ionViewWillLeave(): void {
    this.swiperComponent().ionViewWillLeave()
  }

  /**
   * Reset swiper position to first slide.
   */
  public resetSwiperPosition(): void {
    this.swiperComponent().resetSwiperPosition()
  }
}
