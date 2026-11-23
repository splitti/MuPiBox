import { computed, effect, Injectable, inject, signal, untracked } from '@angular/core'
import type { Media } from './media'
import type { TileLimitStatus } from './playtime.model'
import { PlaytimeService } from './playtime.service'
import { resolveTileKey, tileKeyOf } from './tile-key'

/** A bar at the top (TileTimeNoticeComponent): a tile is over for today, or it has only a few minutes left */
export interface TileNotice {
  kind: 'over' | 'warn'
  name: string
  /** what was started of it (its cover), null: not known */
  media: Media | null
  minutes?: number
}

// the warning comes this many seconds before the tile's time is used up
const WARN_SECONDS = 5 * 60

/**
 * A day's limit per tile of the start page (5.1, "Kachel-Limit") on the display: which tiles are used up (a lock on
 * them, see HomePage), the tile of what plays with its minutes (the chip, PlaytimeChipComponent), the bars "<tile> ist
 * für heute vorbei" and "Noch 5 Minuten <tile>", and the player's refusals of a start (423 tile_limit_reached, see
 * PlayerService) - the player page leaves on them. The player counts and limits (spotify-control.js "Tile time"); this
 * reads its status from PlaytimeService.
 */
@Injectable({ providedIn: 'root' })
export class TileTimeService {
  private readonly playtime = inject(PlaytimeService)

  readonly tiles = computed(() => this.playtime.status().tiles ?? null)
  private readonly byKey = computed(() => new Map((this.tiles()?.list ?? []).map((t) => [t.key, t])))

  /** the limit of the tile a media belongs to (a folder: of the tile whose folder it is in); null: none */
  limitOf(media: Media | null | undefined): TileLimitStatus | null {
    const key = tileKeyOf(media ?? undefined)
    if (!key) return null
    const map = this.byKey()
    return map.get(resolveTileKey(key, map.keys())) ?? null
  }

  /** its tile is used up for today (a start of it would be refused) */
  blocked(media: Media | null | undefined): boolean {
    return this.limitOf(media)?.blocked === true
  }

  // The tiles with a limit and the used-up ones - a new value only when they change, not with every status (5 s): the
  // start page's list is not made anew each time
  private readonly lockText = computed(() => {
    const list = this.tiles()?.list ?? []
    return JSON.stringify([list.map((t) => t.key), list.filter((t) => t.blocked).map((t) => t.key)])
  })
  readonly locks = computed(() => {
    const [keys, blocked] = JSON.parse(this.lockText()) as [string[], string[]]
    return { keys, blocked: new Set(blocked) }
  })

  /** for a list of tiles: the lock of one of them (locks: this.locks(), read once for the list) */
  isLocked(media: Media | null | undefined, locks: { keys: string[]; blocked: Set<string> }): boolean {
    if (locks.blocked.size === 0) return false
    const key = tileKeyOf(media ?? undefined)
    return !!key && locks.blocked.has(resolveTileKey(key, locks.keys))
  }

  // what was started last, with the key of its tile: its cover for the chip and the bars
  private readonly started = signal<{ key: string; media: Media } | null>(null)

  /** a start sent to the player (PlayerService) */
  noteStart(media: Media): void {
    const key = tileKeyOf(media)
    if (key) this.started.set({ key: resolveTileKey(key, this.byKey().keys()), media })
  }

  // the tiles of the start page seen so far (HomePage, each tab as it is shown): the picture of a tile also when it was
  // started from the parents' app, Home Assistant or Telegram, or the display was loaded again since
  private readonly startTiles = signal<ReadonlyMap<string, Media>>(new Map())

  /** the tiles of a tab of the start page (their media as the start page has them) */
  noteStartPage(media: Media[]): void {
    const next = new Map(this.startTiles())
    let changed = false
    for (const m of media) {
      const key = tileKeyOf(m)
      if (key && next.get(key) !== m) {
        next.set(key, m)
        changed = true
      }
    }
    if (changed) this.startTiles.set(next)
  }

