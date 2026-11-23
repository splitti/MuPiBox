// The equaliser window of Winamp (275 x 116): ON and AUTO buttons, the curve, PRESETS, the pre-amp and ten band sliders.
// Built from eqmain.bmp. The values are in dB (-12 .. +12); the service sends them to the player.

import { dragValue, el, ref, setSprite, Skin, sprite, WaButton } from './winamp-skin'

export const EQ_W = 275
export const EQ_H = 116

export const EQ_BANDS = ['60', '170', '310', '600', '1K', '3K', '6K', '12K', '14K', '16K']
export const EQ_FREQS = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000]

export interface EqState {
  on: boolean
  auto: boolean
  /** dB, -12 .. 12 */
  preamp: number
  /** ten bands in dB */
  bands: number[]
}

export const EQ_FLAT: EqState = { on: false, auto: false, preamp: 0, bands: new Array<number>(10).fill(0) }

// Winamp's own presets (preamp stays where it is); values in dB, cut to the sliders' range
export const EQ_PRESETS: { name: string; bands: number[] }[] = [
  { name: 'Classical', bands: [0, 0, 0, 0, 0, 0, -7, -7, -7, -9] },
  { name: 'Club', bands: [0, 0, 8, 5, 5, 5, 3, 0, 0, 0] },
  { name: 'Dance', bands: [9, 7, 2, 0, 0, -5, -7, -7, 0, 0] },
  { name: 'Flat', bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: 'Full Bass', bands: [-8, 9, 9, 5, 1, -4, -8, -10, -11, -11] },
  { name: 'Full Bass & Treble', bands: [7, 5, 0, -7, -4, 1, 8, 11, 12, 12] },
  { name: 'Full Treble', bands: [-9, -9, -9, -4, 2, 11, 12, 12, 12, 12] },
  { name: 'Laptop Speakers', bands: [4, 11, 5, -3, -2, 1, 4, 9, 12, 12] },
  { name: 'Large Hall', bands: [10, 10, 5, 5, 0, -4, -4, -4, 0, 0] },
  { name: 'Live', bands: [-4, 0, 4, 5, 5, 5, 4, 2, 2, 2] },
  { name: 'Party', bands: [7, 7, 0, 0, 0, 0, 0, 0, 7, 7] },
  { name: 'Pop', bands: [-2, 4, 7, 8, 5, 0, -2, -2, -2, -2] },
  { name: 'Reggae', bands: [0, 0, -1, -6, 0, -6, -4, 0, 0, 0] },
  { name: 'Rock', bands: [8, 4, -5, -8, -3, 4, 8, 11, 11, 11] },
  { name: 'Ska', bands: [-2, -4, -4, 0, 4, 5, 8, 9, 11, 9] },
  { name: 'Soft', bands: [4, 1, 0, -2, 0, 4, 8, 9, 11, 12] },
  { name: 'Soft Rock', bands: [4, 4, 2, 0, -4, -5, -3, 0, 2, 8] },
  { name: 'Techno', bands: [8, 5, 0, -5, -4, 0, 8, 9, 9, 8] },
]

/** What a preset holds: the pre-amp and the ten bands (dB). */
export interface EqValues {
  preamp: number
  bands: number[]
}

/**
 * What the PRESETS menu needs from outside (the service keeps them, the player stores them): the user's own presets,
 * the default, and the auto-load preset of the album that plays (AUTO loads it when the album starts).
 */
export interface EqPresetHost {
  user(): string[]
  values(kind: 'default' | 'user', name?: string): EqValues | undefined
  hasDefault(): boolean
  /** the album that plays ('' = none: nothing to save an auto-load preset for) */
  album(): string
  hasAuto(): boolean
  /** saves `now`; the name of what was made */
  save(kind: 'new' | 'default' | 'auto', now: EqValues): string
  remove(kind: 'user' | 'default' | 'auto', name?: string): void
}

