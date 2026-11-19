import fs from 'node:fs'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { writeJsonSync } from './json-file'

/**
 * Several children share one box (5.1, "Mehrere Benutzer", docs/benutzer-5.1.md): each has their own library, play time,
 * quiet hours and taste settings. Switched on in the app (off by default: one user, everything as before).
 *
 * The box keeps the active user's things where they always were - data/library/ (data.json, resume.json, the offline
 * lists, the episodes' positions, what was heard ...), data/hidden-covers.json, data/playtime-checkpoint.json,
 * data/logs/play_log.jsonl and the user's part of mupiboxconfig.json - so every script, the player and the server go on
 * as before. The other users' things lie in data/users/<id>/ (library/, data/, logs/, config.json). A switch moves the
 * going user's things there and the coming user's into place: renames on the same card, nothing copied.
 *
 * A switch cut off (a power cut) is finished at the next start: data/users/users.json names it ("switching", with the
 * step it was at) before the first file moves. In the step "stash" everything in place belongs to the user who goes,
 * in the step "load" everything that is left in his folder belongs to him and what is in place to the one who comes -
 * either step can run again as often as it is started.
 */

export const USERS_VERSION = 1

/** What belongs to a user in the configuration: keys of "mupibox" (taste: theme, volumes, start page, clock ...) */
export const USER_KEYS = [
  'theme',
  'customTheme',
  'themeStage',
  'themeStageDefaultOn',
  'themeStageAutoRead',
  'startVolume',
  'maxVolume',
  'resume',
  'listviewTimer',
  'settingsAccessTimer',
  'hiddenCategories',
  'startCategory',
  'ttsLanguage',
  'onlineCovers',
  'onlineCoversSave',
  'clockStyle',
  'coverflowShowNames',
  'hideScrollbar',
  'scrollbarStyle',
  'episodeResume',
  'newEpisodes',
  'episodeProgress',
  'episodeResumeDays',
  'newEpisodeDays',
  'heardMarks',
  'outputPicker',
  'displayBrightness',
  'nightDim',
] as const
/** ... whole sections: the play time (with the tiles' limits), the quiet hours, the Spotify subscriptions (they belong to
 *  the library) */
export const USER_SECTIONS = ['playtimeLimit', 'quietHours', 'spotify_sync'] as const
/** ... and of "photos" the photo time and the albums he does not see on the display (the albums and their services are
 *  the box's) */
export const USER_PHOTO_KEYS = ['limitEnabled', 'limitMode', 'dailyMinutes', 'warnMinutes', 'idlePauseSeconds', 'today', 'hiddenAlbums'] as const

/** Files of a user in the box's data folder and in its logs (the library's folder: all of it, see liveLibraryEntries) */
export const USER_DATA_FILES = ['hidden-covers.json', 'playtime-checkpoint.json'] as const
export const USER_LOG_FILES = ['play_log.jsonl'] as const

// Every user has a colour - the display shows its dot in the header. As many users as colours.
export const USER_COLORS = ['#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FF7F00', '#808080'] as const
export const MAX_USERS = USER_COLORS.length
const NAME_MAX = 24
export const TRASH_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
export const MAIN_ID = 'main'
const ID = /^[a-z0-9]{2,12}$/
const TRASH_NAME = /^([a-z0-9]{2,12})\.(\d{10,16})$/

export type SwitchMode = 'free' | 'hold' | 'app'
export interface User {
  id: string
  name: string
  color: string
  /** the PIN asked at the display before switching to this user (B5): a hash, never the digits */
  pin?: string
}
export interface UsersFile {
  version: number
  /** several users switched on (the app's switch "Mehrere Benutzer"); off: only `current`, as a box without users */
  enabled: boolean
  current: string
  switchMode: SwitchMode
  users: User[]
  /** a switch under way (see above) */
  switching?: { from: string; to: string; step: 'stash' | 'load' }
}
export interface UserConfigPart {
  mupibox: Record<string, unknown>
  sections: Record<string, unknown>
  photos: Record<string, unknown>
}

const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T))
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** A name as people see it: one line, trimmed; null when it is not usable */
export function cleanName(raw: unknown): string | null {
  const name = String(raw ?? '')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: the control characters are what is taken out
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return name.length >= 1 && name.length <= NAME_MAX ? name : null
}

/** The user's part of the configuration, a copy */
export function userConfigOf(cfg: Record<string, unknown>): UserConfigPart {
  const mb = obj(cfg.mupibox)
  const photos = obj(cfg.photos)
  const part: UserConfigPart = { mupibox: {}, sections: {}, photos: {} }
  for (const k of USER_KEYS) if (k in mb) part.mupibox[k] = clone(mb[k])
  for (const s of USER_SECTIONS) if (s in cfg) part.sections[s] = clone(cfg[s])
  for (const k of USER_PHOTO_KEYS) if (k in photos) part.photos[k] = clone(photos[k])
  return part
}