  // the tile's own media (its picture as on the start page), else what was started of it
  private startedMedia(key: string): Media | null {
    const tile = this.startTiles().get(key)
    if (tile) return tile
    const s = this.started()
    return s && s.key === key ? s.media : null
  }

  /** the tile of what plays now, when it has a limit that counts: its name, the seconds left and what was started of it */
  readonly current = computed(() => {
    const cur = this.tiles()?.current
    if (!cur || !cur.limited || cur.playing !== true || cur.state === 'blocked') return null
    const l = this.byKey().get(cur.key)
    if (!l || l.free || l.remainingSeconds === null) return null
    return { key: cur.key, name: l.name, remainingSeconds: l.remainingSeconds, media: this.startedMedia(cur.key) }
  })

  // The tile that is open on the screen (its list of albums, its player - MedialistPage, PlayerPage): the chip shows a
  // tile's minutes only there; on the start page and with another tile open its minutes would mislead (the listening
  // time's minutes there as before). A token per page: a page that goes takes only its own away.
  private readonly viewed = signal<{ token: number; media: Media | null } | null>(null)
  private viewTokens = 0

  view(media: Media | null | undefined): number {
    const token = ++this.viewTokens
    this.viewed.set({ token, media: media ?? null })
    return token
  }

  leave(token: number): void {
    if (token && this.viewed()?.token === token) this.viewed.set(null)
  }

  /** the tile open on the screen, when it has a limit of its own that counts today - also before anything of it plays:
   *  its name, the seconds left, its media (the chip) */
  readonly shown = computed(() => {
    const v = this.viewed()
    const key = tileKeyOf(v?.media ?? undefined)
    if (!v || !key) return null
    const map = this.byKey()
    const k = resolveTileKey(key, map.keys())
    const l = map.get(k)
    if (!l || l.free || l.remainingSeconds === null) return null
    return { key: k, name: l.name, remainingSeconds: l.remainingSeconds, media: this.startedMedia(k) ?? v.media }
  })

  readonly notice = signal<TileNotice | null>(null)
  private noticeTimer = 0

  private show(n: TileNotice): void {
    this.notice.set(n)
    window.clearTimeout(this.noticeTimer)
    this.noticeTimer = window.setTimeout(() => this.notice.set(null), n.kind === 'over' ? 5000 : 7000)
  }

  private nameOf(key: string | null, media: Media | null): string {
    const l = (key ? this.byKey().get(key) : null) ?? this.limitOf(media)
    return l?.name || media?.artist || media?.title || ''
  }

  /** "<tile> ist für heute vorbei": a tap on a used-up tile, a refused start, the end of what played of it */
  showOver(media: Media | null, key: string | null = null): void {
    // (the tile's own picture when its key is known - a refused album is shown by its tile, as everywhere)
    this.show({ kind: 'over', name: this.nameOf(key, media), media: (key ? this.startedMedia(key) : null) ?? media })
  }

  /** how often the player refused a start (423 tile_limit_reached): the player page leaves when it goes up */
  readonly refusals = signal(0)

  refused(key: string | null, media: Media | null): void {
    this.refusals.update((n) => n + 1)
    this.showOver(media, key)
  }

  constructor() {
    let prev: { key: string; state: string } | null = null
    let warnedKey: string | null = null
    effect(() => {
      const cur = this.tiles()?.current ?? null
      const c = this.current()
      untracked(() => {
        // the tile that played is used up now (stopped at once or after its track or album): said so
        if (cur && prev && prev.key === cur.key && prev.state !== 'blocked' && cur.state === 'blocked')
          this.showOver(null, cur.key)
        prev = cur ? { key: cur.key, state: cur.state } : null
        // a few minutes left: once per tile - again after more time was given, or the next day
        if (c && c.remainingSeconds > WARN_SECONDS) {
          if (warnedKey === c.key) warnedKey = null
        } else if (c && c.remainingSeconds > 0 && warnedKey !== c.key) {
          warnedKey = c.key
          this.show({ kind: 'warn', name: c.name, media: c.media, minutes: Math.ceil(c.remainingSeconds / 60) })
        }
      })
    })
  }
}
