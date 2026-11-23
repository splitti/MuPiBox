// The Winamp theme draws its windows from a classic Winamp 2.x skin (a .wsz, uploaded in the parents' app and unpacked
// by the backend into one folder of lower-case bitmaps plus a skin.json). Everything here is plain DOM - no Angular -
// so the windows can be tried out in a static page (tools/winamp-preview) and cost no change detection on the Pi.
//
// All coordinates are the skin's own pixels (the main window is 275 x 116); the shell scales a whole window up with one
// CSS transform and every sprite is drawn pixelated.

export interface SkinMeta {
  name: string
  /** changes with every upload: the bitmaps are fetched again */
  version: number
  /** file name (lower case) -> [width, height] of the bitmap */
  files: Record<string, [number, number]>
  /** viscolor.txt: 24 colours of the analyser (0 background, 1 dots, 2-17 bars from top to bottom, 18-22 scope, 23 peak) */
  viscolors: string[]
  /** pledit.txt */
  pledit: { normal: string; current: string; normalBg: string; selectedBg: string; font: string }
}

export const DEFAULT_PLEDIT = { normal: '#00FF00', current: '#FFFFFF', normalBg: '#000000', selectedBg: '#0000C6', font: 'Arial' }

export class Skin {
  constructor(
    readonly meta: SkinMeta,
    /** where the bitmaps are served from, no trailing slash */
    readonly base: string,
  ) {}

  has(file: string): boolean {
    return file in this.meta.files
  }

  size(file: string): { w: number; h: number } {
    const s = this.meta.files[file]
    return s ? { w: s[0], h: s[1] } : { w: 0, h: 0 }
  }

  url(file: string): string {
    return `${this.base}/${file}?v=${this.meta.version}`
  }

  /** The colour of the analyser's row (0-23), or a plain green when the skin has no viscolor.txt. */
  vis(index: number): string {
    return this.meta.viscolors[index] ?? '#00FF00'
  }
}

export type Rect = readonly [x: number, y: number, w: number, h: number]

type Style = Partial<CSSStyleDeclaration>

export function el(cls = '', style: Style = {}, tag = 'div'): HTMLElement {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  Object.assign(node.style, style)
  return node
}

/** A box showing the part `r` of the bitmap `file`, at (x, y) in its parent. Without the file it stays an empty box. */
export function sprite(skin: Skin, file: string, r: Rect, x = 0, y = 0, cls = 'wa-sprite'): HTMLElement {
  const node = el(cls, { left: `${x}px`, top: `${y}px`, width: `${r[2]}px`, height: `${r[3]}px` })
  setSprite(skin, node, file, r)
  return node
}

export function setSprite(skin: Skin, node: HTMLElement, file: string, r: Rect): void {
  if (!skin.has(file)) {
    node.style.backgroundImage = 'none'
    return
  }
  node.style.backgroundImage = `url("${skin.url(file)}")`
  node.style.backgroundPosition = `-${r[0]}px -${r[1]}px`
  // (the whole sheet at its own size: a sprite never shows the part next to it)
  const s = skin.size(file)
  node.style.backgroundSize = `${s.w}px ${s.h}px`
}

export interface SpriteRef {
  file: string
  r: Rect
}
export const ref = (file: string, x: number, y: number, w: number, h: number): SpriteRef => ({ file, r: [x, y, w, h] })

export interface ButtonSprites {
  normal: SpriteRef
  pressed?: SpriteRef
  /** a toggle that is on */
  on?: SpriteRef
  onPressed?: SpriteRef
}

/**
 * A button: the sprite of its state, a click when the pointer goes up on it. A toggle (`on` given) also shows its
 * state - set by setOn(). `title` is the tooltip a mouse would show (the kiosk has none, the preview has).
 */
export class WaButton {
  readonly node: HTMLElement
  private down = false
  private isOn = false
  private enabled = true