/** The user's part put into the configuration: every key of the lists as the part has it - one it lacks is taken out
 *  (the box's default for that user). The rest of the configuration stays as it is. */
export function applyUserConfig(cfg: Record<string, unknown>, part: UserConfigPart): void {
  const mb = obj(cfg.mupibox)
  cfg.mupibox = mb
  for (const k of USER_KEYS) {
    if (k in obj(part.mupibox)) mb[k] = clone(part.mupibox[k])
    else delete mb[k]
  }
  for (const s of USER_SECTIONS) {
    if (s in obj(part.sections)) cfg[s] = clone(part.sections[s])
    else delete cfg[s]
  }
  if (cfg.photos !== undefined || Object.keys(obj(part.photos)).length > 0) {
    const photos = obj(cfg.photos)
    cfg.photos = photos
    for (const k of USER_PHOTO_KEYS) {
      if (k in obj(part.photos)) photos[k] = clone(part.photos[k])
      else delete photos[k]
    }
  }
}

export interface UserDirs {
  /** data/users */
  usersDir: string
  /** data/library */
  libraryDir: string
  /** data/ */
  dataDir: string
  /** data/logs */
  logsDir: string
}

export interface UserTrashEntry {
  /** the folder's name below trash/ ("<id>.<time>") */
  key: string
  id: string
  name: string
  color: string
  deletedAt: number
  /** his PIN's hash: he comes back with it (not to the app - users-routes names the fields it gives) */
  pin?: string
}

/**
 * The files of the users. Synchronous on purpose: a switch must not let another request of the server write between
 * two of its steps (the server's other writes of the library run under its lock, which the switch holds).
 */
export class UserFiles {
  constructor(readonly dirs: UserDirs) {}

  get file(): string {
    return path.join(this.dirs.usersDir, 'users.json')
  }
  get trashDir(): string {
    return path.join(this.dirs.usersDir, 'trash')
  }
  userDir(id: string): string {
    if (!ID.test(id)) throw new Error(`no user id: ${id}`)
    return path.join(this.dirs.usersDir, id)
  }

  /** users.json, or the start of it (one user, "Standard", off) */
  read(): UsersFile {
    let raw: Record<string, unknown> = {}
    try {
      raw = obj(JSON.parse(fs.readFileSync(this.file, 'utf8')))
    } catch {
      // none yet (or broken: the box goes on with one user, the others' folders stay where they are)
    }
    const users: User[] = []
    for (const u of Array.isArray(raw.users) ? raw.users : []) {
      const o = obj(u)
      const name = cleanName(o.name)
      if (typeof o.id !== 'string' || !ID.test(o.id) || !name || users.some((x) => x.id === o.id)) continue
      const color = typeof o.color === 'string' && (USER_COLORS as readonly string[]).includes(o.color) ? o.color : USER_COLORS[0]
      users.push({ id: o.id, name, color, ...(typeof o.pin === 'string' && o.pin ? { pin: o.pin } : {}) })
    }
    if (users.length === 0) users.push({ id: MAIN_ID, name: 'Standard', color: USER_COLORS[0] })
    const current = typeof raw.current === 'string' && users.some((u) => u.id === raw.current) ? raw.current : users[0].id
    const s = obj(raw.switching)
    const switching =
      typeof s.from === 'string' && typeof s.to === 'string' && ID.test(s.from) && ID.test(s.to) && (s.step === 'stash' || s.step === 'load')
        ? { from: s.from, to: s.to, step: s.step as 'stash' | 'load' }
        : undefined
    return {
      version: USERS_VERSION,
      enabled: raw.enabled === true,
      current,
      switchMode: raw.switchMode === 'hold' || raw.switchMode === 'app' ? raw.switchMode : 'free',
      users,
      ...(switching ? { switching } : {}),
    }
  }

  write(f: UsersFile): void {
    fs.mkdirSync(this.dirs.usersDir, { recursive: true })
    writeJsonSync(this.file, f, { spaces: 2 })
  }

  /** What of the library's folder belongs to the user in place: all but the links (config.json, monitor.json,
   *  active_data.json ... - the box's) and what is being written right now (temporary files, locks) */
  liveLibraryEntries(): string[] {
    let names: string[] = []
    try {
      names = fs.readdirSync(this.dirs.libraryDir)
    } catch {
      return []
    }
    return names.filter((n) => {
      if (/\.(tmp|lock|new)(\.|$)/.test(n)) return false
      try {
        return !fs.lstatSync(path.join(this.dirs.libraryDir, n)).isSymbolicLink()
      } catch {
        return false
      }
    })
  }

  // Where a file goes that stood in the way: one made in place after a switch was cut off (an empty data.json of a
  // script, a write of the server) - the copy in the user's folder is the one the switch moved, it wins.
  private aside(id: string, part: string, name: string): string {
    return path.join(this.userDir(id), `aside-${Date.now()}`, part, name)
  }

