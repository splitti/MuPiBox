import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core'
import { DisplayTextsService } from '../display-texts.service'
import { type BoxUser, HOLD_MS, UsersService } from './users.service'

/** Without a touch the overview closes again after this long */
const IDLE_MS = 60_000

/**
 * Several users (5.1) on the display: the overview behind the dot in the header - one tile per user, the one in place
 * marked. How a tile switches is the setting of the app (Mehrere Benutzer › Wechsel am Display): "free" a tap, "hold"
 * the tile held for 3 s (a fill shows how long), "app" not at all. A user with a PIN: a pad for it first (going back
 * to the user in place needs none). After a switch the server loads the display anew. And the note when an extension
 * starts something of another library (UsersService.allows).
 */
@Component({
  selector: 'mupi-users-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (users.hint(); as hint) {
      <div class="u-hint" role="status" (click)="users.hint.set(null)">{{ hint }}</div>
    }
    @if (users.overviewOpen() && users.apart()) {
      <div class="u-back" (click)="close()" (pointerdown)="touched()">
        <div class="u-panel" role="dialog" aria-modal="true" [attr.aria-label]="texts.text('usersTitle')" (click)="$event.stopPropagation()">
          <div class="u-head">
            <h2>{{ texts.text('usersTitle') }}</h2>
            @if (!switching()) {
              <button type="button" class="u-close" (click)="close()">{{ texts.text('closeShort') }}</button>
            }
          </div>
          @if (switching(); as name) {
            <p class="u-wait">{{ texts.text('usersSwitching', { name }) }}</p>
          } @else if (pinFor(); as u) {
            <div class="u-pin">
              <p class="u-pin-title"><span class="u-dot" [style.background]="u.color"></span>{{ texts.text('usersPinTitle', { name: u.name }) }}</p>
              <div class="u-pin-dots" aria-hidden="true">
                @for (i of [0, 1, 2, 3]; track i) {
                  <span [class.on]="digits().length > i"></span>
                }
              </div>
              @if (message()) {
                <p class="u-msg">{{ message() }}</p>
              }
              <div class="u-pad">
                @for (d of pad; track d) {
                  <button type="button" (click)="digit(d)">{{ d }}</button>
                }
                <button type="button" class="u-pad-x" (click)="cancelPin()">{{ texts.text('powerCancel') }}</button>
                <button type="button" (click)="digit('0')">0</button>
                <button type="button" class="u-pad-x" aria-label="⌫" (click)="digits.set(digits().slice(0, -1))">⌫</button>
              </div>
            </div>
          } @else {
            <div class="u-tiles">
              @for (u of users.state()?.users ?? []; track u.id) {
                <button
                  type="button"
                  class="u-tile"
                  [class.on]="u.id === users.state()?.current"
                  [class.holding]="holding() === u.id"
                  [disabled]="mode() === 'app'"
                  (click)="tap(u)"
                  (pointerdown)="holdStart(u, $event)"
                  (pointerup)="holdStop()"
                  (pointerleave)="holdStop()"
                  (pointercancel)="holdStop()"
                  (contextmenu)="$event.preventDefault()"
                >
                  <span class="u-fill" [style.transition-duration.ms]="holdMs"></span>
                  <span class="u-dot u-dot--big" [style.background]="u.color"></span>
                  <span class="u-name" translate="no">{{ u.name }}</span>
                  @if (u.id === users.state()?.current) {
                    <small>{{ texts.text('usersCurrent') }}</small>
                  }
                </button>
              }
            </div>
            @if (message()) {
              <p class="u-msg">{{ message() }}</p>
            } @else if (mode() === 'hold') {
              <p class="u-note">{{ texts.text('usersHoldHint') }}</p>
            } @else if (mode() === 'app') {
              <p class="u-note">{{ texts.text('usersAppOnly') }}</p>
            }
          }
        </div>
      </div>
    }
  `,
  styles: `
    .u-back {
      position: fixed;
      inset: 0;
      z-index: 10050;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.55);
      font-family: var(--ion-font-family, inherit);
    }
    .u-panel {
      width: min(92vw, 720px);
      max-height: 92vh;
      overflow: auto;
      padding: 18px 20px 20px;
      border-radius: 22px;
      background: var(--ion-background-color, #1c1c1e);
      color: var(--ion-text-color, #fff);
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.45);
    }
    .u-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }
    h2 {
      margin: 0;
      font-size: 26px;
      font-weight: 700;
    }
    .u-close,
    .u-pad button {
      font: inherit;
      color: inherit;
      border: 0;
      background: color-mix(in srgb, currentColor 12%, transparent);
      border-radius: 14px;
      cursor: pointer;
    }
    .u-close {
      font-size: 18px;
      padding: 10px 18px;
    }
    .u-tiles {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 12px;
    }
    .u-tile {
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 18px 10px 14px;
      border-radius: 18px;
      border: 3px solid transparent;
      background: color-mix(in srgb, currentColor 9%, transparent);
      color: inherit;
      font: inherit;
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
      /* (a swipe scrolls a long list - and ends a hold: pointercancel) */
      touch-action: pan-y;
    }
    .u-tile:disabled {
      cursor: default;
      opacity: 1;
    }
    .u-tile.on {
      border-color: currentColor;
    }
    .u-fill {
      position: absolute;
      inset: 0;
      background: color-mix(in srgb, currentColor 22%, transparent);
      transform: scaleX(0);
      transform-origin: left;
      transition-property: transform;
      transition-duration: 0ms;
      transition-timing-function: linear;
      pointer-events: none;
    }
    .u-tile:not(.holding) .u-fill {
      transition-duration: 0ms !important;
    }
    .u-tile.holding .u-fill {
      transform: scaleX(1);
    }
    .u-dot {
      display: inline-block;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      flex: none;
      box-shadow: 0 0 0 2px color-mix(in srgb, currentColor 35%, transparent);
    }
    .u-dot--big {
      position: relative;
      width: 54px;
      height: 54px;
    }
    .u-name {
      position: relative;
      font-size: 21px;
      font-weight: 700;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .u-tile small {
      position: relative;
      font-size: 14px;
      opacity: 0.75;
    }
    .u-note,
    .u-msg,
    .u-wait {
      margin: 14px 0 0;
      font-size: 17px;
      text-align: center;
      opacity: 0.85;
    }
    .u-msg {
      opacity: 1;
      font-weight: 600;
    }
    .u-wait {
      font-size: 22px;
      padding: 30px 0;
    }
    .u-pin {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .u-pin-title {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0 0 12px;
      font-size: 20px;
      font-weight: 700;
    }
    .u-pin-dots {
      display: flex;
      gap: 14px;
      margin-bottom: 6px;
    }
    .u-pin-dots span {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 2px solid currentColor;
    }
    .u-pin-dots span.on {
      background: currentColor;
    }
    .u-pad {
      display: grid;
      grid-template-columns: repeat(3, 76px);
      gap: 10px;
      margin-top: 12px;
    }
    .u-pad button {
      height: 58px;
      font-size: 26px;
      font-weight: 600;
    }
    .u-pad .u-pad-x {
      font-size: 17px;
    }
    .u-hint {
      position: fixed;
      left: 50%;
      bottom: 28px;
      transform: translateX(-50%);
      z-index: 10060;
      max-width: 88vw;
      padding: 14px 22px;
      border-radius: 16px;
      background: rgba(20, 20, 22, 0.92);
      color: #fff;
      font: 600 19px/1.3 var(--ion-font-family, inherit);
      text-align: center;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
    }
  `,
})
export class UsersOverlayComponent {
  protected readonly users = inject(UsersService)
  protected readonly texts = inject(DisplayTextsService)
  protected readonly holdMs = HOLD_MS
  protected readonly pad = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
  protected readonly mode = computed(() => this.users.state()?.switchMode ?? 'free')
  /** the name of the user a switch is under way to */
  protected readonly switching = signal<string | null>(null)
  protected readonly pinFor = signal<BoxUser | null>(null)
  protected readonly digits = signal('')
  protected readonly message = signal('')
  protected readonly holding = signal<string | null>(null)
  private holdTimer = 0
  private holdFrame = 0
  /** the page is being left (the server loads it anew after a switch): its cut-off request is no failure */
  private leaving = false
  private idleTimer = 0

  constructor() {
    // (opened - the dot in the header: fresh, and closed again without a touch)
    effect(() => {
      if (!this.users.overviewOpen()) return
      untracked(() => {
        this.pinFor.set(null)
        this.digits.set('')
        this.message.set('')
        this.touched()
      })
    })
    const leave = (): void => {
      this.leaving = true
    }
    window.addEventListener('pagehide', leave)
    window.addEventListener('beforeunload', leave)
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('pagehide', leave)
      window.removeEventListener('beforeunload', leave)
      window.clearTimeout(this.holdTimer)
      window.clearTimeout(this.idleTimer)
    })
  }

  protected touched(): void {
    window.clearTimeout(this.idleTimer)
    this.idleTimer = window.setTimeout(() => {
      if (!this.switching()) this.close()
    }, IDLE_MS)
  }

  protected close(): void {
    if (this.switching()) return
    this.holdStop()
    this.pinFor.set(null)
    this.digits.set('')
    this.message.set('')
    this.users.overviewOpen.set(false)
  }

  protected tap(u: BoxUser): void {
    if (this.mode() !== 'free') return
    this.choose(u)
  }

  protected holdStart(u: BoxUser, ev: PointerEvent): void {
    this.touched()
    if (this.mode() !== 'hold') return
    ev.preventDefault()
    this.holdStop()
    // (the next frame: the fill starts from nothing)
    this.holdFrame = requestAnimationFrame(() => this.holding.set(u.id))
    this.holdTimer = window.setTimeout(() => {
      this.holding.set(null)
      this.choose(u)
    }, HOLD_MS)
  }

  protected holdStop(): void {
    window.clearTimeout(this.holdTimer)
    cancelAnimationFrame(this.holdFrame)
    this.holdTimer = 0
    this.holding.set(null)
  }

  private choose(u: BoxUser): void {
    this.message.set('')
    if (u.id === this.users.state()?.current) return this.close()
    if (u.pin) {
      this.digits.set('')
      this.pinFor.set(u)
      return
    }
    void this.run(u)
  }

  protected digit(d: string): void {
    const u = this.pinFor()
    if (!u || this.digits().length >= 4) return
    const next = this.digits() + d
    this.digits.set(next)
    if (next.length === 4) void this.run(u, next)
  }

  protected cancelPin(): void {
    this.pinFor.set(null)
    this.digits.set('')
    this.message.set('')
  }

  private async run(u: BoxUser, pin?: string): Promise<void> {
    this.switching.set(u.name)
    const result = await this.users.switchTo(u.id, pin)
    if (this.leaving) return
    if ('ok' in result) {
      // (the server loads the display anew when the switch is done - if that does not come, the page loads itself)
      window.setTimeout(() => location.reload(), 4000)
      return
    }
    this.switching.set(null)
    // (the minute until it closes by itself, anew: one that ran out while it switched did not close it)
    this.touched()
    this.digits.set('')
    switch (result.error) {
      case 'pin':
        // (none was entered: the PIN was set in the app since the display last read the users - it is asked for now)
        if (pin === undefined) {
          this.pinFor.set({ ...u, pin: true })
          void this.users.load()
          return
        }
        this.message.set(this.texts.text('usersPinWrong', { n: result.left }))
        return
      case 'pin_locked':
        this.pinFor.set(null)
        this.message.set(this.texts.text('usersPinLocked', { s: result.seconds }))
        return
      case 'busy':
        this.pinFor.set(null)
        this.message.set(this.texts.text('usersBusy'))
        return
      case 'mode':
        this.pinFor.set(null)
        void this.users.load()
        this.message.set(this.texts.text('usersAppOnly'))
        return
      default:
        this.pinFor.set(null)
        this.message.set(this.texts.text('usersFailed'))
    }
  }
}