const SLIDER_H = 63
const THUMB = 11
const clampDb = (v: number) => Math.max(-12, Math.min(12, Math.round(v * 2) / 2))

export class WinampEqView {
  readonly node: HTMLElement
  private state: EqState = { ...EQ_FLAT, bands: [...EQ_FLAT.bands] }
  private readonly sliders: { box: HTMLElement; thumb: HTMLElement }[] = []
  private readonly graph: HTMLCanvasElement
  private readonly preampLine: HTMLElement
  private readonly onBtn: WaButton
  private readonly autoBtn: WaButton
  private lineColours: string[] = []
  private popup: HTMLElement | undefined
  private readonly note: HTMLElement
  private status = ''
  private noteTimer: ReturnType<typeof setTimeout> | undefined
  private mode: 'load' | 'save' | 'delete' = 'load'

  constructor(
    private readonly skin: Skin,
    private readonly onChange: (s: EqState) => void,
    private readonly onClose: () => void,
    private readonly host: EqPresetHost,
  ) {
    const win = el('wa-win wa-eq', { width: `${EQ_W}px`, height: `${EQ_H}px` })
    this.node = win
    win.appendChild(sprite(skin, 'eqmain.bmp', [0, 0, EQ_W, EQ_H]))
    win.appendChild(sprite(skin, 'eqmain.bmp', [0, 134, EQ_W, 14]))
    const close = new WaButton(skin, { normal: ref('eqmain.bmp', 0, 116, 9, 9), pressed: ref('eqmain.bmp', 0, 125, 9, 9) }, [264, 3, 9, 9], () => onClose(), 'Close')
    win.appendChild(close.node)

    this.onBtn = new WaButton(
      skin,
      { normal: ref('eqmain.bmp', 10, 119, 26, 12), pressed: ref('eqmain.bmp', 128, 119, 26, 12), on: ref('eqmain.bmp', 69, 119, 26, 12), onPressed: ref('eqmain.bmp', 187, 119, 26, 12) },
      [14, 18, 26, 12],
      () => this.set({ on: !this.state.on }),
      'On / off',
    )
    this.autoBtn = new WaButton(
      skin,
      { normal: ref('eqmain.bmp', 36, 119, 32, 12), pressed: ref('eqmain.bmp', 154, 119, 32, 12), on: ref('eqmain.bmp', 94, 119, 32, 12), onPressed: ref('eqmain.bmp', 213, 119, 32, 12) },
      [39, 18, 32, 12],
      () => this.set({ auto: !this.state.auto }),
      'Auto',
    )
    const presets = new WaButton(skin, { normal: ref('eqmain.bmp', 224, 164, 44, 12), pressed: ref('eqmain.bmp', 224, 176, 44, 12) }, [217, 18, 44, 12], () => this.togglePresets(), 'Presets')
    win.append(this.onBtn.node, this.autoBtn.node, presets.node)

    // the curve
    win.appendChild(sprite(skin, 'eqmain.bmp', [0, 294, 113, 19], 86, 17))
    this.graph = document.createElement('canvas')
    this.graph.width = 113
    this.graph.height = 19
    Object.assign(this.graph.style, { left: '86px', top: '17px', width: '113px', height: '19px' })
    win.appendChild(this.graph)
    this.preampLine = sprite(skin, 'eqmain.bmp', [0, 314, 113, 1], 86, 17)
    win.appendChild(this.preampLine)
    this.loadLineColours()

    // sliders: pre-amp, then the ten bands
    const xs = [21, ...EQ_BANDS.map((_, i) => 78 + 15 * i)]
    xs.forEach((x, index) => {
      const box = sprite(skin, 'eqmain.bmp', [13, 164, 14, SLIDER_H], x, 38, 'wa-sprite wa-eq-slider')
      const thumb = sprite(skin, 'eqmain.bmp', [0, 164, THUMB, THUMB], 1, 0)
      box.appendChild(thumb)
      win.appendChild(box)
      dragValue(
        box,
        'y',
        (v) => {
          const db = clampDb(12 - v * 24)
          if (index === 0) this.set({ preamp: db })
          else {
            const bands = [...this.state.bands]
            bands[index - 1] = db
            this.set({ bands })
          }
        },
        THUMB / 2,
      )
      box.addEventListener('dblclick', () => (index === 0 ? this.set({ preamp: 0 }) : this.set({ bands: this.state.bands.map((b, i) => (i === index - 1 ? 0 : b)) })))
      this.sliders.push({ box, thumb })
    })
    this.note = el('wa-eq-note', { left: '86px', top: '17px', width: '113px', height: '19px' })
    this.note.style.display = 'none'
    win.appendChild(this.note)
    this.render()
  }