  /** The things in place go to the user's folder (`id`: the user who goes) */
  stash(id: string): void {
    const dir = this.userDir(id)
    const go = (from: string, to: string, part: string, name: string) => {
      if (!exists(from)) return
      moveOver(from, exists(to) ? this.aside(id, part, name) : to)
    }
    for (const n of this.liveLibraryEntries()) go(path.join(this.dirs.libraryDir, n), path.join(dir, 'library', n), 'library', n)
    for (const n of USER_DATA_FILES) go(path.join(this.dirs.dataDir, n), path.join(dir, 'data', n), 'data', n)
    for (const n of USER_LOG_FILES) go(path.join(this.dirs.logsDir, n), path.join(dir, 'logs', n), 'logs', n)
  }

  /** The user's folder comes into place (`id`: the user who comes). A library without data.json gets an empty one, and
   *  the lists the box points at (active_data.json) are there at once. */
  load(id: string): void {
    const dir = this.userDir(id)
    fs.mkdirSync(this.dirs.libraryDir, { recursive: true })
    const come = (from: string, to: string, part: string, name: string) => {
      if (!exists(from)) return
      if (exists(to)) moveOver(to, this.aside(id, part, name))
      moveOver(from, to)
    }
    for (const n of readdirOrNone(path.join(dir, 'library'))) {
      if (/\.(tmp|lock|new)(\.|$)/.test(n)) continue
      come(path.join(dir, 'library', n), path.join(this.dirs.libraryDir, n), 'library', n)
    }
    for (const n of USER_DATA_FILES) come(path.join(dir, 'data', n), path.join(this.dirs.dataDir, n), 'data', n)
    for (const n of USER_LOG_FILES) come(path.join(dir, 'logs', n), path.join(this.dirs.logsDir, n), 'logs', n)
    for (const n of ['data.json', 'resume.json']) {
      if (!fs.existsSync(path.join(this.dirs.libraryDir, n))) writeJsonSync(path.join(this.dirs.libraryDir, n), [], { ifChanged: false })
    }
    for (const n of ['offline_data.json', 'offline_resume.json']) {
      const f = path.join(this.dirs.libraryDir, n)
      if (fs.existsSync(f)) continue
      // (made properly by check_network.sh: dated long ago, as offline_lists.sh does it)
      writeJsonSync(f, [], { ifChanged: false })
      const old = new Date('2000-01-01T00:00:00Z')
      fs.utimesSync(f, old, old)
    }
  }

  /**
   * The entries of the own files (type "library": made from the media folders by the media scan, m3u_generator.sh - the
   * same for every user, but written into the library in place only): those of the going user, now in his folder,
   * matched against those of the coming one by what the scan knows them by (category, artist, title): his own stay as
   * they are (changed in the app, in his order), one whose folder is gone meanwhile goes, a new one comes at the end.
   * Numbered anew as the scan does (add_index.sh) - only when something changed.
   */
  carryOwnFiles(from: string): void {
    const going = path.join(this.userDir(from), 'library', 'data.json')
    const here = path.join(this.dirs.libraryDir, 'data.json')
    let theirs: unknown
    let mine: unknown
    try {
      theirs = JSON.parse(fs.readFileSync(going, 'utf8'))
      mine = JSON.parse(fs.readFileSync(here, 'utf8'))
    } catch {
      return // (one not readable: his list stays as it is)
    }
    if (!Array.isArray(theirs) || !Array.isArray(mine)) return
    const own = (e: unknown): e is Record<string, unknown> => !!e && typeof e === 'object' && (e as { type?: unknown }).type === 'library'
    const key = (e: Record<string, unknown>) => JSON.stringify([e.category ?? '', e.artist ?? '', e.title ?? ''])
    const now = new Map<string, Record<string, unknown>>()
    for (const e of theirs) if (own(e) && !now.has(key(e))) now.set(key(e), e)
    const kept = new Set<string>()
    const next: unknown[] = []
    for (const e of mine) {
      if (!own(e)) next.push(e)
      else if (now.has(key(e)) && !kept.has(key(e))) {
        kept.add(key(e))
        next.push(e)
      }
    }
    for (const [k, e] of now) if (!kept.has(k)) next.push(clone(e))
    if (next.length === mine.length && next.every((e, i) => e === mine[i])) return
    next.forEach((e, i) => {
      if (e && typeof e === 'object' && !Array.isArray(e)) (e as Record<string, unknown>).index = i
    })
    writeJsonSync(here, next, { spaces: 2, ifChanged: false })
  }

