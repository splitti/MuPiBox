import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core'

type Side = 'up' | 'down' | 'prev' | 'next'

/** How far a button was pulled: 0 (a tap), 1 (2×), 2 (4×). */
export type ScrubStage = 0 | 1 | 2

// the ticks of a scrub (ms) - each tells the page how far the place moved since the last one
const SCRUB_TICK_MS = 250
// a press that stays under this and under TAP_MOVE is a tap; the volume buttons repeat after HOLD_MS
const TAP_MS = 500
const TAP_MOVE = 0.025
const HOLD_MS = 450
const REPEAT_MS = 200
// play / pause held this long switches the outer buttons to the second set (and back after IDLE_MS without a press)
const LONG_PRESS_MS = 2000
const ALT_IDLE_MS = 12000
// while the box winds by itself the control says so this often (the box stops by itself when it does not hear it for 1.5 s)
const WIND_BEAT_MS = 500
// how far the button follows the finger (in units of the 100 wide pad) and how far it has to be pulled for the two steps (shares of the width)
const MAX_PULL = 13
// the button follows the finger at 0.9 of its way (see trackMove), the pad is 0.75 of the control: the full stretch is reached at this
// share of the control's width - 4x starts there, 2x early, at 30 % of it (a tap stays below: TAP_MOVE is 23 % of it)
const STAGE_2 = (MAX_PULL / 90) * 0.75
const STAGE_1 = STAGE_2 * 0.3

/**
 * The path of one of the four wedges of the pad (100 × 100 box), `angle` = the direction of its middle (degrees, 0 = up, clockwise).
 * The channels between the wedges are as wide everywhere (`gap` units, not wider towards the rim), and the channel to the centre key
 * (radius `hub`) is as wide as they are.
 */
export function sectorPath(angle: number, gap = 3, hub = 19.5, outer = 49): string {
  const inner = hub + gap
  const rad = (angle * Math.PI) / 180
  const along = [Math.sin(rad), -Math.cos(rad)]
  const across = [Math.cos(rad), Math.sin(rad)]
  const h = gap / 2
  // a point on the edge of the wedge, `side` = -1 / 1 the edge on the left / right, at the radius r: the edge is parallel to the diagonal
  const point = (r: number, side: -1 | 1) => {
    const t = Math.sqrt(r * r - h * h)
    const x = (t + h) / Math.SQRT2
    const y = side * ((t - h) / Math.SQRT2)
    return `${(50 + along[0] * x + across[0] * y).toFixed(2)} ${(50 + along[1] * x + across[1] * y).toFixed(2)}`
  }
  return `M${point(outer, -1)}A${outer} ${outer} 0 0 1 ${point(outer, 1)}L${point(inner, 1)}A${inner} ${inner} 0 0 0 ${point(inner, -1)}Z`
}

export type RepeatMode = 'off' | 'all' | 'one'

/**
 * The multimedia button of the player: a round control in a silver frame - volume up and down, the two track buttons and play / pause on a
 * black pad, and between pad and frame a ring that lights up blue clockwise as the track plays (a whole circle is the whole track; a
 * stream has no end, its ring stays black).
 *
 * A track button pressed and pulled to its own side (left for back, right for forward) winds: the first step plays at 2×, the second at
 * 4×. The button follows the finger and springs back when it is let go. A tap on it steps to the track before / after. The volume buttons
 * repeat while held. A tap or a pull on the ring itself chooses a place in the track.
 *
 * Play / pause held for two seconds switches the four outer buttons to a second set: shuffle (instead of back), repeat - all, one,
 * none, round and round - (instead of forward), eject the CD (instead of volume down) and "back" (instead of volume up), which
 * returns to the first set (so does twelve seconds without a press).
 */
