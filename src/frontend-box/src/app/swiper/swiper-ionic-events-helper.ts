import { Directive, viewChildren } from '@angular/core'

import { SwiperComponent } from './swiper.component'

/**
 * Pages using the {@link SwiperComponent} should extend this class
 * so that every {@link SwiperComponent} on the page gets notified of ionic navigation events.
 * It also provides a utility function {@link resetSwiperPosition} to reset all sliders
 * to their first slide.
 */
@Directive()
export class SwiperIonicEventsHelper {
  protected swiperComponents = viewChildren(SwiperComponent)

  public ionViewDidEnter(): void {
    for (const swiper of this.swiperComponents()) {
      swiper.ionViewDidEnter()
    }
  }

  public ionViewWillLeave(): void {
    for (const swiper of this.swiperComponents()) {
      swiper.ionViewWillLeave()
    }
  }

  /**
   * Reset the position of all swipers to their first slide.
   */
  public resetSwiperPosition(): void {
    for (const swiper of this.swiperComponents()) {
      swiper.resetSwiperPosition()
    }
  }
}