  /**
   * A switch cut off (users.json names it): its files finished - at the server's start, before anything reads the
   * library; the configuration and the player afterwards (Users.finishSwitchConfig). Returns the switch, or null.
   */
  recover(): { from: string; to: string } | null {
    const f = this.read()
    const s = f.switching
    if (!s) return null
    if (s.step === 'stash') {
      this.stash(s.from)
      f.switching = { ...s, step: 'load' }
      this.write(f)
    }
    this.load(s.to)
    return { from: s.from, to: s.to }
  }

  /** The user's part of the configuration, kept while he is not the one in place (null: none) */
  readConfigPart(id: string): UserConfigPart | null {
    try {
      const p = obj(JSON.parse(fs.readFileSync(path.join(this.userDir(id), 'config.json'), 'utf8')))
      return { mupibox: obj(p.mupibox), sections: obj(p.sections), photos: obj(p.photos) }
    } catch {
      return null
    }
  }
  writeConfigPart(id: string, part: UserConfigPart): void {
    fs.mkdirSync(this.userDir(id), { recursive: true })
    writeJsonSync(path.join(this.userDir(id), 'config.json'), part, { spaces: 2 })
  }
  dropConfigPart(id: string): void {
    fs.rmSync(path.join(this.userDir(id), 'config.json'), { force: true })
  }

  /** A new user's folder: the library of `from` copied (its folder, or the one in place for the user in place), or none */
  makeUser(id: string, from: string | null, currentId: string): void {
    const dir = this.userDir(id)
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(path.join(dir, 'library'), { recursive: true })
    if (!from) return
    const src = from === currentId ? this.dirs.libraryDir : path.join(this.userDir(from), 'library')
    const names = from === currentId ? this.liveLibraryEntries() : readdirOrNone(src).filter((n) => !/\.(tmp|lock|new)(\.|$)/.test(n))
    // (the library and the lists made of it - not the resume list, the positions, what was heard: the new user has
    // heard nothing yet)
    for (const n of names) {
      if (!['data.json', 'offline_data.json'].includes(n)) continue
      fs.copyFileSync(path.join(src, n), path.join(dir, 'library', n))
    }
  }

  /** Into the trash (a user not in place) */
  trash(user: User): string {
    const key = `${user.id}.${Date.now()}`
    const to = path.join(this.trashDir, key)
    fs.mkdirSync(this.trashDir, { recursive: true })
    const dir = this.userDir(user.id)
    if (fs.existsSync(dir)) fs.renameSync(dir, to)
    else fs.mkdirSync(to, { recursive: true })
    writeJsonSync(path.join(to, 'user.json'), { id: user.id, name: user.name, color: user.color, ...(user.pin ? { pin: user.pin } : {}) }, { ifChanged: false })
    return key
  }

  /**
   * Before a backup with users is restored (admin.ts): the things in place go to the folder of the user in place (as at a
   * switch), then every user's folder and the list aside into a folder of their own - the backup's come in their
   * place whole, nothing of before mixes in. Returns that folder (for finishRestore / undoRestore).
   */
  prepareRestore(): string {
    const f = this.read()
    this.stash(f.current)
    const held = path.join(this.dirs.usersDir, `.restore-${Date.now()}`)
    fs.mkdirSync(held, { recursive: true })
    for (const n of readdirOrNone(this.dirs.usersDir)) {
      if (n === 'trash' || n.startsWith('.')) continue
      fs.renameSync(path.join(this.dirs.usersDir, n), path.join(held, n))
    }
    return held
  }

  /**
   * The backup is in place (its list, its folders, the library of its user in place): the users of before that it does
   * not know go into the trash with their things (back from there for 30 days), the rest of before goes. The user in
   * place gets what a switch gives him (lists that are not there yet, empty).
   */
  finishRestore(held: string, before: UsersFile): void {
    const now = this.read()
    for (const u of before.users) {
      if (now.users.some((x) => x.id === u.id)) continue
      const dir = path.join(held, u.id)
      const key = `${u.id}.${Date.now()}`
      const to = path.join(this.trashDir, key)
      fs.mkdirSync(this.trashDir, { recursive: true })
      if (exists(dir)) fs.renameSync(dir, to)
      else fs.mkdirSync(to, { recursive: true })
      writeJsonSync(path.join(to, 'user.json'), { id: u.id, name: u.name, color: u.color, ...(u.pin ? { pin: u.pin } : {}) }, { ifChanged: false })
    }
    // (his things the backup holds in his folder - his lists, counts, play log - come in place as at a switch; his library
    // is in place already, from the backup under its own name)
    fs.rmSync(path.join(this.userDir(now.current), 'library', 'data.json'), { force: true })
    this.load(now.current)
    this.dropConfigPart(now.current)
    fs.rmSync(held, { recursive: true, force: true })
  }

  /** The restore failed: the folders and the list of before back, the things of the user in place back in place */
  undoRestore(held: string, before: UsersFile): void {
    for (const n of readdirOrNone(this.dirs.usersDir)) {
      if (n === 'trash' || n.startsWith('.')) continue
      fs.rmSync(path.join(this.dirs.usersDir, n), { recursive: true, force: true })
    }
    for (const n of readdirOrNone(held)) fs.renameSync(path.join(held, n), path.join(this.dirs.usersDir, n))
    fs.rmSync(held, { recursive: true, force: true })
    this.load(before.current)
  }

