// The main window of Winamp (275 x 116): title bar, clock, song title, analyser, volume and balance, position bar,
// the five transport buttons, eject, shuffle, repeat, EQ and playlist buttons. Built from the skin's bitmaps.

import { BitmapLabel, ref, setSprite, Skin, sprite, el, WaButton, WaClock, dragValue, formatClock } from './winamp-skin'

export const MAIN_W = 275
export const MAIN_H = 116

export type PlayState = 'play' | 'pause' | 'stop'

export interface MainState {
  title: string
  playState: PlayState
  /** seconds; durationSeconds 0 = unknown (a radio stream) */
  positionSeconds: number
  durationSeconds: number
  /** 0-100 */
  volume: number
  /** -100 (left) .. 100 (right) */
  balance: number
  shuffle: boolean
  /** shuffle works for Spotify only - the button then shows it is not available */
  shuffleAvailable: boolean
  repeat: boolean
  eqOpen: boolean
  playlistOpen: boolean
  /** kbit/s and kHz of the file when the player told them (0: not known - the boxes stay empty) */
  bitrate: number
  khz: number
  /** 0 unknown, 1 mono, 2 stereo */
  channels: number
}

export interface MainActions {
  prev(): void
  play(): void
  pause(): void
  stop(): void
  next(): void
  eject(): void
  seek(fraction: number): void
  setVolume(percent: number): void
  setBalance(balance: number): void
  toggleShuffle(): void
  toggleRepeat(): void
  toggleEq(): void
  togglePlaylist(): void
  menu(): void
  minimize(): void
  shade(): void
  close(): void
  /** O A I D V of the clutter bar */
  clutter(letter: 'O' | 'A' | 'I' | 'D' | 'V'): void
}

const DEFAULT_STATE: MainState = {
  title: '',
  playState: 'stop',
  positionSeconds: 0,
  durationSeconds: 0,
  volume: 50,
  balance: 0,
  shuffle: false,
  shuffleAvailable: true,
  repeat: false,
  eqOpen: false,
  playlistOpen: false,
  bitrate: 0,
  khz: 0,
  channels: 0,
}

export class WinampMainView {
  readonly node: HTMLElement
  private state: MainState = { ...DEFAULT_STATE }
  private readonly clock: WaClock
  private readonly titleLabel: BitmapLabel
  private readonly kbps: BitmapLabel
  private readonly khz: BitmapLabel
  private readonly indicator: HTMLElement
  private readonly stereo: HTMLElement
  private readonly mono: HTMLElement
  private readonly volume: HTMLElement
  private readonly balance: HTMLElement
  // the slider handles (a sprite of their own in the skin's volume and balance sheets - a skin may draw them into the frames)
  private readonly volThumb: HTMLElement | undefined
  private readonly balThumb: HTMLElement | undefined
  private readonly seekBar: HTMLElement
  private readonly knob: HTMLElement
  private readonly knobHidden: boolean
  private readonly buttons: Record<string, WaButton> = {}
  private remaining = false
  private seeking: number | null = null
  private volumeHold: { value: number; until: number } | null = null
  private readonly vis: HTMLCanvasElement
  private readonly bars = new Array<number>(19).fill(0)
  private readonly peaks = new Array<number>(19).fill(0)
  private visMode: 'bars' | 'scope' | 'off' = 'bars'
  private visTimer: ReturnType<typeof setInterval> | undefined

