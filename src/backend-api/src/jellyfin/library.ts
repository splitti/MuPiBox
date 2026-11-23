// Jellyfin's library as the box offers it (docs/jellyfin-5.1.md): artists, albums, playlists and audiobooks of the
// libraries the parents chose. What can be an entry of the box's library:
//   album     a MusicAlbum (its tracks)
//   artist    a MusicArtist as a whole (all its albums, also later ones - listed like a folder)
//   playlist  an audio Playlist
//   book      an audiobook: a folder whose files are AudioBook items (one book in several files), or one AudioBook file
//             (an M4B with chapters) - Jellyfin has no item of its own for a book in several files

import { type JellyfinSession, requestJson } from './client'

type Item = Record<string, unknown>
export type EntryKind = 'album' | 'artist' | 'playlist' | 'book'

export interface BrowseItem {
  kind: EntryKind
  id: string
  name: string
  /** the artist (album, book) */
  artist: string
  /** YYYY-MM-DD in the box's time ('' unknown) */
  date: string
  year: number | null
  /** tracks (album, playlist, book) or albums (artist) */
  count: number | null
  /** whether Jellyfin has a picture for it */
  image: boolean
}

const ID = /^[0-9a-f]{32}$/i
export const isJellyfinId = (v: unknown): v is string => typeof v === 'string' && ID.test(v)

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * A date of Jellyfin as the day in the box's time: Jellyfin keeps a day as the midnight of the server's zone in UTC
 * ("2021-01-01" from a server in Germany comes as 2020-12-31T23:00:00Z)
 */
export function localDate(value: unknown): string {
  const t = Date.parse(str(value))
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  // (no date: Jellyfin sends 0001-01-01)
  if (d.getFullYear() < 1900) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const FIELDS = 'PremiereDate,ProductionYear,ChildCount,AlbumArtist,ImageTags,ParentId,SortName,MediaType'

function toBrowse(i: Item, kind: EntryKind): BrowseItem {
  const date = localDate(i.PremiereDate)
  const tags = (i.ImageTags ?? {}) as Record<string, unknown>
  return {
    kind,
    id: str(i.Id),
    name: str(i.Name),
    artist: str(i.AlbumArtist) || (Array.isArray(i.AlbumArtists) ? str((i.AlbumArtists[0] as Item | undefined)?.Name) : '') || (Array.isArray(i.Artists) ? str(i.Artists[0]) : ''),
    date,
    year: num(i.ProductionYear) ?? (date ? Number(date.slice(0, 4)) : null),
    count: num(i.ChildCount) ?? num(i.SongCount) ?? num(i.AlbumCount),
    image: typeof tags.Primary === 'string' || typeof i.AlbumPrimaryImageTag === 'string',
  }
}

const q = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') p.set(k, v)
  return p.toString()
}

// (at most this many of one list - a library with more is shown cut off, the app says so)
export const LIST_MAX = 20000
const PAGE = 1000

/** A list of Jellyfin, page by page (a big library has more than one answer holds) */
async function paged(s: JellyfinSession, path: string, params: Record<string, string | undefined>): Promise<Item[]> {
  const out: Item[] = []
  for (let start = 0; start < LIST_MAX; start += PAGE) {
    const body = await requestJson<{ Items?: unknown[]; TotalRecordCount?: unknown }>(s, s, `${path}?${q({ userId: s.userId, ...params, StartIndex: String(start), Limit: String(PAGE) })}`, {
      token: s.token,
      timeoutMs: 20000,
    })
    const page = (Array.isArray(body?.Items) ? body.Items : []).filter((x): x is Item => !!x && typeof x === 'object' && isJellyfinId((x as Item).Id))
    out.push(...page)
    const total = num(body?.TotalRecordCount) ?? 0
    if (page.length < PAGE || out.length >= total) break
  }
  return out
}

const items = (s: JellyfinSession, params: Record<string, string | undefined>) => paged(s, '/Items', params)

/** The album artists of a library (or of all the user's when no library is given), optionally only those a text finds */
export async function artists(s: JellyfinSession, library?: string, text?: string): Promise<BrowseItem[]> {
  const list = await paged(s, '/Artists/AlbumArtists', { parentId: library, searchTerm: text, Fields: 'ImageTags,ChildCount', SortBy: 'SortName' })
  return list.map((i) => ({ ...toBrowse(i, 'artist'), artist: str(i.Name) }))
}

