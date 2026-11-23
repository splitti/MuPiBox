// The playlist window of Winamp: the track list of what plays, between the frame of pledit.bmp. Taller than Winamp's
// own smallest playlist (the display has room for it): 275 x 137 skin pixels fill half of the 1920 x 480 display.

import { BitmapLabel, el, formatClock, ref, setSprite, Skin, sprite, WaButton } from './winamp-skin'

export const PL_W = 275
export const PL_H = 137
const TOP = 20
const BOTTOM = 38
const ROW = 10

export interface PlaylistEntry {
  position: number
  name: string
  artist?: string
  /** seconds, 0 / undefined when not known */
  duration?: number
}

export type SortMode = 'title' | 'file' | 'path' | 'reverse' | 'random'

/** What the menus of the playlist's buttons do to the queue of the box (the service talks to the player). */
export interface QueueApi {
  /** false for a list that is no queue of the box's files (Spotify, TIDAL, NAS, a CD): the menus then offer only select and info */
  editable(): boolean
  /** the rows (1-based positions) go / all but them go; true when it was done */
  remove(positions: number[]): Promise<boolean>
  crop(positions: number[]): Promise<boolean>
  /** nothing plays and nothing is queued */
  newList(): Promise<boolean>
  sort(mode: SortMode): Promise<boolean>
  /** the folders of the library below `path` ('' = the library), each with the number of audio files in it */
  dirs(path: string): Promise<{ path: string; audio: number; canAdd?: boolean; folders: { name: string; path: string; audio: number }[] } | null>
  /** the audio files of a folder at the end of the list (an empty list: they start playing) */
  addDir(path: string): Promise<boolean>
  info(position: number): Promise<{ file: string; folder: string; extension: string; size: number } | null>
  lists(): Promise<{ name: string; count: number }[]>
  /** the name it was saved under, or null */
  save(): Promise<string | null>
  load(name: string): Promise<boolean>
  deleteList(name: string): Promise<void>
}

interface MenuRow {
  text: string
  fn?: () => void
  off?: boolean
  extra?: { text: string; fn: () => void }
}

export interface PlaylistActions {
  /** a row was tapped */
  play(entry: PlaylistEntry): void
  /** the five round buttons of the bottom bar open menus; what they do to the list goes through here */
  queue: QueueApi
  /** a short message on the player (the menus' answers) */
  say(text: string): void
  /** the little transport buttons */
  prev(): void
  playPause(): void
  pause(): void
  stop(): void
  next(): void
  eject(): void
  close(): void
}

export class WinampPlaylistView {
  readonly node: HTMLElement
  private readonly list: HTMLElement
  private readonly handle: HTMLElement
  private readonly info: BitmapLabel
  private readonly time: BitmapLabel
  private entries: PlaylistEntry[] = []
  private current = -1
  private lastKey = ''
  /** the rows chosen with SEL or by a long press (positions); while there are any, a tap chooses a row instead of playing it */
  private readonly selected = new Set<number>()
  private popup: HTMLElement | undefined
  private longPressed = false