  constructor(
    private readonly skin: Skin,
    private readonly actions: MainActions,
  ) {
    const win = el('wa-win wa-main', { width: `${MAIN_W}px`, height: `${MAIN_H}px` })
    this.node = win
    win.appendChild(sprite(skin, 'main.bmp', [0, 0, MAIN_W, MAIN_H]))
    // the title bar (always the active one)
    win.appendChild(sprite(skin, 'titlebar.bmp', [27, 0, MAIN_W, 14]))

    const add = (key: string, b: WaButton) => {
      this.buttons[key] = b
      win.appendChild(b.node)
    }
    // menu (the logo at the left of the title bar) has no picture of its own: a hit area only
    const menu = el('wa-btn wa-hit', { left: '6px', top: '3px', width: '9px', height: '9px' })
    menu.addEventListener('click', () => actions.menu())
    win.appendChild(menu)
    add('minimize', new WaButton(skin, { normal: ref('titlebar.bmp', 9, 0, 9, 9), pressed: ref('titlebar.bmp', 9, 9, 9, 9) }, [244, 3, 9, 9], () => actions.minimize()))
    add('shade', new WaButton(skin, { normal: ref('titlebar.bmp', 0, 18, 9, 9), pressed: ref('titlebar.bmp', 9, 18, 9, 9) }, [254, 3, 9, 9], () => actions.shade()))
    add('close', new WaButton(skin, { normal: ref('titlebar.bmp', 18, 0, 9, 9), pressed: ref('titlebar.bmp', 18, 9, 9, 9) }, [264, 3, 9, 9], () => actions.close()))

    // transport
    const cb = (n: number, key: string, x: number, fn: () => void, title: string) =>
      add(key, new WaButton(skin, { normal: ref('cbuttons.bmp', n * 23, 0, 23, 18), pressed: ref('cbuttons.bmp', n * 23, 18, 23, 18) }, [x, 88, 23, 18], fn, title))
    cb(0, 'prev', 16, () => actions.prev(), 'Previous')
    cb(1, 'play', 39, () => actions.play(), 'Play')
    cb(2, 'pause', 62, () => actions.pause(), 'Pause')
    cb(3, 'stop', 85, () => actions.stop(), 'Stop')
    cb(4, 'next', 108, () => actions.next(), 'Next')
    add('eject', new WaButton(skin, { normal: ref('cbuttons.bmp', 114, 0, 22, 16), pressed: ref('cbuttons.bmp', 114, 16, 22, 16) }, [136, 89, 22, 16], () => actions.eject(), 'Open'))

    add(
      'shuffle',
      new WaButton(
        skin,
        { normal: ref('shufrep.bmp', 28, 0, 47, 15), pressed: ref('shufrep.bmp', 28, 15, 47, 15), on: ref('shufrep.bmp', 28, 30, 47, 15), onPressed: ref('shufrep.bmp', 28, 45, 47, 15) },
        [164, 89, 47, 15],
        () => actions.toggleShuffle(),
        'Shuffle',
      ),
    )
    add(
      'repeat',
      new WaButton(
        skin,
        { normal: ref('shufrep.bmp', 0, 0, 28, 15), pressed: ref('shufrep.bmp', 0, 15, 28, 15), on: ref('shufrep.bmp', 0, 30, 28, 15), onPressed: ref('shufrep.bmp', 0, 45, 28, 15) },
        [210, 89, 28, 15],
        () => actions.toggleRepeat(),
        'Repeat',
      ),
    )
    add(
      'eq',
      new WaButton(
        skin,
        { normal: ref('shufrep.bmp', 0, 61, 23, 12), pressed: ref('shufrep.bmp', 46, 61, 23, 12), on: ref('shufrep.bmp', 0, 73, 23, 12), onPressed: ref('shufrep.bmp', 46, 73, 23, 12) },
        [219, 58, 23, 12],
        () => actions.toggleEq(),
        'Equalizer',
      ),
    )
    add(
      'pl',
      new WaButton(
        skin,
        { normal: ref('shufrep.bmp', 23, 61, 23, 12), pressed: ref('shufrep.bmp', 69, 61, 23, 12), on: ref('shufrep.bmp', 23, 73, 23, 12), onPressed: ref('shufrep.bmp', 69, 73, 23, 12) },
        [242, 58, 23, 12],
        () => actions.togglePlaylist(),
        'Playlist',
      ),
    )

    // clutter bar: O A I D V (hit areas on the skin's own drawing)
    ;(
      [
        ['O', 25],
        ['A', 33],
        ['I', 40],
        ['D', 47],
        ['V', 55],
      ] as const
    ).forEach(([letter, y]) => {
      const hit = el('wa-btn wa-hit wa-clutter', { left: '10px', top: `${y}px`, width: '8px', height: '8px' })
      hit.addEventListener('click', () => {
        if (letter === 'V') this.cycleVis()
        actions.clutter(letter)
      })
      win.appendChild(hit)
    })

    // clock, play/pause indicator, song title, bit rate, sample rate, mono / stereo
    this.clock = new WaClock(skin)
    win.appendChild(this.clock.node)
    this.clock.node.addEventListener('click', () => {
      this.remaining = !this.remaining
      this.render()
    })
    this.indicator = sprite(skin, 'playpaus.bmp', [18, 0, 9, 9], 26, 28)
    win.appendChild(this.indicator)
    this.titleLabel = new BitmapLabel(skin, [111, 27, 154, 6], true)
    win.appendChild(this.titleLabel.node)
    this.kbps = new BitmapLabel(skin, [111, 43, 15, 6])
    this.khz = new BitmapLabel(skin, [156, 43, 10, 6])
    win.appendChild(this.kbps.node)
    win.appendChild(this.khz.node)
    this.mono = sprite(skin, 'monoster.bmp', [29, 12, 27, 12], 212, 41)
    this.stereo = sprite(skin, 'monoster.bmp', [0, 12, 29, 12], 239, 41)
    win.appendChild(this.mono)
    win.appendChild(this.stereo)

    // analyser
    this.vis = document.createElement('canvas')
    this.vis.width = 76
    this.vis.height = 16
    Object.assign(this.vis.style, { left: '24px', top: '43px', width: '76px', height: '16px' })
    win.appendChild(this.vis)

    // volume and balance: strips of 28 pictures of the knob / bar (the skin draws the thumb into them, or has one of its own)
    this.volume = sprite(skin, 'volume.bmp', [0, 0, 68, 13], 107, 57)
    this.volume.classList.add('wa-slot', 'wa-volume')
    win.appendChild(this.volume)
    dragValue(this.volume, 'x', (v) => this.onVolume(v), 6)
    this.balance = sprite(skin, 'balance.bmp', [9, 0, 38, 13], 177, 57)
    this.balance.classList.add('wa-slot', 'wa-balance')
    win.appendChild(this.balance)
    // the handle: 14 x 11 pixels at the bottom of the sheets (x 15 normal, x 0 pressed); the sheets of a skin without one are shorter
    const thumb = (file: string, slot: HTMLElement, x: number): HTMLElement | undefined => {
      if (skin.size(file).h < 433) return undefined
      const node = sprite(skin, file, [15, 422, 14, 11], x, 58)
      node.style.pointerEvents = 'none'
      win.appendChild(node)
      const press = (down: boolean) => setSprite(skin, node, file, [down ? 0 : 15, 422, 14, 11])
      slot.addEventListener('pointerdown', () => press(true))
      slot.addEventListener('pointerup', () => press(false))
      slot.addEventListener('pointercancel', () => press(false))
      return node
    }
    this.volThumb = thumb('volume.bmp', this.volume, 107)
    this.balThumb = thumb('balance.bmp', this.balance, 177)
    dragValue(this.balance, 'x', (v) => {
      // a click near the middle is "centred" (as Winamp snaps it)
      const b = Math.round((v * 2 - 1) * 100)
      actions.setBalance(Math.abs(b) < 12 ? 0 : b)
      this.state.balance = Math.abs(b) < 12 ? 0 : b
      this.render()
    }, 4)

    // position bar: the groove is part of main.bmp; the knob comes from posbar.bmp. A skin that hides the bar says so
    // with a 1 x 1 bitmap (it is drawn over the artwork there): the bar then still works, but shows no knob. Without
    // any posbar.bmp a plain bevelled box is the knob.
    this.seekBar = el('wa-slot wa-seek', { left: '16px', top: '72px', width: '248px', height: '10px' })
    const posbar = skin.size('posbar.bmp').w
    this.knobHidden = posbar > 0 && posbar < 100
    this.knob = el('wa-sprite wa-knob', { width: '29px', height: '10px', left: '0px', top: '0px' })
    if (posbar === 0) this.knob.classList.add('wa-knob-fallback')
    else if (!this.knobHidden) setSprite(skin, this.knob, 'posbar.bmp', [248, 0, 29, 10])
    this.seekBar.appendChild(this.knob)
    win.appendChild(this.seekBar)
    dragValue(
      this.seekBar,
      'x',
      (v, done) => {
        if (this.state.durationSeconds <= 0) return
        this.seeking = v
        if (done) {
          actions.seek(v)
          // (held where it was put until the player's report gets there)
          setTimeout(() => {
            this.seeking = null
            this.render()
          }, 2500)
        }
        this.render()
      },
      14,
    )

    this.visTimer = setInterval(() => this.drawVis(), 80)
    this.render()
  }