  trashList(): UserTrashEntry[] {
    const out: UserTrashEntry[] = []
    for (const key of readdirOrNone(this.trashDir)) {
      const m = TRASH_NAME.exec(key)
      if (!m) continue
      let meta: Record<string, unknown> = {}
      try {
        meta = obj(JSON.parse(fs.readFileSync(path.join(this.trashDir, key, 'user.json'), 'utf8')))
      } catch {
        // (no name: the id)
      }
      out.push({
        key,
        id: m[1],
        name: cleanName(meta.name) ?? m[1],
        // (only a colour of the list: the app puts it into a style)
        color: typeof meta.color === 'string' && (USER_COLORS as readonly string[]).includes(meta.color) ? meta.color : USER_COLORS[0],
        deletedAt: Number(m[2]),
        ...(typeof meta.pin === 'string' && meta.pin.startsWith('s1$') ? { pin: meta.pin } : {}),
      })
    }
    return out.sort((a, b) => b.deletedAt - a.deletedAt)
  }

  /** Back out of the trash, into the user's folder (the caller has checked that the id is free) */
  untrash(key: string, id: string): void {
    if (!TRASH_NAME.test(key)) throw new Error('not in the trash')
    const from = path.join(this.trashDir, key)
    const to = this.userDir(id)
    if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true })
    fs.renameSync(from, to)
    fs.rmSync(path.join(to, 'user.json'), { force: true })
  }

  /** What lay in the trash longer than TRASH_DAYS goes */
  purgeTrash(now = Date.now()): void {
    for (const t of this.trashList()) {
      if (now - t.deletedAt > TRASH_DAYS * DAY_MS) fs.rmSync(path.join(this.trashDir, t.key), { recursive: true, force: true })
    }
  }

  /** How many entries a user's library has (the app's list) */
  libraryCount(id: string, currentId: string): number {
    const f = id === currentId ? path.join(this.dirs.libraryDir, 'data.json') : path.join(this.userDir(id), 'library', 'data.json')
    try {
      const list = JSON.parse(fs.readFileSync(f, 'utf8')) as unknown
      return Array.isArray(list) ? list.length : 0
    } catch {
      return 0
    }
  }
}

function readdirOrNone(dir: string): string[] {
  try {
    return fs.readdirSync(dir)
  } catch {
    return []
  }
}

function exists(p: string): boolean {
  try {
    fs.lstatSync(p)
    return true
  } catch {
    return false
  }
}

// (the caller has made sure nothing stands at the target that is to be kept)
function moveOver(from: string, to: string): void {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  if (exists(to) && fs.lstatSync(to).isDirectory()) fs.rmSync(to, { recursive: true, force: true })
  fs.renameSync(from, to)
}

/** The lock of a user's library while he is not the one in place (the app edits it, users-routes / server.ts) - a switch
 *  takes the locks of both users, so no edit lands in a folder that is being moved */
export const userLibraryLock = (id: string): string => {
  if (!ID.test(id)) throw new Error(`no user id: ${id}`)
  return `/tmp/.data-${id}.lock`
}

/** A new id, not one of `taken` */
export function newUserId(taken: Iterable<string>): string {
  const used = new Set(taken)
  for (;;) {
    const id = `u${randomBytes(3).toString('hex')}`
    if (!used.has(id)) return id
  }
}

/** The first colour nobody has */
export function freeColor(users: User[]): string | null {
  return USER_COLORS.find((c) => !users.some((u) => u.color === c)) ?? null
}

/** What the server does around a switch (see server.ts): the switch itself only moves files and changes users.json */
export interface SwitchHooks {
  /** why the box cannot switch now (an update, a restore, a sync, a download), else null */
  busy(): Promise<string | null>
  /** the library's locks (data.json, resume.json) and those of the two users' libraries (userLibraryLock): taken,
   *  waiting up to `waitMs`; null when they stayed taken */
  lock(waitMs: number, users: string[]): Promise<(() => void) | null>
  /** playback stopped, the player's counts written and its writes held */
  playerHold(): Promise<void>
  /** the player reads the counts in place (after a switch, and after one that failed) */
  playerChanged(): Promise<void>
  readConfig(): Promise<Record<string, unknown>>
  updateConfig(mutate: (cfg: Record<string, unknown>) => void): Promise<void>
  /** what the server keeps of the user in place in memory forgotten (at once after the files moved, before anything
   *  of his is written into the coming user's files) */
  forgetCaches(): void
  /** the server reads what it keeps of the user in place again, the display loads anew */
  reload(): Promise<void>
}

