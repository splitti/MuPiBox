import { WritableSignal, signal } from '@angular/core'

/**
 * This class provides a signal {@link pageIsShown} that is set to `true` when ionic shows
 * a page and `false` when the page is not shown. This can be used to show/hide the slider
 * component of a page to prevent initializing problems when returning to a page.
 */
export class IonicSliderWorkaround {
  // This is a workaround for the slider bug that happens due to the way ionic handles
  // navigation, see https://github.com/ionic-team/ionic-framework/issues/10101
  protected pageIsShown: WritableSignal<boolean> = signal(true)

  public ionViewWillEnter(): void {
    this.pageIsShown.set(true)
  }

  public ionViewWillLeave(): void {
    this.pageIsShown.set(false)
  }
}