/** The albums of an artist, newest first */
export async function artistAlbums(s: JellyfinSession, artistId: string): Promise<BrowseItem[]> {
  const list = await items(s, { AlbumArtistIds: artistId, IncludeItemTypes: 'MusicAlbum', Recursive: 'true', Fields: FIELDS, SortBy: 'PremiereDate,ProductionYear,SortName', SortOrder: 'Descending' })
  return list.map((i) => toBrowse(i, 'album'))
}

/** The albums of a library, by name */
export async function albums(s: JellyfinSession, library?: string): Promise<BrowseItem[]> {
  const list = await items(s, { parentId: library, IncludeItemTypes: 'MusicAlbum', Recursive: 'true', Fields: FIELDS, SortBy: 'SortName' })
  return list.map((i) => toBrowse(i, 'album'))
}

/** The audio playlists of the user */
export async function playlists(s: JellyfinSession): Promise<BrowseItem[]> {
  const list = await items(s, { IncludeItemTypes: 'Playlist', Recursive: 'true', MediaTypes: 'Audio', Fields: FIELDS, SortBy: 'SortName' })
  return list.filter((i) => !i.MediaType || i.MediaType === 'Audio').map((i) => toBrowse(i, 'playlist'))
}

// a file name of a part of a book: "01 …", "Kapitel 3", "Teil 2", "CD1 Track 04", "Part 7"
const PART_NAME = /^\s*(\d{1,4}\b|(kapitel|teil|part|chapter|track|cd|disc|folge)\s*\d)/i

/**
 * The audiobooks of a library, made from the AudioBook files (Jellyfin has no item for a book in several files):
 *  - the files of a folder with the same album tag are one book - the folder when all its files are that book (its name
 *    and picture), else the group's first file (several books in one folder, kept apart by their tags);
 *  - files of a folder without album tags are one book only when their names are numbered parts ("01 …", "Kapitel 3");
 *  - any other file (an M4B with chapters, loose files) is a book of its own.
 */
export async function books(s: JellyfinSession, library?: string): Promise<BrowseItem[]> {
  const files = await items(s, { parentId: library, IncludeItemTypes: 'AudioBook', Recursive: 'true', Fields: `${FIELDS},Album`, SortBy: 'ParentIndexNumber,IndexNumber,SortName' })
  const byFolder = new Map<string, Item[]>()
  for (const f of files) {
    const parent = str(f.ParentId)
    byFolder.set(parent, [...(byFolder.get(parent) ?? []), f])
  }
  const out: BrowseItem[] = []
  const folders: { id: string; files: Item[] }[] = []
  const fileBook = (first: Item, group: Item[]) => ({ ...toBrowse(first, 'book'), count: group.length, name: str(first.Album) || str(first.Name) })
  for (const [parent, list] of byFolder) {
    const groups = new Map<string, Item[]>()
    for (const f of list) groups.set(str(f.Album), [...(groups.get(str(f.Album)) ?? []), f])
    const untagged = groups.get('') ?? []
    const wholeFolder = isJellyfinId(parent) && list.length > 1 && (groups.size === 1 && (untagged.length === 0 || untagged.filter((f) => PART_NAME.test(str(f.Name))).length * 2 >= untagged.length))
    if (wholeFolder) {
      folders.push({ id: parent, files: list })
      continue
    }
    for (const [album, group] of groups) {
      if (album && group.length > 1) out.push(fileBook(group[0], group))
      else for (const f of group) out.push(fileBook(f, [f]))
    }
  }
  // (the folders' own names and pictures)
  for (let i = 0; i < folders.length; i += 100) {
    const chunk = folders.slice(i, i + 100)
    const named = await items(s, { Ids: chunk.map((f) => f.id).join(','), Fields: FIELDS })
    for (const f of named) {
      const group = chunk.find((c) => c.id === str(f.Id))?.files ?? []
      const first = toBrowse(group[0] ?? {}, 'book')
      out.push({ ...toBrowse(f, 'book'), count: group.length, artist: first.artist, date: first.date, year: first.year, name: str(group[0]?.Album) || str(f.Name) })
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }))
}

export interface Track {
  id: string
  name: string
  /** 1 = the first of the list */
  number: number
  /** seconds (0 unknown) */
  duration: number
  /** where Jellyfin's user left it, seconds (J5, shared progress) */
  position: number
  played: boolean
}

