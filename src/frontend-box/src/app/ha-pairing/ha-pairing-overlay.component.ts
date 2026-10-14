import { HttpClient } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { catchError, filter, interval, of, startWith, switchMap } from 'rxjs'
import { environment } from 'src/environments/environment'
import { DisplayTextsService } from '../display-texts.service'

/** What the backend tells the display about Home Assistant (backend-api ha/ha-api.ts pairingForDisplay, messageForDisplay) */
interface HaPairing {
  active: boolean
  /** waiting: opened in the app, Home Assistant has not started yet; approve: it asks for more than showing and
   *  controlling - allowed or not here; code: Home Assistant waits for the code */
  stage?: 'waiting' | 'approve' | 'code'
  code?: string
  client_name?: string
  scopes?: string[]
  /** the rights beyond showing and controlling it asks for (notify, power) */
  extra?: string[]
  expires_in?: number
  /** the key's SPKI SHA-256, in groups of four */
  fingerprint?: string
  /** a message Home Assistant sent for the display */
  message?: { title: string; text: string; expires_in: number } | null
}

/**
 * Home Assistant on the box's own display: pairing - the key's fingerprint to compare with the one Home Assistant
 * shows, the rights beyond showing and controlling to allow or not, then the six-digit code (never in an answer to the
 * network, see the backend: whoever reads it stands at the box) - and the messages Home Assistant sends. Asked every
 * 2 s (every second while something is shown); the backend answers on the box itself only.
 */
@Component({
  selector: 'mupi-ha-pairing-overlay',
  templateUrl: './ha-pairing-overlay.component.html',
  styleUrls: ['./ha-pairing-overlay.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HaPairingOverlayComponent {
  private readonly http = inject(HttpClient)
  protected readonly texts = inject(DisplayTextsService)
  protected readonly pairing = signal<HaPairing>({ active: false })
  protected readonly message = computed(() => this.pairing().message ?? null)
  /** the code in two groups of three: "482 913" */
  protected readonly code = computed(() => (this.pairing().code ?? '').replace(/^(\d{3})(\d{3})$/, '$1 $2'))
  private scopeText(list: string[] | undefined): string {
    const names: Record<string, () => string> = {
      read: () => this.texts.text('haScopeRead'),
      control: () => this.texts.text('haScopeControl'),
      notify: () => this.texts.text('haScopeNotify'),
      power: () => this.texts.text('haScopePower'),
    }
    return (list ?? []).map((s) => names[s]?.() ?? s).join(' · ')
  }
  protected readonly scopes = computed(() => this.scopeText(this.pairing().scopes))
  protected readonly extra = computed(() => this.scopeText(this.pairing().extra))

  constructor() {
    // every second while a pairing or a message is shown (the code goes the moment Home Assistant used it, contract
    // 1.1.0), else every 2 s
    interval(1000)
      .pipe(
        startWith(0),
        filter((n) => n % 2 === 0 || this.pairing().active || !!this.pairing().message),
        switchMap(() => this.http.get<HaPairing>(`${environment.backend.apiUrl}/ha-pairing`).pipe(catchError(() => of({ active: false } as HaPairing)))),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((p) => {
        const was = this.pairing().active || !!this.pairing().message
        this.pairing.set(p && typeof p === 'object' ? p : { active: false })
        // (texts changed in the app since the box started)
        if (!was && (p?.active || p?.message)) this.texts.refresh()
      })
  }

  protected decide(all: boolean): void {
    this.http.post(`${environment.backend.apiUrl}/ha-pairing/approve`, { all }).subscribe({ error: () => undefined })
  }

  protected cancel(): void {
    this.pairing.set({ active: false })
    this.http.post(`${environment.backend.apiUrl}/ha-pairing/cancel`, {}).subscribe({ error: () => undefined })
  }

  protected closeMessage(): void {
    this.pairing.set({ ...this.pairing(), message: null })
    this.http.post(`${environment.backend.apiUrl}/ha-pairing/message/close`, {}).subscribe({ error: () => undefined })
  }
}