export class UserSwitchError extends Error {
  constructor(
    readonly code: 'busy' | 'unknown_user' | 'disabled' | 'failed' | 'mode' | 'pin' | 'pin_locked',
    message: string,
  ) {
    super(message)
  }
}

// ---- the PIN of a user (asked at the display before switching to him; the app asks none - the parents' password) ------
/** 4 digits */
export const PIN_RE = /^\d{4}$/
/** Wrong PINs in a row at the display, then a pause */
export const PIN_TRIES = 5
export const PIN_PAUSE_MS = 60_000

/** A PIN as users.json keeps it: scrypt with a salt of its own, never the digits */
export function hashPin(pin: string): string {
  const salt = randomBytes(16)
  return `s1$${salt.toString('base64')}$${scryptSync(pin, salt, 32).toString('base64')}`
}

/** Whether `pin` is the one of the hash (false for anything that is not a hash of hashPin) */
export function pinMatches(stored: string | undefined, pin: string): boolean {
  const m = /^s1\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)$/.exec(stored ?? '')
  if (!m) return false
  const want = Buffer.from(m[2], 'base64')
  if (want.length !== 32) return false
  return timingSafeEqual(scryptSync(pin, Buffer.from(m[1], 'base64'), 32), want)
}

/** Waits for the hooks' busy() to clear, up to `waitMs`; the reason when it does not */
async function waitNotBusy(hooks: SwitchHooks, waitMs: number): Promise<string | null> {
  const until = Date.now() + waitMs
  for (;;) {
    const why = await hooks.busy()
    if (!why || Date.now() >= until) return why
    await new Promise((r) => setTimeout(r, 500))
  }
}

/**
 * The users of the box, one change at a time (a switch, a new user, one deleted ...).
 */