  destroy(): void {
    if (this.visTimer) clearInterval(this.visTimer)
  }

  private onVolume(v: number): void {
    const percent = Math.round(v * 100)
    this.volumeHold = { value: percent, until: Date.now() + 2500 }
    this.state.volume = percent
    this.actions.setVolume(percent)
    this.render()
  }

  private cycleVis(): void {
    this.visMode = this.visMode === 'bars' ? 'scope' : this.visMode === 'scope' ? 'off' : 'bars'
  }

  update(s: Partial<MainState>): void {
    const next = { ...this.state, ...s }
    // a volume the finger just set stays until the player reports it
    if (this.volumeHold) {
      if (Date.now() > this.volumeHold.until || Math.abs(next.volume - this.volumeHold.value) <= 2) this.volumeHold = null
      else next.volume = this.volumeHold.value
    }
    this.state = next
    this.render()
  }

  private render(): void {
    const s = this.state
    const showFraction = this.seeking ?? (s.durationSeconds > 0 ? Math.min(1, s.positionSeconds / s.durationSeconds) : 0)
    const shownSeconds = this.seeking !== null ? this.seeking * s.durationSeconds : s.positionSeconds
    const clockSeconds = this.remaining && s.durationSeconds > 0 ? s.durationSeconds - shownSeconds : shownSeconds
    this.clock.set(clockSeconds, this.remaining && s.durationSeconds > 0)

    const ind = { play: 0, pause: 9, stop: 18 }[s.playState]
    setSprite(this.skin, this.indicator, 'playpaus.bmp', [ind, 0, 9, 9])
    this.titleLabel.set((s.title || 'MuPiBox').toUpperCase())
    this.kbps.set(s.bitrate > 0 ? String(Math.min(999, Math.round(s.bitrate))).padStart(3, ' ') : '')
    this.khz.set(s.khz > 0 ? String(Math.min(99, Math.round(s.khz))) : '')
    // mono / stereo: lit (top half of the picture) when the file is, the other one dark; unknown = stereo
    const stereoOn = s.channels !== 1
    setSprite(this.skin, this.stereo, 'monoster.bmp', [0, stereoOn && s.playState !== 'stop' ? 0 : 12, 29, 12])
    setSprite(this.skin, this.mono, 'monoster.bmp', [29, s.channels === 1 && s.playState !== 'stop' ? 0 : 12, 27, 12])

    // volume: frame 0..27 of the strip, 15 pixels apart
    const vFrame = Math.round((Math.max(0, Math.min(100, s.volume)) / 100) * 27)
    setSprite(this.skin, this.volume, 'volume.bmp', [0, vFrame * 15, 68, 13])
    const bFrame = Math.round((Math.abs(s.balance) / 100) * 27)
    setSprite(this.skin, this.balance, 'balance.bmp', [9, bFrame * 15, 38, 13])
    // the handles: along the 68 pixels of the volume slider and the 38 of the balance slider (14 wide each)
    if (this.volThumb) this.volThumb.style.left = `${107 + Math.round((Math.max(0, Math.min(100, s.volume)) / 100) * (68 - 14))}px`
    if (this.balThumb) this.balThumb.style.left = `${177 + Math.round(((Math.max(-100, Math.min(100, s.balance)) + 100) / 200) * (38 - 14))}px`

    this.knob.style.left = `${Math.round(showFraction * (248 - 29))}px`
    this.knob.style.visibility = s.durationSeconds > 0 && !this.knobHidden ? 'visible' : 'hidden'

    this.buttons.shuffle.setOn(s.shuffle)
    this.buttons.shuffle.setEnabled(s.shuffleAvailable)
    this.buttons.repeat.setOn(s.repeat)
    this.buttons.eq.setOn(s.eqOpen)
    this.buttons.pl.setOn(s.playlistOpen)
  }