  constructor(
    private readonly skin: Skin,
    private readonly sprites: ButtonSprites,
    box: Rect,
    onClick: () => void,
    title = '',
  ) {
    this.node = el('wa-btn', { left: `${box[0]}px`, top: `${box[1]}px`, width: `${box[2]}px`, height: `${box[3]}px` })
    if (title) this.node.title = title
    this.node.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return
      this.down = true
      this.node.setPointerCapture(e.pointerId)
      this.draw()
    })
    const release = (e: PointerEvent, fire: boolean) => {
      if (!this.down) return
      this.down = false
      this.draw()
      if (fire) {
        const r = this.node.getBoundingClientRect()
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) onClick()
      }
    }
    this.node.addEventListener('pointerup', (e) => release(e, true))
    this.node.addEventListener('pointercancel', (e) => release(e, false))
    this.draw()
  }

  setOn(on: boolean): void {
    if (on === this.isOn) return
    this.isOn = on
    this.draw()
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    this.node.classList.toggle('wa-disabled', !enabled)
  }

  private draw(): void {
    const s = this.sprites
    const pick = this.isOn && s.on ? (this.down ? (s.onPressed ?? s.on) : s.on) : this.down ? (s.pressed ?? s.normal) : s.normal
    setSprite(this.skin, this.node, pick.file, pick.r)
  }
}

/** A slider on a strip of `length` skin pixels: pointer down/move sets a value 0..1 (along x, or along y from the top). */
export function dragValue(node: HTMLElement, axis: 'x' | 'y', onValue: (v: number, done: boolean) => void, margin = 0): void {
  const set = (e: PointerEvent, done: boolean) => {
    const r = node.getBoundingClientRect()
    const len = axis === 'x' ? r.width : r.height
    const pos = axis === 'x' ? e.clientX - r.left : e.clientY - r.top
    onValue(Math.max(0, Math.min(1, (pos - margin) / Math.max(1, len - 2 * margin))), done)
  }
  let active = false
  node.addEventListener('pointerdown', (e) => {
    active = true
    node.setPointerCapture(e.pointerId)
    set(e, false)
  })
  node.addEventListener('pointermove', (e) => {
    if (active) set(e, false)
  })
  node.addEventListener('pointerup', (e) => {
    if (!active) return
    active = false
    set(e, true)
  })
  node.addEventListener('pointercancel', () => {
    active = false
  })
}

// ---------- the skin's bitmap font (text.bmp: 5 x 6 pixels per letter) ----------
const FONT_ROWS = ['ABCDEFGHIJKLMNOPQRSTUVWXYZ"@', '0123456789….:()-\'!_+\\/[]^&%,=$#', 'ÅÖÄ?* ']
const GLYPH_W = 5
const GLYPH_H = 6

function glyph(ch: string): [number, number] | undefined {
  const c = ch.toUpperCase()
  for (let row = 0; row < FONT_ROWS.length; row++) {
    const i = FONT_ROWS[row].indexOf(c)
    if (i >= 0) return [i * GLYPH_W, row * GLYPH_H]
  }
  return undefined
}

/** Text in the skin's font: one box per letter; a letter the font does not have is a blank. */
export function bitmapText(skin: Skin, text: string, file = 'text.bmp'): HTMLElement {
  const row = el('wa-text-row')
  if (!skin.has(file)) {
    row.textContent = text
    row.classList.add('wa-text-plain')
    return row
  }
  for (const ch of text.replace(/[äöå]/g, (c) => c.toUpperCase()).replace(/ß/g, 'ss')) {
    const at = glyph(ch)
    const g = el('wa-glyph', { width: `${GLYPH_W}px`, height: `${GLYPH_H}px` })
    if (at) setSprite(skin, g, file, [at[0], at[1], GLYPH_W, GLYPH_H])
    row.appendChild(g)
  }
  row.style.width = `${text.length * GLYPH_W}px`
  return row
}

/** A window of fixed size that shows a text in the skin's font; a text longer than it scrolls (a marquee). */
export class BitmapLabel {
  readonly node: HTMLElement
  private text = ''

  constructor(
    private readonly skin: Skin,
    box: Rect,
    private readonly scroll = false,
  ) {
    this.node = el('wa-label', { left: `${box[0]}px`, top: `${box[1]}px`, width: `${box[2]}px`, height: `${box[3]}px` })
  }

