import { Directive, viewChild } from '@angular/core'

import { SwiperComponent } from './swiper.component'

/**
 * Pages using the {@link SwiperComponent} should extend this class
 * so that the {@link SwiperComponent} gets notified of ionic navitation events.
 * It also provides a utlity function {@link resetSliderPosition} to reset the slider
 * to the first slide.
 */
@Directive()
export class SwiperIonicEventsHelper {
  protected swiperComponent = viewChild(SwiperComponent)

  public ionViewDidEnter(): void {
    this.swiperComponent().ionViewDidEnter()
  }

  public ionViewWillLeave(): void {
    this.swiperComponent().ionViewWillLeave()
  }

  /**
   * Reset slider position to first slide.
   */
  public resetSliderPosition(): void {
    this.swiperComponent().resetSwiperPosition()
  }
}