  constructor(
    private readonly skin: Skin,
    private readonly actions: PlaylistActions,
    /** the window's height in skin pixels: the window grows with the room (the list shows more rows) */
    private readonly h = PL_H,
  ) {
    const win = el('wa-win wa-pl', { width: `${PL_W}px`, height: `${this.h}px` })
    this.node = win
    // a tap in the window outside the menu closes it (the buttons open and close their own)
    win.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('.wa-hit')) this.closeMenu()
    })
    const colours = skin.meta.pledit
    win.style.background = colours.normalBg
    const f = 'pledit.bmp'
    // top bar: corners, the title in the middle, the rest filled with the tile
    win.appendChild(sprite(skin, f, [0, 0, 25, 20], 0, 0))
    win.appendChild(sprite(skin, f, [153, 0, 25, 20], PL_W - 25, 0))
    const titleX = Math.round((PL_W - 100) / 2)
    for (let x = 25; x < titleX; x += 25) win.appendChild(sprite(skin, f, [127, 0, Math.min(25, titleX - x), 20], x, 0))
    for (let x = titleX + 100; x < PL_W - 25; x += 25) win.appendChild(sprite(skin, f, [127, 0, Math.min(25, PL_W - 25 - x), 20], x, 0))
    win.appendChild(sprite(skin, f, [26, 0, 100, 20], titleX, 0))
    // sides
    for (let y = TOP; y < this.h - BOTTOM; y += 29) {
      const h = Math.min(29, this.h - BOTTOM - y)
      win.appendChild(sprite(skin, f, [0, 42, 12, h], 0, y))
      win.appendChild(sprite(skin, f, [31, 42, 20, h], PL_W - 20, y))
    }
    // the bottom bar (the round buttons and the little transport are part of the picture)
    win.appendChild(sprite(skin, f, [0, 72, 125, 38], 0, this.h - BOTTOM))
    win.appendChild(sprite(skin, f, [126, 72, 150, 38], PL_W - 150, this.h - BOTTOM))

    // the list: touch scrolls it, the handle at the right shows and moves the place
    this.list = el('wa-pl-list', { left: '12px', top: `${TOP}px`, width: `${PL_W - 12 - 20}px`, height: `${this.h - TOP - BOTTOM}px` })
    this.list.style.color = colours.normal
    this.list.style.fontFamily = `"${colours.font}", Arial, sans-serif`
    this.list.style.setProperty('--wa-row', `${ROW}px`)
    this.list.style.setProperty('--wa-current', colours.current)
    this.list.style.setProperty('--wa-selected-bg', colours.selectedBg)
    win.appendChild(this.list)
    this.handle = sprite(skin, f, [52, 53, 8, 18], PL_W - 15, TOP + 1, 'wa-sprite wa-pl-handle')
    win.appendChild(this.handle)
    this.list.addEventListener('scroll', () => this.placeHandle())
    this.dragHandle()

    // hit areas over the painted buttons of the bottom bar
    const y0 = this.h - BOTTOM
    const hit = (x: number, y: number, w: number, h: number, fn: () => void, title = '') => {
      const node = el('wa-btn wa-hit', { left: `${x}px`, top: `${y0 + y}px`, width: `${w}px`, height: `${h}px` })
      if (title) node.title = title
      node.addEventListener('click', fn)
      win.appendChild(node)
    }
    hit(13, 1, 24, 24, () => this.menuAdd(), 'Add')
    hit(42, 1, 24, 24, () => this.menuRem(), 'Remove')
    hit(72, 1, 24, 24, () => this.menuSel(), 'Select')
    hit(100, 1, 24, 24, () => this.menuMisc(), 'Misc')
    hit(232 - 1, 1, 24, 24, () => this.menuList(), 'List')
    // the six little transport buttons: previous, play, pause, stop, next, open
    const small: [number, () => void][] = [
      [134, () => actions.prev()],
      [144, () => actions.playPause()],
      [154, () => actions.pause()],
      [164, () => actions.stop()],
      [174, () => actions.next()],
      [184, () => actions.eject()],
    ]
    for (const [sx, fn] of small) hit(sx - 5 - 1, 17, 10, 11, fn)
    // close (the X of the title bar)
    const close = new WaButton(skin, { normal: ref(f, 167, 3, 9, 9) }, [PL_W - 11, 3, 9, 9], () => actions.close(), 'Close')
    close.node.style.backgroundImage = 'none'
    win.appendChild(close.node)

    // the little displays of the bottom bar: what the list holds, and the time
    this.info = new BitmapLabel(skin, [131 - 1, 8 + 100 - 38 + 0, 90, 6])
    this.info.node.style.top = `${y0 + 10}px`
    win.appendChild(this.info.node)
    this.time = new BitmapLabel(skin, [191 - 1, 0, 30, 6])
    this.time.node.style.top = `${y0 + 24}px`
    win.appendChild(this.time.node)
  }

  setEntries(entries: PlaylistEntry[], current: number): void {
    const key = JSON.stringify(entries.map((e) => [e.position, e.name, e.artist, e.duration]))
    if (key !== this.lastKey) {
      this.lastKey = key
      this.entries = entries
      this.list.replaceChildren()
      for (const entry of entries) {
        const row = el('wa-pl-row')
        row.dataset.position = String(entry.position)
        const name = el('wa-pl-name', {}, 'span')
        name.textContent = `${entry.position}. ${entry.artist ? `${entry.artist} - ` : ''}${entry.name}`
        row.appendChild(name)
        if (entry.duration) {
          const dur = el('wa-pl-dur', {}, 'span')
          dur.textContent = formatClock(entry.duration)
          row.appendChild(dur)
        }
        // a tap plays the track (or chooses it, with rows chosen); holding a row chooses it
        let pressTimer: ReturnType<typeof setTimeout> | undefined
        let from = { x: 0, y: 0 }
        const stopPress = () => clearTimeout(pressTimer)
        row.addEventListener('pointerdown', (e) => {
          this.longPressed = false
          stopPress()
          from = { x: e.clientX, y: e.clientY }
          pressTimer = setTimeout(() => {
            this.longPressed = true
            this.toggle(entry.position)
          }, 450)
        })
        // (a finger that scrolls the list chooses nothing; a few pixels of jitter do not count as moving)
        row.addEventListener('pointermove', (e) => {
          if (Math.hypot(e.clientX - from.x, e.clientY - from.y) > 8) stopPress()
        })
        for (const type of ['pointerup', 'pointercancel', 'pointerleave']) row.addEventListener(type, stopPress)
        row.addEventListener('click', () => this.rowTap(entry))
        this.list.appendChild(row)
      }
      if (entries.length === 0) {
        const hint = el('wa-pl-empty')
        hint.textContent = 'Nothing in the list - press the eject button to choose something'
        this.list.appendChild(hint)
      }
      for (const p of [...this.selected]) if (!entries.some((e) => e.position === p)) this.selected.delete(p)
      this.paintSelection()
    }
    this.setCurrent(current)
    this.placeHandle()
  }

  // ---------- selection ----------

  /** the number of the rows that are selected, for the buttons' menus (positions are the list's own, 1-based) */
  selection(): number[] {
    return [...this.selected].sort((a, b) => a - b)
  }

  private rowTap(entry: PlaylistEntry): void {
    if (this.longPressed) {
      this.longPressed = false
      return
    }
    // (with rows selected a tap chooses; else it plays, as it always did)
    if (this.selected.size > 0) this.toggle(entry.position)
    else this.actions.play(entry)
  }

  private toggle(position: number): void {
    if (this.selected.has(position)) this.selected.delete(position)
    else this.selected.add(position)
    this.paintSelection()
  }

  private selectWhere(pick: (position: number) => boolean): void {
    this.selected.clear()
    for (const e of this.entries) if (pick(e.position)) this.selected.add(e.position)
    this.paintSelection()
  }

  clearSelection(): void {
    if (this.selected.size === 0) return
    this.selected.clear()
    this.paintSelection()
  }

  private paintSelection(): void {
    for (const row of Array.from(this.list.children) as HTMLElement[]) row.classList.toggle('wa-pl-sel', this.selected.has(Number(row.dataset.position)))
    this.showTotals()
  }

  private showTotals(): void {
    const total = this.entries.reduce((s, e) => s + (e.duration ?? 0), 0)
    this.info.set(
      this.selected.size > 0
        ? `${this.selected.size}/${this.entries.length} SEL`
        : `${this.entries.length} TRACKS${total > 0 ? ` ${formatClock(total)}` : ''}`.toUpperCase(),
    )
  }

  // ---------- the menus of the five round buttons ----------

  closeMenu(): void {
    this.popup?.remove()
    this.popup = undefined
  }

  /**
   * A menu over the bottom bar, in the colours of the skin's playlist: rows of text; a row may carry a small button of its own
   * at the right (a saved list: delete). `title` is a line of its own above the rows.
   */
  private menu(rows: MenuRow[], title = ''): void {
    this.closeMenu()
    const colours = this.skin.meta.pledit
    const box = el('wa-pl-menu', { left: '14px', bottom: `${BOTTOM + 3}px`, width: `${Math.min(170, PL_W - 40)}px`, maxHeight: `${this.h - TOP - BOTTOM - 8}px` })
    box.style.background = colours.normalBg
    box.style.color = colours.normal
    box.style.setProperty('--wa-current', colours.current)
    box.style.setProperty('--wa-selected-bg', colours.selectedBg)
    if (title) {
      const head = el('wa-pl-menu-head', {}, 'div')
      head.textContent = title
      box.appendChild(head)
    }
    for (const r of rows) {
      const row = el(`wa-pl-menu-row${r.off ? ' wa-pl-off' : ''}`, {}, 'div')
      const text = el('wa-pl-menu-text', {}, 'span')
      text.textContent = r.text
      row.appendChild(text)
      if (r.off) {
        row.addEventListener('click', (e) => e.stopPropagation())
      } else {
        row.addEventListener('click', (e) => {
          e.stopPropagation()
          r.fn?.()
        })
      }
      if (r.extra) {
        const extra = el('wa-pl-menu-extra', {}, 'span')
        extra.textContent = r.extra.text
        extra.addEventListener('click', (e) => {
          e.stopPropagation()
          r.extra?.fn()
        })
        row.appendChild(extra)
      }
      box.appendChild(row)
    }
    // (a tap anywhere else in the window closes it)
    box.addEventListener('click', (e) => e.stopPropagation())
    this.popup = box
    this.node.appendChild(box)
  }

  private toggleMenu(open: () => void): void {
    if (this.popup) return this.closeMenu()
    open()
  }

  /** A row that does something, then closes the menu. */
  private act(text: string, fn: () => void | Promise<void>, off = false): MenuRow {
    return {
      text,
      off,
      fn: () => {
        this.closeMenu()
        void fn()
      },
    }
  }

  private readonly NOT_HERE = 'NOT FOR THIS LIST'

  /** ADD: a folder of the library, added at the end of the list */
  private menuAdd(): void {
    this.toggleMenu(() => this.browse(''))
  }

  private async browse(path: string): Promise<void> {
    const q = this.actions.queue
    const listing = await q.dirs(path)
    if (!listing) return this.menu([this.act('CAN NOT READ THE LIBRARY', () => undefined, true)], 'ADD DIR')
    const rows: MenuRow[] = []
    // (a folder of the NAS says nothing of how many files it holds: it is tried)
    if (listing.canAdd ?? listing.audio > 0) rows.push(this.act(`ADD THIS DIR${listing.audio > 0 ? ` (${listing.audio})` : ''}`, async () => this.said(await q.addDir(listing.path), 'ADDED', 'NOTHING ADDED')))
    if (path) rows.push({ text: '.. UP', fn: () => void this.browse(path.split('/').slice(0, -1).join('/')) })
    for (const f of listing.folders) rows.push({ text: `${f.name.toUpperCase()}${f.audio > 0 ? ` (${f.audio})` : ''}`, fn: () => void this.browse(f.path) })
    if (rows.length === 0) rows.push(this.act('EMPTY', () => undefined, true))
    this.menu(rows, `ADD DIR  /${listing.path.toUpperCase()}`)
  }

  private said(ok: boolean, yes: string, no: string): void {
    this.actions.say(ok ? yes : no)
  }

  /** REM: the selected rows go, or all but them (crop), or all */
  private menuRem(): void {
    this.toggleMenu(() => {
      const q = this.actions.queue
      const chosen = this.selection()
      const edit = q.editable()
      const need = !edit ? this.NOT_HERE : chosen.length === 0 ? 'SELECT TRACKS FIRST' : ''
      this.menu(
        [
          this.act(need ? `REM SEL  (${need})` : 'REM SEL', async () => this.afterEdit(await q.remove(chosen)), !!need),
          this.act(need ? `CROP  (${need})` : 'CROP', async () => this.afterEdit(await q.crop(chosen)), !!need),
          this.act(edit ? 'REM ALL' : `REM ALL  (${this.NOT_HERE})`, async () => this.afterEdit(await q.newList()), !edit),
        ],
        'REM',
      )
    })
  }

  /** SEL: all, none, inverted - a tap on a row then chooses it or not, instead of playing it */
  private menuSel(): void {
    this.toggleMenu(() =>
      this.menu(
        [
          this.act('SEL ALL', () => this.selectWhere(() => true)),
          this.act('SEL ZERO', () => this.clearSelection()),
          this.act('INV SEL', () => this.selectWhere((p) => !this.selected.has(p))),
          { text: 'TIP: HOLD A ROW TO SELECT IT', off: true },
        ],
        'SEL',
      ),
    )
  }

  /** MISC: what is known of a track, and the sorts of the list */
  private menuMisc(): void {
    this.toggleMenu(() => {
      const q = this.actions.queue
      const edit = q.editable()
      const sort = (text: string, mode: SortMode): MenuRow => this.act(edit ? text : `${text}  (${this.NOT_HERE})`, async () => this.afterEdit(await q.sort(mode)), !edit)
      this.menu(
        [
          this.act('FILE INFO', () => this.showInfo()),
          sort('SORT BY TITLE', 'title'),
          sort('SORT BY FILE NAME', 'file'),
          sort('SORT BY PATH', 'path'),
          sort('REVERSE LIST', 'reverse'),
          sort('RANDOMIZE LIST', 'random'),
        ],
        'MISC',
      )
    })
  }

  /** LIST OPTS: load a saved list, save this one, start a new one */
  private menuList(): void {
    this.toggleMenu(() => {
      const q = this.actions.queue
      const edit = q.editable()
      this.menu(
        [
          this.act('LOAD LIST', () => void this.showLists()),
          this.act(edit ? 'SAVE LIST' : `SAVE LIST  (${this.NOT_HERE})`, async () => {
            const name = await q.save()
            this.actions.say(name ? `SAVED: ${name.toUpperCase()}` : 'NOTHING SAVED')
          }, !edit),
          this.act(edit ? 'NEW LIST' : `NEW LIST  (${this.NOT_HERE})`, async () => this.afterEdit(await q.newList()), !edit),
        ],
        'LIST OPTS',
      )
    })
  }

  private async showLists(): Promise<void> {
    const q = this.actions.queue
    const lists = await q.lists()
    if (lists.length === 0) return this.menu([this.act('NO SAVED LISTS YET', () => undefined, true)], 'LOAD LIST')
    this.menu(
      lists.map((l) => ({
        text: `${l.name.toUpperCase()} (${l.count})`,
        fn: () => {
          this.closeMenu()
          void q.load(l.name).then((ok) => this.afterEdit(ok))
        },
        extra: {
          text: 'X',
          fn: () => void q.deleteList(l.name).then(() => this.showLists()),
        },
      })),
      'LOAD LIST',
    )
  }

  /** FILE INFO: of the one row that is selected, else the one that plays */
  private async showInfo(): Promise<void> {
    const chosen = this.selection()
    const position = chosen.length > 0 ? chosen[0] : this.current
    const entry = this.entries.find((e) => e.position === position)
    if (!entry) return this.menu([this.act('SELECT A TRACK FIRST', () => undefined, true)], 'FILE INFO')
    const info = await this.actions.queue.info(position)
    const line = (label: string, value: string) => ({ text: `${label} ${value}`.toUpperCase(), off: true })
    const rows: MenuRow[] = [line('NO.', `${entry.position} OF ${this.entries.length}`), line('NAME', entry.name)]
    if (entry.artist) rows.push(line('ARTIST', entry.artist))
    if (entry.duration) rows.push(line('TIME', formatClock(entry.duration)))
    if (info) {
      rows.push(line('FILE', info.file))
      if (info.folder) rows.push(line('DIR', info.folder))
      if (info.extension) rows.push(line('TYPE', info.extension))
      if (info.size > 0) rows.push(line('SIZE', info.size >= 1048576 ? `${(info.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(info.size / 1024))} KB`))
    }
    rows.push(this.act('OK', () => undefined))
    this.menu(rows, 'FILE INFO')
  }

  /** after an edit of the list: the rows chosen are gone or moved - nothing stays chosen */
  private afterEdit(ok: boolean): void {
    this.clearSelection()
    if (!ok) this.actions.say('NOT DONE')
  }

  /** The row that plays; `follow` scrolls it into view (a new track), not while the finger is on the list. */
  setCurrent(position: number, follow = true): void {
    if (position === this.current) return
    this.current = position
    for (const row of Array.from(this.list.children) as HTMLElement[]) {
      const on = Number(row.dataset.position) === position
      row.classList.toggle('wa-pl-on', on)
      if (on && follow) row.scrollIntoView({ block: 'nearest' })
    }
  }

  scrollToCurrent(): void {
    const row = this.list.querySelector<HTMLElement>('.wa-pl-on')
    row?.scrollIntoView({ block: 'center' })
  }

  setTime(text: string): void {
    this.time.set(text.toUpperCase())
  }

  private placeHandle(): void {
    const max = this.list.scrollHeight - this.list.clientHeight
    const track = this.h - TOP - BOTTOM - 18 - 2
    this.handle.style.visibility = max > 1 ? 'visible' : 'hidden'
    const f = max > 1 ? this.list.scrollTop / max : 0
    this.handle.style.top = `${TOP + 1 + Math.round(f * track)}px`
  }

  private dragHandle(): void {
    let start: { y: number; top: number } | undefined
    this.handle.style.pointerEvents = 'auto'
    this.handle.addEventListener('pointerdown', (e) => {
      start = { y: e.clientY, top: this.list.scrollTop }
      this.handle.setPointerCapture(e.pointerId)
      setSprite(this.skin, this.handle, 'pledit.bmp', [61, 53, 8, 18])
    })
    this.handle.addEventListener('pointermove', (e) => {
      if (!start) return
      const scale = this.handle.getBoundingClientRect().height / 18 || 1
      const track = this.h - TOP - BOTTOM - 18 - 2
      const max = this.list.scrollHeight - this.list.clientHeight
      this.list.scrollTop = start.top + ((e.clientY - start.y) / scale / track) * max
    })
    const end = () => {
      start = undefined
      setSprite(this.skin, this.handle, 'pledit.bmp', [52, 53, 8, 18])
    }
    this.handle.addEventListener('pointerup', end)
    this.handle.addEventListener('pointercancel', end)
  }
}