export class Users {
  private chain: Promise<unknown> = Promise.resolve()
  /** wrong PINs at the display in a row (for any user - one counter: trying the users one after the other is no way
   *  round it), and until when the display may try none */
  private pinFails = 0
  private pinPausedUntil = 0
  constructor(
    readonly files: UserFiles,
    private readonly hooks: SwitchHooks,
  ) {}

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const run = this.chain.then(work)
    this.chain = run.catch(() => undefined)
    return run
  }

  state(): UsersFile {
    return this.files.read()
  }

  /** `work` while no switch runs and none begins (a backup takes the users' folders, the library and the config in place
   *  as one moment) */
  hold<T>(work: () => Promise<T>): Promise<T> {
    return this.serial(work)
  }

  /** A switch cut off: finished (its files at the server's start already - again here, that does nothing) - in the
   *  order of all changes, so no switch begins on the files of one that is not finished */
  finishCutOff(): Promise<void> {
    return this.serial(() => this.finishOpen())
  }

  private async finishOpen(): Promise<void> {
    const done = this.files.recover()
    if (done) await this.finishSwitchConfig(done)
  }

  /** After the files of a switch are in place: the coming user's part of the configuration, users.json without it */
  private async finishSwitchConfig(done: { from: string; to: string }): Promise<void> {
    this.hooks.forgetCaches()
    const cfg = await this.hooks.readConfig()
    const kept = this.files.readConfigPart(done.from)
    // (the going user's part was kept before the files moved - if not, it is what is in place now)
    if (!kept) this.files.writeConfigPart(done.from, userConfigOf(cfg))
    const part = this.files.readConfigPart(done.to)
    if (part) await this.hooks.updateConfig((c) => applyUserConfig(c, part))
    this.files.dropConfigPart(done.to)
    const f = this.files.read()
    f.current = done.to
    delete f.switching
    this.files.write(f)
    await this.hooks.playerChanged().catch(() => undefined)
    await this.hooks.reload().catch(() => undefined)
  }

  /** Switch to user `id`: refused while the box is busy (an update, a restore, a sync ...) - after waiting a little */
  switchTo(id: string): Promise<UsersFile> {
    return this.serial(() => this.switchNow(id, false))
  }

  /**
   * A switch asked at the display: not with "only in the app", and to a user with a PIN only with his PIN - 5 wrong in a
   * row, then a minute's pause. Going back to the user in place needs none (nothing switches).
   */
  switchFromDisplay(id: string, pin: unknown): Promise<UsersFile> {
    return this.serial(async () => {
      const f = this.files.read()
      if (!f.enabled) throw new UserSwitchError('disabled', 'several users are switched off')
      if (f.switchMode === 'app') throw new UserSwitchError('mode', 'switching only in the app')
      const u = f.users.find((x) => x.id === id)
      if (!u) throw new UserSwitchError('unknown_user', 'no such user')
      if (u.pin && f.current !== id) {
        const left = this.pinPausedUntil - Date.now()
        if (left > 0) throw new UserSwitchError('pin_locked', String(Math.ceil(left / 1000)))
        if (typeof pin !== 'string' || !PIN_RE.test(pin) || !pinMatches(u.pin, pin)) {
          this.pinFails += 1
          if (this.pinFails >= PIN_TRIES) {
            this.pinFails = 0
            this.pinPausedUntil = Date.now() + PIN_PAUSE_MS
            throw new UserSwitchError('pin_locked', String(PIN_PAUSE_MS / 1000))
          }
          throw new UserSwitchError('pin', String(PIN_TRIES - this.pinFails))
        }
        this.pinFails = 0
      }
      return this.switchNow(id, false)
    })
  }

  /** Set (4 digits) or take away (null, '') the PIN of a user */
  setPin(id: string, pin: unknown): Promise<void> {
    return this.serial(async () => {
      const f = this.files.read()
      const u = f.users.find((x) => x.id === id)
      if (!u) throw new UserSwitchError('unknown_user', 'no such user')
      if (pin === null || pin === '') delete u.pin
      else if (typeof pin === 'string' && PIN_RE.test(pin)) u.pin = hashPin(pin)
      else throw new UserSwitchError('failed', 'pin')
      this.files.write(f)
    })
  }

  private async switchNow(id: string, evenWhenOff: boolean): Promise<UsersFile> {
    {
      // (a switch before not finished - its files half in place: finished first, else this one would take the
      // things of two users for one)
      if (this.files.read().switching) {
        try {
          await this.finishOpen()
        } catch (err) {
          throw new UserSwitchError('failed', `a switch before is not finished: ${(err as Error).message}`)
        }
      }
      if (this.files.dirs.libraryDir === this.files.dirs.dataDir) throw new UserSwitchError('failed', 'not on a development box')
      const f = this.files.read()
      if (!f.users.some((u) => u.id === id)) throw new UserSwitchError('unknown_user', 'no such user')
      if (!f.enabled && !evenWhenOff) throw new UserSwitchError('disabled', 'several users are switched off')
      if (f.current === id) return f
      const why = await waitNotBusy(this.hooks, 10_000)
      if (why) throw new UserSwitchError('busy', why)
      const release = await this.hooks.lock(10_000, [f.current, id])
      if (!release) throw new UserSwitchError('busy', 'the library is being written')
      const from = f.current
      let moved = false
      try {
        await this.hooks.playerHold()
        // the going user's part of the configuration first (no file has moved yet: a failure here changes nothing)
        this.files.writeConfigPart(from, userConfigOf(await this.hooks.readConfig()))
        f.switching = { from, to: id, step: 'stash' }
        this.files.write(f)
        moved = true
        this.files.stash(from)
        f.switching = { from, to: id, step: 'load' }
        this.files.write(f)
        this.files.load(id)
        try {
          this.files.carryOwnFiles(from)
        } catch (err) {
          console.warn(`${new Date().toLocaleString()}: [users] own files not taken over: ${(err as Error).message}`)
        }
        // (what the server keeps of the going user in memory: not written into the coming user's files from now on)
        this.hooks.forgetCaches()
        const part = this.files.readConfigPart(id)
        if (part) await this.hooks.updateConfig((c) => applyUserConfig(c, part))
        this.files.dropConfigPart(id)
        f.current = id
        delete f.switching
        this.files.write(f)
      } catch (err) {
        // Before any file moved: nothing changed. After: finished at once from where it stood (users.json names it) -
        // half of two users' things in place is no state to go on with. What cannot be finished now is finished at
        // the next start.
        if (!moved) {
          this.files.dropConfigPart(from)
          throw new UserSwitchError('failed', (err as Error).message)
        }
        try {
          await this.finishOpen()
        } catch (again) {
          throw new UserSwitchError('failed', `${(err as Error).message}; finished at the next start: ${(again as Error).message}`)
        }
      } finally {
        release()
        await this.hooks.playerChanged().catch(() => undefined)
      }
      await this.hooks.reload().catch(() => undefined)
      return this.files.read()
    }
  }

  /** A new user: an empty library (from: null) or a copy of another's; the settings of the user in place (a copy's:
   *  that user's), the subscriptions only with a copy - an empty library has none */
  add(nameRaw: unknown, from: string | null): Promise<User> {
    return this.serial(async () => {
      const f = this.files.read()
      const name = cleanName(nameRaw)
      if (!name) throw new UserSwitchError('failed', 'name')
      if (f.users.length >= MAX_USERS) throw new UserSwitchError('failed', 'too_many')
      if (from && !f.users.some((u) => u.id === from)) throw new UserSwitchError('unknown_user', 'no such user')
      const color = freeColor(f.users)
      if (!color) throw new UserSwitchError('failed', 'too_many')
      const id = newUserId([...f.users.map((u) => u.id), ...this.files.trashList().map((t) => t.id), 'trash'])
      this.files.makeUser(id, from, f.current)
      const base = from && from !== f.current ? this.files.readConfigPart(from) : userConfigOf(await this.hooks.readConfig())
      const part: UserConfigPart = clone(base ?? { mupibox: {}, sections: {}, photos: {} })
      if (!from) delete part.sections.spotify_sync
      this.files.writeConfigPart(id, part)
      const user: User = { id, name, color }
      f.users.push(user)
      this.files.write(f)
      return user
    })
  }

  /**
   * The configuration of a user changed without switching (the app's library: his Spotify subscriptions). `mutate`
   * gets a configuration with his sections in it - the one in place when he is the user in place (he may have become it
   * meanwhile), else his kept part.
   */
  updateUserConfig(id: string, mutate: (cfg: Record<string, unknown>) => void): Promise<void> {
    return this.serial(async () => {
      const f = this.files.read()
      if (!f.users.some((u) => u.id === id)) throw new UserSwitchError('unknown_user', 'no such user')
      if (f.current === id) return this.hooks.updateConfig(mutate)
      // (no kept part - missing or broken: written with only this change, the next switch to him took his theme,
      // volumes ... away - refused instead)
      const part = this.files.readConfigPart(id)
      if (!part) throw new UserSwitchError('failed', 'the settings of this user are not readable')
      const cfg: Record<string, unknown> = { ...clone(part.sections), mupibox: clone(part.mupibox), photos: clone(part.photos) }
      mutate(cfg)
      const next = userConfigOf(cfg)
      this.files.writeConfigPart(id, next)
    })
  }

  /** A user's configuration to read (his kept part, or the one in place for the user in place) */
  async userConfig(id: string): Promise<Record<string, unknown>> {
    const f = this.files.read()
    if (f.current === id) return this.hooks.readConfig()
    const part = this.files.readConfigPart(id) ?? { mupibox: {}, sections: {}, photos: {} }
    return { ...clone(part.sections), mupibox: clone(part.mupibox), photos: clone(part.photos) }
  }

  rename(id: string, nameRaw: unknown): Promise<void> {
    return this.serial(async () => {
      const f = this.files.read()
      const u = f.users.find((x) => x.id === id)
      const name = cleanName(nameRaw)
      if (!u) throw new UserSwitchError('unknown_user', 'no such user')
      if (!name) throw new UserSwitchError('failed', 'name')
      u.name = name
      this.files.write(f)
    })
  }

  setColor(id: string, color: string): Promise<void> {
    return this.serial(async () => {
      const f = this.files.read()
      const u = f.users.find((x) => x.id === id)
      if (!u) throw new UserSwitchError('unknown_user', 'no such user')
      if (!(USER_COLORS as readonly string[]).includes(color) || f.users.some((x) => x.id !== id && x.color === color)) {
        throw new UserSwitchError('failed', 'color')
      }
      u.color = color
      this.files.write(f)
    })
  }

  setSwitchMode(mode: unknown): Promise<void> {
    return this.serial(async () => {
      if (mode !== 'free' && mode !== 'hold' && mode !== 'app') throw new UserSwitchError('failed', 'mode')
      const f = this.files.read()
      f.switchMode = mode
      this.files.write(f)
    })
  }

  /** Into the trash: not the user in place */
  remove(id: string): Promise<void> {
    return this.serial(async () => {
      const f = this.files.read()
      const u = f.users.find((x) => x.id === id)
      if (!u) throw new UserSwitchError('unknown_user', 'no such user')
      if (f.current === id) throw new UserSwitchError('failed', 'current')
      this.files.trash(u)
      f.users = f.users.filter((x) => x.id !== id)
      this.files.write(f)
    })
  }

  /** Back out of the trash, with its colour or a free one */
  restore(key: string): Promise<User> {
    return this.serial(async () => {
      const f = this.files.read()
      const t = this.files.trashList().find((x) => x.key === key)
      if (!t) throw new UserSwitchError('unknown_user', 'not in the trash')
      if (f.users.length >= MAX_USERS) throw new UserSwitchError('failed', 'too_many')
      const id = f.users.some((u) => u.id === t.id) ? newUserId(f.users.map((u) => u.id)) : t.id
      const color = f.users.some((u) => u.color === t.color) ? freeColor(f.users) : t.color
      if (!color) throw new UserSwitchError('failed', 'too_many')
      this.files.untrash(key, id)
      const user: User = { id, name: t.name, color, ...(t.pin ? { pin: t.pin } : {}) }
      f.users.push(user)
      this.files.write(f)
      return user
    })
  }

  /** Several users on or off. Off with `keep`: the box switches to that user first and stays with him; the others rest
   *  with their things and are back when it is switched on again. */
  setEnabled(enabled: boolean, keep?: string): Promise<UsersFile> {
    return this.serial(async () => {
      if (!enabled && keep && keep !== this.files.read().current) await this.switchNow(keep, true)
      const f = this.files.read()
      f.enabled = enabled
      this.files.write(f)
      return f
    })
  }
}
