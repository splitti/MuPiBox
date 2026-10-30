import { HttpClient } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { catchError, interval, of, startWith, switchMap } from 'rxjs'
import { environment } from 'src/environments/environment'
import { DisplayTextsService } from '../display-texts.service'

/** A new display model waiting for its answer (backend-api eltern/display-profile.ts displayTestState) */
interface DisplayTest {
  running: boolean
  /** when the box goes back to the display of before (ms); null before the restart */
  endsAt?: number | null
}

/**
 * The test of a new display model (app: Display & Bedienung › Display-Modell): shown only when the picture is there -
 * a tap on "Behalten" keeps the model (and shows that the touch works too). Without it the box goes back to the
 * display of before by itself (scripts/mupibox/display_profile.sh). Asked every 2 s; the backend answers on the box
 * itself only.
 */
@Component({
  selector: 'mupi-display-test-overlay',
  templateUrl: './display-test-overlay.component.html',
  styleUrls: ['./display-test-overlay.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DisplayTestOverlayComponent {
  private readonly http = inject(HttpClient)
  protected readonly texts = inject(DisplayTextsService)
  protected readonly test = signal<DisplayTest>({ running: false })
  private readonly now = signal(Date.now())
  protected readonly left = computed(() => {
    const ends = this.test().endsAt
    if (!ends) return ''
    const s = Math.max(0, Math.round((ends - this.now()) / 1000))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  })
  protected readonly sending = signal(false)

  constructor() {
    const destroy = inject(DestroyRef)
    interval(2000)
      .pipe(
        startWith(0),
        switchMap(() => this.http.get<DisplayTest>(`${environment.backend.apiUrl}/display-test`).pipe(catchError(() => of({ running: false } as DisplayTest)))),
        takeUntilDestroyed(destroy),
      )
      .subscribe((t) => {
        const was = this.test().running
        this.test.set(t && typeof t === 'object' ? t : { running: false })
        if (!was && t?.running) this.texts.refresh()
      })
    interval(1000)
      .pipe(takeUntilDestroyed(destroy))
      .subscribe(() => this.now.set(Date.now()))
  }

  protected keep(): void {
    this.sending.set(true)
    this.http.post<{ ok: boolean }>(`${environment.backend.apiUrl}/display-test/confirm`, {}).subscribe({
      next: (r) => {
        this.sending.set(false)
        if (r?.ok) this.test.set({ running: false })
      },
      error: () => this.sending.set(false),
    })
  }
}