export const PLAYLIST_CSS = `
.wa-pl-list { position: absolute; overflow-y: auto; overflow-x: hidden; scrollbar-width: none; touch-action: pan-y; font-size: 8px; line-height: var(--wa-row); }
.wa-pl-list::-webkit-scrollbar { display: none; }
.wa-pl-row { display: flex; height: var(--wa-row); padding: 0 1px; white-space: nowrap; cursor: pointer; }
.wa-pl-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: clip; }
.wa-pl-dur { flex: 0 0 auto; padding-left: 4px; }
.wa-pl-row.wa-pl-on { color: var(--wa-current); background: var(--wa-selected-bg); }
.wa-pl-handle { cursor: pointer; }
.wa-pl-empty { padding: 20px 8px; opacity: .6; white-space: normal; text-align: center; }
.wa-pl-row.wa-pl-sel { color: var(--wa-current); background: color-mix(in srgb, var(--wa-selected-bg) 60%, transparent); }
.wa-pl-row.wa-pl-sel.wa-pl-on { background: var(--wa-selected-bg); }
.wa-pl-row { user-select: none; -webkit-user-select: none; }
.wa-pl-menu { position: absolute; z-index: 6; overflow-y: auto; overflow-x: hidden; scrollbar-width: none; border: 1px solid #888; font: 7px/10px Arial, sans-serif; touch-action: pan-y; box-sizing: border-box; }
.wa-pl-menu::-webkit-scrollbar { display: none; }
.wa-pl-menu-head { padding: 0 3px; border-bottom: 1px solid #888; text-align: center; color: var(--wa-current); }
.wa-pl-menu-row { display: flex; padding: 1px 3px; cursor: pointer; }
.wa-pl-menu-row:active { background: var(--wa-selected-bg); color: var(--wa-current); }
.wa-pl-menu-row.wa-pl-off { opacity: .55; cursor: default; }
.wa-pl-menu-row.wa-pl-off:active { background: none; color: inherit; }
.wa-pl-menu-text { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
.wa-pl-menu-extra { flex: 0 0 auto; padding: 0 3px; margin-left: 3px; border: 1px solid #888; }
`