@Component({
  selector: 'mupi-media-control',
  templateUrl: './media-control.component.html',
  styleUrls: ['./media-control.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediaControlComponent {
  readonly playing = input(false)
  /** How far into the track (percent). */
  readonly progress = input(0)
  /** A stream: no end, so the ring stays dark and there is no step to another track. */
  readonly live = input(false)
  /** The track buttons do something (not for a podcast, whose episodes the player steps through itself). */
  readonly canSkip = input(true)
  /** A place can be chosen and the track wound. */
  readonly canSeek = input(true)
  /** "1:23" and "4:56" under the control (empty: none). */
  readonly position = input('')
  readonly duration = input('')
  /** The second set: shuffle is on, how the playlist repeats, whether each can be used, whether a CD drive is there. */
  readonly shuffle = input(false)
  readonly repeatMode = input<RepeatMode>('off')
  readonly canShuffle = input(true)
  readonly canRepeat = input(true)
  readonly canEject = input(false)
  /** The box winds by itself (faster playback, a silent run back): the control says the mode now and then instead of the steps. */
  readonly smooth = input(false)

  readonly playPause = output<void>()
  readonly volUp = output<void>()
  readonly volDown = output<void>()
  readonly prev = output<void>()
  readonly next = output<void>()
  /** While a track button is pulled: seconds the place moves on top of the normal playing (negative: back), about every 250 ms. */
  readonly scrub = output<number>()
  /** While a track button is pulled and the box winds by itself (`smooth`): the mode, every half second ('f2', 'f4', 'b2', 'b4'), and '0' at the end. */
  readonly wind = output<string>()
  /** A place chosen on the ring (percent). */
  readonly seekTo = output<number>()
  readonly shuffleToggle = output<void>()
  readonly repeatCycle = output<void>()
  readonly eject = output<void>()
  /** The second set was opened (the page looks whether a drive is there). */
  readonly altOpened = output<void>()

  protected readonly pulled = signal<{ side: 'prev' | 'next'; units: number; stage: ScrubStage } | null>(null)
  protected readonly pressed = signal<Side | 'play' | null>(null)
  private readonly chosen = signal<number | null>(null)
  /** The second set of the outer buttons is shown. */
  protected readonly alt = signal(false)
  /** The centre key is held (it turns to the second set at LONG_PRESS_MS). */
  protected readonly holding = signal(false)

  /** The ring: percent lit. */
  protected readonly lit = computed(() => {
    if (this.live()) return 0
    const value = this.chosen() ?? this.progress()
    return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  })

  protected readonly paths = {
    up: sectorPath(0),
    right: sectorPath(90),
    down: sectorPath(180),
    left: sectorPath(270),
  }

  protected speedLabel(side: 'prev' | 'next'): string {
    const p = this.pulled()
    return p && p.side === side && p.stage > 0 ? `${p.stage === 1 ? 2 : 4}×` : ''
  }

  protected shift(side: 'prev' | 'next'): string {
    const p = this.pulled()
    return p && p.side === side ? `translate(${p.units}px, 0)` : 'translate(0, 0)'
  }

  protected wound(side: 'prev' | 'next'): boolean {
    const p = this.pulled()
    return !!p && p.side === side
  }

  // ---------- the pure parts (tested) ----------

  /** The step a pull of `dx` pixels (to the button's own side positive) has reached, for a control `width` pixels wide. */
  static stageFor(dx: number, width: number): ScrubStage {
    if (dx >= width * STAGE_2) return 2
    if (dx >= width * STAGE_1) return 1
    return 0
  }

  /** How far the place moves on top of the normal playing in `ms`: forward at 2× / 4× gains 1× / 3× of the time, back at 2× / 4× loses 3× / 5×. */
  static scrubSeconds(dir: -1 | 1, stage: ScrubStage, ms: number): number {
    if (stage === 0) return 0
    const speed = stage === 1 ? 2 : 4
    return (dir === 1 ? speed - 1 : -(speed + 1)) * (ms / 1000)
  }

  /** The place on the ring (percent) for a point `dx`, `dy` from the middle: 0 at the top, clockwise. */
  static percentAt(dx: number, dy: number): number {
    const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI
    return ((degrees + 360) % 360) / 3.6
  }

  /** Whether a point at this distance from the middle (share of the width) is on the ring and the frame - not on the pad. */
  static onRing(distance: number): boolean {
    return distance >= 0.375 && distance <= 0.5
  }

  // ---------- the buttons ----------

  private pad?: SVGSVGElement
  private repeat: ReturnType<typeof setTimeout> | undefined
  private ticker: ReturnType<typeof setInterval> | undefined

  protected volPress(event: PointerEvent, side: 'up' | 'down') {
    event.stopPropagation()
    const target = event.currentTarget as Element
    target.setPointerCapture?.(event.pointerId)
    this.pressed.set(side)
    const fire = () => (side === 'up' ? this.volUp.emit() : this.volDown.emit())
    fire()
    // (held: the volume goes on, the way a button on a car's steering wheel does)
    this.stopRepeat()
    this.repeat = setTimeout(() => {
      this.ticker = setInterval(fire, REPEAT_MS)
    }, HOLD_MS)
  }

  protected volRelease() {
    this.stopRepeat()
    this.pressed.set(null)
  }

  private stopRepeat() {
    clearTimeout(this.repeat)
    clearInterval(this.ticker)
    this.repeat = undefined
    this.ticker = undefined
  }

  private longTimer: ReturnType<typeof setTimeout> | undefined
  private altTimer: ReturnType<typeof setTimeout> | undefined
  private longDone = false

  protected centreTap(event: PointerEvent) {
    event.stopPropagation()
    this.pressed.set('play')
    this.holding.set(true)
    this.longDone = false
    clearTimeout(this.longTimer)
    this.longTimer = setTimeout(() => {
      this.longDone = true
      this.holding.set(false)
      this.setAlt(!this.alt())
    }, LONG_PRESS_MS)
  }

  protected centreUp(event: PointerEvent) {
    event.stopPropagation()
    clearTimeout(this.longTimer)
    this.holding.set(false)
    // (a hold that turned the set over is not a tap: play / pause stays as it is)
    if (this.pressed() === 'play' && !this.longDone) this.playPause.emit()
    this.longDone = false
    this.pressed.set(null)
  }

  protected centreCancel() {
    clearTimeout(this.longTimer)
    this.holding.set(false)
    this.pressed.set(null)
  }

  private setAlt(on: boolean) {
    clearTimeout(this.altTimer)
    this.alt.set(on)
    this.pressed.set(null)
    if (on) {
      this.altOpened.emit()
      this.altTimer = setTimeout(() => this.alt.set(false), ALT_IDLE_MS)
    }
  }

  /** A press of the second set: the idle time starts anew. */
  private altBusy() {
    clearTimeout(this.altTimer)
    this.altTimer = setTimeout(() => this.alt.set(false), ALT_IDLE_MS)
  }

  protected altDown(event: PointerEvent, which: 'shuffle' | 'repeat' | 'eject' | 'back') {
    event.stopPropagation()
    this.pressed.set(which === 'shuffle' ? 'prev' : which === 'repeat' ? 'next' : which === 'eject' ? 'down' : 'up')
    this.altBusy()
  }

  protected altUp(event: PointerEvent, which: 'shuffle' | 'repeat' | 'eject' | 'back') {
    event.stopPropagation()
    const wasPressed = this.pressed() !== null
    this.pressed.set(null)
    if (!wasPressed) return
    if (which === 'back') this.setAlt(false)
    else if (which === 'shuffle' && this.canShuffle()) this.shuffleToggle.emit()
    else if (which === 'repeat' && this.canRepeat()) this.repeatCycle.emit()
    else if (which === 'eject' && this.canEject()) this.eject.emit()
  }

  private origin = { x: 0, t: 0, moved: false }

  protected trackDown(event: PointerEvent, side: 'prev' | 'next') {
    event.stopPropagation()
    if (!this.canSkip() || this.live()) return
    const target = event.currentTarget as SVGElement
    target.setPointerCapture?.(event.pointerId)
    this.pad = target.ownerSVGElement ?? undefined
    this.origin = { x: event.clientX, t: Date.now(), moved: false }
    this.pressed.set(side)
    this.pulled.set({ side, units: 0, stage: 0 })
  }

  protected trackMove(event: PointerEvent, side: 'prev' | 'next') {
    const state = this.pulled()
    if (!state || state.side !== side) return
    const width = this.pad?.getBoundingClientRect().width ?? 240
    const control = width / 0.74
    const dx = (event.clientX - this.origin.x) * (side === 'next' ? 1 : -1)
    if (Math.abs(event.clientX - this.origin.x) > control * TAP_MOVE) this.origin.moved = true
    // the button follows its own side only; the other way it stays (a little give, so it does not feel stuck)
    const units = Math.max(-2, Math.min(MAX_PULL, (dx / (width / 100)) * 0.9)) * (side === 'next' ? 1 : -1)
    const stage = this.canSeek() ? MediaControlComponent.stageFor(dx, control) : 0
    if (stage !== state.stage) {
      this.pulled.set({ side, units, stage })
      this.startScrub(side === 'next' ? 1 : -1, stage)
    } else this.pulled.set({ side, units, stage })
  }

  protected trackUp(event: PointerEvent, side: 'prev' | 'next') {
    event.stopPropagation()
    const state = this.pulled()
    if (!state || state.side !== side) return
    const wasTap = state.stage === 0 && !this.origin.moved && Date.now() - this.origin.t < TAP_MS && event.type !== 'pointercancel'
    this.stopScrub()
    // (released: the button springs back - the style goes, the transition of the CSS does the rest)
    this.pulled.set(null)
    this.pressed.set(null)
    if (wasTap) (side === 'next' ? this.next : this.prev).emit()
  }

  private winding = false

  private startScrub(dir: -1 | 1, stage: ScrubStage) {
    this.stopScrub()
    if (stage === 0) return
    if (this.smooth()) {
      const mode = `${dir === 1 ? 'f' : 'b'}${stage === 1 ? 2 : 4}`
      this.winding = true
      this.wind.emit(mode)
      this.ticker = setInterval(() => this.wind.emit(mode), WIND_BEAT_MS)
      return
    }
    this.ticker = setInterval(() => this.scrub.emit(MediaControlComponent.scrubSeconds(dir, stage, SCRUB_TICK_MS)), SCRUB_TICK_MS)
  }

  private stopScrub() {
    clearInterval(this.ticker)
    this.ticker = undefined
    if (this.winding) {
      this.winding = false
      this.wind.emit('0')
    }
  }

  // ---------- the ring: choose a place ----------

  protected ringDown(event: PointerEvent) {
    if (!this.canSeek() || this.live()) return
    const root = event.currentTarget as HTMLElement
    const box = root.getBoundingClientRect()
    const dx = event.clientX - (box.left + box.width / 2)
    const dy = event.clientY - (box.top + box.height / 2)
    if (!MediaControlComponent.onRing(Math.hypot(dx, dy) / box.width)) return
    root.setPointerCapture?.(event.pointerId)
    this.chosen.set(MediaControlComponent.percentAt(dx, dy))
  }

  protected ringMove(event: PointerEvent) {
    if (this.chosen() === null) return
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
    this.chosen.set(MediaControlComponent.percentAt(event.clientX - (box.left + box.width / 2), event.clientY - (box.top + box.height / 2)))
  }

  protected ringUp(event: PointerEvent) {
    const value = this.chosen()
    if (value === null) return
    this.chosen.set(null)
    if (event.type !== 'pointercancel') this.seekTo.emit(Math.min(value, 99.5))
  }
}
