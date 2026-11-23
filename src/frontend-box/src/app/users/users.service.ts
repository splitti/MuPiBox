import { isPlatformBrowser } from '@angular/common'
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core'
import { environment } from 'src/environments/environment'
import { DisplayTextsService } from '../display-texts.service'
import type { Media } from '../media'

/** A user of the box as the display gets it (backend-api app-api/users-routes.ts, GET /api/users/state) */
export interface BoxUser {
  id: string
  name: string
  color: string
  /** the display asks his PIN before it switches to him */
  pin: boolean
}
export interface UsersState {
  enabled: boolean
  current: string
  switchMode: 'free' | 'hold' | 'app'
  users: BoxUser[]
}
/** What a switch at the display answered */
export type SwitchResult = { ok: true } | { error: 'pin'; left: number } | { error: 'pin_locked'; seconds: number } | { error: 'busy' | 'mode' | 'failed' }

/** How long a tile is held with "hold" */
export const HOLD_MS = 3000

/** The colour of a user (#RRGGBB); anything else grey */
export function colorOf(user: { color?: unknown } | null | undefined): string {
  return /^#[0-9a-fA-F]{6}$/.test(String(user?.color ?? '')) ? String(user?.color) : '#808080'
}

function stateOf(raw: unknown): UsersState | null {
  const r = raw as Partial<UsersState> | null
  if (!r || typeof r !== 'object' || !Array.isArray(r.users) || typeof r.current !== 'string') return null
  return {
    enabled: r.enabled === true,
    current: r.current,
    switchMode: r.switchMode === 'hold' || r.switchMode === 'app' ? r.switchMode : 'free',
    users: r.users
      .filter((u) => u && typeof u.id === 'string' && typeof u.name === 'string')
      .map((u) => ({ id: u.id, name: u.name, color: colorOf(u), pin: u.pin === true })),
  }
}

const same = (a: unknown, b: unknown) => typeof a === 'string' && a !== '' && a === b
const name = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '')
const sameName = (a: unknown, b: unknown) => name(a) !== '' && name(a) === name(b)

/** An entry that stands for more than one album: an artist, a series, a search (its albums are not in the list) */
function isContainer(e: Partial<Media>): boolean {
  if (e.type === 'spotify') return !e.id && !e.playlistid && !e.showid && !e.audiobookid && (!!e.artistid || !!e.query || Object.keys(e).some((k) => k.startsWith('range')))
  return e.tidalKind === 'artist' || e.jellyfinKind === 'artist' || e.audibleKind === 'series'
}

/**
 * Whether a medium an extension starts (an NFC card keeps its medium itself) is in a library - false only when that is
 * sure: a card wrongly refused is worse than one of another library that plays. So:
 * - own files and the NAS always (the display lists them from the folders, not from data.json; the files are the box's);
 * - a podcast by its feed or its channel's name (the NFC extension starts an episode: its id is the episode's file);
 * - else an entry of the same kind with its id, or one it can be part of: an artist, a series, a search with the same
 *   artist (or with none).
 */
export function mediaInLibrary(media: Partial<Media>, list: Partial<Media>[]): boolean {
  if (media.type === 'library' || media.type === 'nas') return true
  return list.some((e) => {
    if ((e.type ?? '') !== (media.type ?? '')) return false
    if (same(media.id, e.id)) return true
    switch (media.type) {
      case 'spotify':
        if (same(media.playlistid, e.playlistid) || same(media.showid, e.showid) || same(media.audiobookid, e.audiobookid) || same(media.artistid, e.artistid)) return true
        break
      case 'rss':
        return sameName(media.artist, e.title) || sameName(media.artist, e.artist)
    }
    return isContainer(e) && (!e.artist || sameName(media.artist, e.artist))
  })
}

/**
 * Several users (5.1) on the display: who is in place, the dot in his colour in the header (StatusComponent), the
 * overview behind it (UsersOverlayComponent) and the note when an extension starts something of another library.
 * Asked every 15 s on the box itself (a change in the app - a colour, users on - shows without a reload); a switch makes
 * the server load the display anew.
 */
@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly texts = inject(DisplayTextsService)
  readonly state = signal<UsersState | null>(null)
  /** several users on and at least two: the dot and the overview (with one the box is as one without users) */
  readonly apart = computed(() => {
    const s = this.state()
    return !!s && s.enabled && s.users.length >= 2
  })
  readonly current = computed(() => {
    const s = this.state()
    return s?.users.find((u) => u.id === s.current) ?? null
  })
  readonly overviewOpen = signal(false)
  /** a short note over the display (a medium of another library); null: none */
  readonly hint = signal<string | null>(null)
  private hintTimer = 0

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return
    void this.load()
    window.setInterval((): void => void this.load(), 15_000)
  }

  private loading: Promise<void> | null = null

  /** The state as the box has it now (one request at a time: a hanging one is not stacked) */
  load(): Promise<void> {
    this.loading ??= this.fetchState().finally(() => {
      this.loading = null
    })
    return this.loading
  }

  private async fetchState(): Promise<void> {
    try {
      const response = await fetch(`${environment.backend.apiUrl}/users/state`, { cache: 'no-store', signal: AbortSignal.timeout(5000) })
      if (!response.ok) return
      const s = stateOf(await response.json())
      if (s) this.state.set(s)
      if (!this.apart()) this.overviewOpen.set(false)
    } catch {
      // (keep what is known)
    }
  }

  async switchTo(id: string, pin?: string): Promise<SwitchResult> {
    try {
      const response = await fetch(`${environment.backend.apiUrl}/users/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify(pin === undefined ? { id } : { id, pin }),
        signal: AbortSignal.timeout(60_000),
      })
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
      if (response.ok) {
        const s = stateOf(body)
        if (s) this.state.set(s)
        return { ok: true }
      }
      if (body.error === 'pin') return { error: 'pin', left: Number(body.left) || 0 }
      if (body.error === 'pin_locked') return { error: 'pin_locked', seconds: Number(body.seconds) || 60 }
      // (the list changed meanwhile: loaded anew)
      if (body.error === 'unknown_user' || body.error === 'disabled') void this.load()
      return { error: body.error === 'busy' ? 'busy' : body.error === 'mode' ? 'mode' : 'failed' }
    } catch {
      return { error: 'failed' }
    }
  }

  showHint(text: string): void {
    window.clearTimeout(this.hintTimer)
    this.hint.set(text)
    this.hintTimer = window.setTimeout(() => this.hint.set(null), 5000)
  }

  /**
   * Whether an extension may start `media`: with several users only what is in the library of the user in place (an NFC
   * card belongs to the box - one of another library plays nothing, a note says so; it never switches the user).
   * Without the library at hand (no answer) it starts.
   */
  async allows(media: Media): Promise<boolean> {
    await this.load()
    if (!this.apart()) return true
    let list: Partial<Media>[]
    try {
      const response = await fetch(`${environment.backend.apiUrl}/data`, { cache: 'no-store', signal: AbortSignal.timeout(5000) })
      if (!response.ok) return true
      const body = await response.json()
      if (!Array.isArray(body)) return true
      list = body
    } catch {
      return true
    }
    if (mediaInLibrary(media, list)) return true
    this.showHint(this.texts.text('usersNotHere', { name: this.current()?.name ?? '' }))
    return false
  }
}