  get value(): EqState {
    return { ...this.state, bands: [...this.state.bands] }
  }

  /** From outside (loaded from the player): no change event. */
  setState(s: EqState): void {
    this.state = { ...s, bands: [...s.bands] }
    this.render()
  }

  private set(part: Partial<EqState>): void {
    this.state = { ...this.state, ...part }
    // moving a slider switches the equaliser on, as it does in Winamp when it was never used
    if (!('on' in part) && !this.state.on && ('preamp' in part || 'bands' in part)) this.state.on = true
    this.render()
    this.onChange(this.value)
  }

  /** A text over the curve that stays (the equaliser does nothing for what plays: Spotify, mplayer), '' = none. */
  setStatus(text: string): void {
    this.status = text
    this.showNote()
  }

  private flash(text: string): void {
    this.note.textContent = text
    this.note.style.display = ''
    clearTimeout(this.noteTimer)
    this.noteTimer = setTimeout(() => this.showNote(), 2500)
  }

  private showNote(): void {
    this.note.textContent = this.status
    this.note.style.display = this.status ? '' : 'none'
  }

  private closePresets(): void {
    this.popup?.remove()
    this.popup = undefined
  }

  private togglePresets(): void {
    if (this.popup) return this.closePresets()
    const colours = this.skin.meta.pledit
    const box = el('wa-eq-presets', { left: '6px', top: '31px', width: '263px', height: '80px' })
    box.style.background = colours.normalBg
    box.style.color = colours.normal
    box.style.setProperty('--wa-current', colours.current)
    box.style.setProperty('--wa-selected-bg', colours.selectedBg)
    this.popup = box
    this.node.appendChild(box)
    this.fillPresets()
  }