  /** The analyser: movement while it plays. It is decoration - the box's audio does not pass through the display. */
  private drawVis(): void {
    const ctx = this.vis.getContext('2d')
    if (!ctx) return
    const playing = this.state.playState === 'play'
    ctx.fillStyle = this.skin.vis(0)
    ctx.clearRect(0, 0, 76, 16)
    if (this.visMode === 'off') return
    const n = this.bars.length
    for (let i = 0; i < n; i++) {
      // a few humps that move, plus noise; falls back when paused
      const base = playing ? 3 + 9 * Math.abs(Math.sin(Date.now() / 420 + i * 0.55)) * (1 - i / (n * 1.4)) + Math.random() * 4 : 0
      this.bars[i] = Math.max(base, this.bars[i] - 1.2)
      if (this.bars[i] > this.peaks[i]) this.peaks[i] = this.bars[i]
      else this.peaks[i] = Math.max(0, this.peaks[i] - 0.35)
    }
    if (this.visMode === 'bars') {
      for (let i = 0; i < n; i++) {
        const h = Math.min(16, Math.round(this.bars[i]))
        for (let r = 0; r < h; r++) {
          const y = 15 - r
          ctx.fillStyle = this.skin.vis(2 + Math.min(15, Math.round((y / 15) * 15)))
          ctx.fillRect(i * 4, y, 3, 1)
        }
        if (this.peaks[i] >= 1) {
          ctx.fillStyle = this.skin.vis(23)
          ctx.fillRect(i * 4, 16 - Math.round(this.peaks[i]) - 1, 3, 1)
        }
      }
    } else {
      // oscilloscope
      ctx.fillStyle = this.skin.vis(18 + 2)
      for (let x = 0; x < 76; x++) {
        const y = playing ? 8 + Math.round(Math.sin(Date.now() / 90 + x * 0.35) * 4 * Math.sin(x * 0.07 + Date.now() / 900)) : 8
        ctx.fillRect(x, Math.max(0, Math.min(15, y)), 1, 1)
      }
    }
  }

  /** Total of the timer text, for the playlist's little display. */
  static clockText(seconds: number): string {
    return formatClock(seconds)
  }
}