export interface TrackList {
  name: string
  artist: string
  tracks: Track[]
}

const TICKS = 10_000_000

function toTrack(i: Item, n: number): Track {
  const ud = (i.UserData ?? {}) as Item
  return {
    id: str(i.Id),
    name: str(i.Name),
    number: n,
    duration: Math.round((num(i.RunTimeTicks) ?? 0) / TICKS),
    position: Math.round((num(ud.PlaybackPositionTicks) ?? 0) / TICKS),
    played: ud.Played === true,
  }
}

/**
 * The tracks of an entry, in the order the box plays them: an album by disc and number, a playlist in its order, a book
 * (a folder of AudioBook files, or one file) by name. Null when Jellyfin does not know it (any more).
 */
export async function tracksOf(s: JellyfinSession, kind: EntryKind, id: string): Promise<TrackList | null> {
  const [self] = await items(s, { Ids: id, Fields: `${FIELDS},Album` })
  if (!self) return null
  let list: Item[]
  if (kind === 'playlist') {
    list = (await paged(s, `/Playlists/${id}/Items`, {})).filter((x) => x.MediaType === 'Audio')
  } else if (kind === 'book' && self.Type === 'AudioBook') {
    // (a book kept apart by its album tag in a folder of several: the files of the folder with that tag)
    const album = str(self.Album)
    list = album && isJellyfinId(self.ParentId) ? (await items(s, { parentId: str(self.ParentId), IncludeItemTypes: 'AudioBook', Fields: 'Album', SortBy: 'ParentIndexNumber,IndexNumber,SortName' })).filter((f) => str(f.Album) === album) : [self]
    if (!list.length) list = [self]
  }
  else {
    list = await items(s, { parentId: id, IncludeItemTypes: kind === 'book' ? 'AudioBook,Audio' : 'Audio', SortBy: 'ParentIndexNumber,IndexNumber,SortName', Recursive: kind === 'album' ? 'true' : 'false' })
  }
  const tracks = list.map((i, n) => toTrack(i, n + 1))
  const name = kind === 'book' ? str(list[0]?.Album) || str(self.Name) : str(self.Name)
  return { name, artist: toBrowse(self, kind).artist || str(list[0]?.AlbumArtist), tracks }
}

// a text in the name or the artist, without case and accents ("hoerbuch" does not find "Hörbuch", "horbuch" does)
const fold = (v: string) => v.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()
export const matches = (x: BrowseItem, text: string) => {
  const t = fold(text.trim())
  return fold(x.name).includes(t) || fold(x.artist).includes(t)
}

export interface SearchResult {
  artists: BrowseItem[]
  albums: BrowseItem[]
  playlists: BrowseItem[]
  books: BrowseItem[]
}

/** A search over the chosen libraries (all of the user's when none is chosen) */
export async function search(s: JellyfinSession, text: string, libraries: { id: string; type: string }[]): Promise<SearchResult> {
  const result: SearchResult = { artists: [], albums: [], playlists: [], books: [] }
  const scopes = libraries.length ? libraries : [{ id: '', type: 'all' }]
  for (const lib of scopes) {
    const parent = lib.id || undefined
    if (['music', 'mixed', 'all'].includes(lib.type)) {
      // (artists: only album artists - one only featured on a track has no album of its own to play)
      result.artists.push(...(await artists(s, parent, text)).slice(0, 60))
      const found = await items(s, { parentId: parent, searchTerm: text, IncludeItemTypes: 'MusicAlbum', Recursive: 'true', Fields: FIELDS })
      result.albums.push(...found.slice(0, 100).map((i) => toBrowse(i, 'album')))
    }
    // (Jellyfin's search looks at the files' names - "Kapitel 3" - not at the book's: the books are filtered here)
    if (['books', 'mixed', 'all'].includes(lib.type)) result.books.push(...(await books(s, parent)).filter((b) => matches(b, text)))
  }
  if (!libraries.length || libraries.some((l) => l.type === 'playlists')) result.playlists = (await playlists(s)).filter((p) => matches(p, text))
  const once = (l: BrowseItem[]) => l.filter((x, i) => l.findIndex((y) => y.kind === x.kind && y.id === x.id) === i)
  return { artists: once(result.artists), albums: once(result.albums), playlists: once(result.playlists), books: once(result.books) }
}