  set(text: string): void {
    if (text === this.text) return
    this.text = text
    this.node.replaceChildren()
    const width = this.node.clientWidth || Number.parseInt(this.node.style.width, 10)
    const px = text.length * GLYPH_W
    if (this.scroll && px > width) {
      // the text twice, with a gap, moving left by one text length: the loop has no jump
      const gap = '   ***   '
      const track = el('wa-marquee')
      track.appendChild(bitmapText(this.skin, text + gap))
      track.appendChild(bitmapText(this.skin, text + gap))
      const cycle = (text.length + gap.length) * GLYPH_W
      track.style.setProperty('--wa-cycle', `-${cycle}px`)
      // about 25 skin pixels a second
      track.style.animationDuration = `${Math.max(4, cycle / 25)}s`
      this.node.appendChild(track)
    } else {
      this.node.appendChild(bitmapText(this.skin, text))
    }
  }
}

/** The 5-digit clock of the main window: digits from numbers.bmp (9 x 13 each), "-" for the time that is left. */
export class WaClock {
  readonly node: HTMLElement
  private readonly digits: HTMLElement[] = []
  private readonly minus: HTMLElement
  private last = ''
  /** numbers.bmp, or nums_ex.bmp (0-9, a blank and a "-" of its own) for a skin that only has that one, as Winamp does */
  private readonly file: string

  constructor(private readonly skin: Skin) {
    this.node = el('wa-clock', { left: '36px', top: '26px', width: '59px', height: '13px' })
    this.file = !skin.has('numbers.bmp') && skin.has('nums_ex.bmp') ? 'nums_ex.bmp' : 'numbers.bmp'
    // the minus is a piece of the middle bar of the "2" (numbers.bmp has no sign of its own); nums_ex.bmp has one
    this.minus = this.file === 'nums_ex.bmp' ? sprite(skin, this.file, [99, 0, 9, 13], 0, 0) : sprite(skin, this.file, [20, 6, 5, 1], 1, 6)
    this.node.appendChild(this.minus)
    for (const x of [12, 24, 42, 54]) {
      const d = sprite(skin, this.file, [0, 0, 9, 13], x, 0)
      this.digits.push(d)
      this.node.appendChild(d)
    }
  }

  set(seconds: number, remaining: boolean): void {
    const total = Math.max(0, Math.floor(seconds))
    const mm = Math.min(99, Math.floor(total / 60))
    const ss = total % 60
    const key = `${remaining ? '-' : ''}${mm}:${ss}`
    if (key === this.last) return
    this.last = key
    this.minus.style.visibility = remaining ? 'visible' : 'hidden'
    const values = [Math.floor(mm / 10), mm % 10, Math.floor(ss / 10), ss % 10]
    values.forEach((v, i) => setSprite(this.skin, this.digits[i], this.file, [v * 9, 0, 9, 13]))
  }
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/** Styles every window needs; added once to the page. */
export const WINAMP_BASE_CSS = `
.wa-win { position: absolute; overflow: hidden; transform-origin: 0 0; image-rendering: pixelated; user-select: none; -webkit-user-select: none; touch-action: none; }
.wa-win * { box-sizing: border-box; }
.wa-win .wa-sprite, .wa-win .wa-btn, .wa-win .wa-label, .wa-win .wa-clock, .wa-win .wa-glyph, .wa-win .wa-slot { position: absolute; background-repeat: no-repeat; image-rendering: pixelated; }
.wa-win .wa-btn { cursor: pointer; -webkit-tap-highlight-color: transparent; }
.wa-win .wa-btn.wa-disabled { opacity: .45; }
.wa-win .wa-label { overflow: hidden; }
.wa-win .wa-text-row { position: relative; height: 6px; white-space: nowrap; }
.wa-win .wa-text-row .wa-glyph { position: relative; display: inline-block; vertical-align: top; }
.wa-win .wa-text-plain { font: 6px/6px monospace; color: #0f0; }
.wa-win .wa-marquee { position: absolute; left: 0; top: 0; display: flex; white-space: nowrap; animation: wa-scroll linear infinite; }
@keyframes wa-scroll { from { transform: translateX(0); } to { transform: translateX(var(--wa-cycle)); } }
.wa-win canvas { position: absolute; image-rendering: pixelated; }
`