  /** The menu: LOAD / SAVE / DELETE as in Winamp's, one list at a time. */
  private fillPresets(): void {
    const box = this.popup
    if (!box) return
    box.replaceChildren()
    const tabs = el('wa-eq-tabs')
    for (const [mode, label] of [['load', 'LOAD'], ['save', 'SAVE'], ['delete', 'DELETE']] as const) {
      const tab = el(`wa-eq-tab${this.mode === mode ? ' wa-eq-on' : ''}`, {}, 'span')
      tab.textContent = label
      tab.addEventListener('click', () => {
        this.mode = mode
        this.fillPresets()
      })
      tabs.appendChild(tab)
    }
    const close = el('wa-eq-tab wa-eq-x', {}, 'span')
    close.textContent = 'X'
    close.addEventListener('click', () => this.closePresets())
    tabs.appendChild(close)
    const list = el('wa-eq-list')
    const row = (text: string, fn: () => void, off = false) => {
      // (a long name - an album's - gets the whole row and wraps instead of being cut off)
      const r = el(`wa-eq-preset${off ? ' wa-eq-off' : ''}${text.length > 18 ? ' wa-eq-wide' : ''}`)
      r.textContent = text
      if (!off) r.addEventListener('click', fn)
      list.appendChild(r)
    }
    const apply = (v: EqValues, keepPreamp = false) => {
      this.closePresets()
      this.set({ bands: [...v.bands], preamp: keepPreamp ? this.state.preamp : v.preamp, on: true })
    }
    const album = this.host.album()
    const now = (): EqValues => ({ preamp: this.state.preamp, bands: [...this.state.bands] })
    const done = (text: string) => {
      this.closePresets()
      this.flash(text)
    }
    if (this.mode === 'load') {
      row('Default', () => apply(this.host.values('default') ?? { preamp: 0, bands: new Array<number>(10).fill(0) }))
      for (const preset of EQ_PRESETS) row(preset.name, () => apply({ preamp: 0, bands: preset.bands }, true))
      for (const name of this.host.user()) row(`* ${name}`, () => apply(this.host.values('user', name) ?? now()))
    } else if (this.mode === 'save') {
      row('New preset', () => done(`SAVED: ${this.host.save('new', now())}`))
      row('As default', () => done(`SAVED: ${this.host.save('default', now())}`))
      row(album ? `For album: ${album}` : 'For this album (nothing plays)', () => done(`AUTO: ${this.host.save('auto', now())}`), !album)
    } else {
      for (const name of this.host.user()) row(`* ${name}`, () => (this.host.remove('user', name), done(`DELETED: ${name}`)))
      if (this.host.hasDefault()) row('Default', () => (this.host.remove('default'), done('DELETED: default')))
      if (album && this.host.hasAuto()) row(`Album: ${album}`, () => (this.host.remove('auto'), done('DELETED: auto-load')))
      if (!list.children.length) row('Nothing saved yet', () => undefined, true)
    }
    box.append(tabs, list)
  }

  private render(): void {
    this.onBtn.setOn(this.state.on)
    this.autoBtn.setOn(this.state.auto)
    const values = [this.state.preamp, ...this.state.bands]
    values.forEach((db, i) => {
      const t = (12 - db) / 24
      const frame = Math.round(27 * (1 - t))
      const s = this.sliders[i]
      setSprite(this.skin, s.box, 'eqmain.bmp', [13 + (frame % 14) * 15, 164 + Math.floor(frame / 14) * 65, 14, SLIDER_H])
      s.thumb.style.top = `${Math.round(t * (SLIDER_H - THUMB))}px`
    })
    this.drawGraph()
  }

  private loadLineColours(): void {
    // the colours of the curve are a one pixel wide strip of the bitmap (top = loudest)
    const img = new Image()
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = img.width
        c.height = img.height
        const ctx = c.getContext('2d')
        if (!ctx) return
        ctx.drawImage(img, 0, 0)
        const data = ctx.getImageData(115, 294, 1, 19).data
        this.lineColours = Array.from({ length: 19 }, (_, y) => `rgb(${data[y * 4]},${data[y * 4 + 1]},${data[y * 4 + 2]})`)
        this.drawGraph()
      } catch {
        // the plain line stays
      }
    }
    img.src = this.skin.url('eqmain.bmp')
  }

  private drawGraph(): void {
    const ctx = this.graph.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, 113, 19)
    const dbToY = (db: number) => Math.max(0, Math.min(18, Math.round(((12 - db) / 24) * 18)))
    // the pre-amp line
    this.preampLine.style.top = `${17 + dbToY(this.state.preamp)}px`
    // the curve through the ten bands (smooth between them)
    const points = this.state.bands.map((db, i) => ({ x: Math.round((i * 112) / 9), y: dbToY(db) }))
    let prev = points[0].y
    for (let x = 0; x < 113; x++) {
      const seg = Math.min(8, Math.floor((x / 112) * 9))
      const a = points[seg]
      const b = points[seg + 1]
      const f = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x)
      const y = Math.round(a.y + (b.y - a.y) * f)
      ctx.fillStyle = this.lineColours[y] ?? '#e0e0e0'
      // connect to the previous column so steep parts have no gaps
      const lo = Math.min(prev, y)
      const hi = Math.max(prev, y)
      ctx.fillRect(x, lo, 1, hi - lo + 1)
      prev = y
    }
  }
}
