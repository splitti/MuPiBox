import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  WritableSignal,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core'
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop'

import { AsyncPipe } from '@angular/common'
import { Observable } from 'rxjs'
import { PlayerService } from '../player.service'

export interface SwiperData<T> {
  name: string
  imgSrc: Observable<string>
  data: T
}

@Component({
  selector: 'mupi-swiper',
  templateUrl: './swiper.component.html',
  styleUrls: ['./swiper.component.scss'],
  imports: [AsyncPipe],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SwiperComponent<T> {
  public data = input.required<SwiperData<T>[]>()
  public roundImages = input<boolean>(false)
  public elementClicked = output<SwiperData<T>>()

  protected swiperContainer = viewChild<ElementRef>('swiper')
  protected swiper = computed(() => this.swiperContainer()?.nativeElement.swiper)
  protected pageIsShown: WritableSignal<boolean> = signal(false)

  public constructor(private playerService: PlayerService) {
    // If the data changes, we reset the scroll index.
    // Since we cannot have an effect without using the signals value, we convert it
    // to an observable here.
    toObservable(this.data)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.swiper()?.slideTo(0, 0))

    effect(() => {
      if (this.pageIsShown()) {
        this.swiper()?.update()
      }
    })
  }

  public ionViewWillEnter(): void {
    this.pageIsShown.set(true)
  }

  public ionViewWillLeave(): void {
    this.pageIsShown.set(false)
  }

  protected readText(text: string): void {
    this.playerService.sayText(text)
  }
}
