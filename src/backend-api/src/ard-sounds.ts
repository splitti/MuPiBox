/**
 * ARD Sounds (ARD Audiothek): radio plays, stories and children's podcasts of the ARD stations, free and without an
 * account. Its public GraphQL interface (api.ardaudiothek.de) gives the shows, their episodes and plain MP3 files.
 *
 * A show is kept in the library as a podcast (type 'rss') whose id is "ard:<show id>": the feed code (server.ts,
 * refreshRssCache) builds the episode list from here instead of fetching an RSS feed, in the same shape - so the
 * display, the player, resume, the covers and the index treat it like any podcast. (Many shows have an RSS feed too,
 * but many children's plays have none; this way all of them work alike.)
 *
 * Only this one address is asked, with a time limit; the ids are checked before they go into a query.
 */

const ENDPOINT = 'https://api.ardaudiothek.de/graphql'
// The ARD's own category of children's shows
const KIDS_CATEGORY = '42914714'
// Shows that are for children but carry no category (many do): by their name
const KIDS_TITLE = /(kind|kids|märchen|gute-nacht|sandmännchen|betthupferl|ohrenbär|kakadu|figarino|checker|mikado|tigerente)/i
// The newest ones are enough for the list on the box (Betthupferl has almost a thousand)
const MAX_EPISODES = 300
const PICTURE_WIDTH = 600

export const ARD_PREFIX = 'ard:'

export interface ArdShow {
  id: string
  title: string
  synopsis: string
  station: string
  episodes: number
  image: string
  kids: boolean
  lastAdded: string | null
}

export interface ArdEpisode {
  id: string
  title: string
  date: string | null
  duration: number
  url: string
  image: string
  /**
   * Where the ARD lets the episode be downloaded (allowDownload with a downloadUrl), or null: then it may only be
   * streamed - never kept on the card from its stream address instead
   */
  download: string | null
  /** When it leaves the ARD's offer (the end of its time online, endDate), or null */
  until: string | null
}

export const isArdFeed = (id: unknown): id is string => typeof id === 'string' && id.startsWith(ARD_PREFIX)

/** The show id (digits) of "ard:<id>" or of the id itself, or null */
export function ardShowId(value: string): string | null {
  const id = value.startsWith(ARD_PREFIX) ? value.slice(ARD_PREFIX.length) : value
  return /^\d{1,15}$/.test(id) ? id : null
}

/**
 * The show id behind a link to it on ardsounds.de / ardaudiothek.de (…/sendung/<name>/<id or urn:ard:show:…>/), or
 * null when it is no such link or the ARD does not know it
 */
export async function ardShowIdFromUrl(url: string): Promise<string | null> {
  const m = /^https:\/\/(?:www\.)?(?:ardsounds|ardaudiothek)\.de\/sendung\/[^/?#]+\/([^/?#]+)/i.exec(url.trim())
  if (!m) return null
  const part = decodeURIComponent(m[1])
  if (ardShowId(part)) return part
  if (!/^urn:ard:show:[0-9a-f]{8,32}$/.test(part)) return null
  const data = await query<{ programSetByCoreId?: { id?: string } | null }>(
    'query($core: String!) { programSetByCoreId(coreId: $core) { id } }',
    { core: part },
  )
  return ardShowId(data.programSetByCoreId?.id ?? '')
}

// The ARD's picture addresses leave the width open ("…?w={width}&…")
const picture = (url: unknown): string => (typeof url === 'string' ? url.replace('{width}', String(PICTURE_WIDTH)) : '')

async function query<T>(text: string, variables: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'MuPiBox' },
    body: JSON.stringify({ query: text, variables }),
    signal: AbortSignal.timeout(10000),
  })
  const body = (await r.json().catch(() => ({}))) as { data?: T; errors?: { message?: string }[] }
  if (!r.ok || !body.data) throw new Error(`ARD Sounds answered ${r.status}: ${body.errors?.[0]?.message ?? 'no data'}`)
  return body.data
}

interface RawShow {
  id?: string
  title?: string
  synopsis?: string | null
  numberOfElements?: number | null
  editorialCategoryId?: string | null
  lastItemAdded?: string | null
  image?: { url?: string } | null
  publicationService?: { title?: string } | null
}

const SHOW_FIELDS = 'id title synopsis numberOfElements editorialCategoryId lastItemAdded image { url } publicationService { title }'

function show(raw: RawShow): ArdShow | null {
  if (!raw.id || !raw.title) return null
  return {
    id: raw.id,
    title: raw.title.trim(),
    synopsis: (raw.synopsis ?? '').trim(),
    station: raw.publicationService?.title ?? '',
    episodes: raw.numberOfElements ?? 0,
    image: picture(raw.image?.url),
    kids: raw.editorialCategoryId === KIDS_CATEGORY || KIDS_TITLE.test(raw.title),
    lastAdded: raw.lastItemAdded ?? null,
  }
}

/** Shows for a search term; for children only: the ARD's children's category, or a name that says so */
export async function ardSearch(term: string, kidsOnly: boolean): Promise<ArdShow[]> {
  const data = await query<{ search?: { programSets?: { nodes?: RawShow[] } } }>(
    `query($q: String, $limit: Int) { search(query: $q, limit: $limit) { programSets { nodes { ${SHOW_FIELDS} } } } }`,
    { q: term, limit: 40 },
  )
  const shows = (data.search?.programSets?.nodes ?? []).map(show).filter((s): s is ArdShow => !!s && s.episodes > 0)
  return kidsOnly ? shows.filter((s) => s.kids) : shows
}

/** The ARD's children's shows, the ones with the newest episodes first */
export async function ardKidsShows(): Promise<ArdShow[]> {
  const data = await query<{ programSets?: { nodes?: RawShow[] } }>(
    `query($cat: String) { programSets(first: 100, filter: { editorialCategoryId: { equalTo: $cat }, numberOfElements: { greaterThan: 0 } }) { nodes { ${SHOW_FIELDS} } } }`,
    { cat: KIDS_CATEGORY },
  )
  return (data.programSets?.nodes ?? [])
    .map(show)
    .filter((s): s is ArdShow => !!s)
    .sort((a, b) => (b.lastAdded ?? '').localeCompare(a.lastAdded ?? ''))
}

interface RawItem {
  id?: string
  title?: string
  publishDate?: string | null
  duration?: number | null
  image?: { url?: string } | null
  endDate?: string | null
  audios?: { url?: string; mimeType?: string; downloadUrl?: string | null; allowDownload?: boolean | null }[] | null
}

/** A show and its newest episodes (at most `first`), or null when the ARD does not know it */
export async function ardShow(id: string, first = MAX_EPISODES): Promise<{ show: ArdShow; episodes: ArdEpisode[] } | null> {
  const showId = ardShowId(id)
  if (!showId) return null
  const data = await query<{ programSet?: (RawShow & { items?: { nodes?: RawItem[] } }) | null }>(
    `query($id: ID!, $first: Int) { programSet(id: $id) { ${SHOW_FIELDS}
      items(first: $first, orderBy: PUBLISH_DATE_DESC, filter: { isPublished: { equalTo: true } }) {
        nodes { id title publishDate endDate duration image { url } audios { url mimeType downloadUrl allowDownload } } } } }`,
    { id: showId, first: Math.max(1, Math.min(first, MAX_EPISODES)) },
  )
  const raw = data.programSet
  const s = raw ? show(raw) : null
  if (!raw || !s) return null
  const episodes: ArdEpisode[] = []
  for (const item of raw.items?.nodes ?? []) {
    // (an MP3 first: every player takes it; the ARD also offers AAC in an .mp4)
    const audios = (item.audios ?? []).filter((a) => typeof a.url === 'string' && /^https?:\/\//.test(a.url))
    const audio = audios.find((a) => /mp3|mpeg/i.test(a.mimeType ?? '') || /\.mp3(\?|$)/i.test(a.url ?? '')) ?? audios[0]
    if (!item.id || !audio?.url) continue
    // (only what the ARD itself releases for download: allowDownload and a downloadUrl - an MP3 first again)
    const released = (item.audios ?? []).filter((a) => a.allowDownload === true && typeof a.downloadUrl === 'string' && /^https?:\/\//.test(a.downloadUrl))
    const download = released.find((a) => /mp3|mpeg/i.test(a.mimeType ?? '') || /\.mp3(\?|$)/i.test(a.downloadUrl ?? '')) ?? released[0]
    episodes.push({
      id: item.id,
      title: (item.title ?? '').trim() || 'Folge',
      date: item.publishDate ?? null,
      duration: item.duration ?? 0,
      url: audio.url,
      image: picture(item.image?.url) || s.image,
      download: download?.downloadUrl ?? null,
      until: item.endDate ?? null,
    })
  }
  return { show: s, episodes }
}

const hms = (seconds: number) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const sec = Math.floor(seconds % 60)
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(sec).padStart(2, '0')}`
}

/**
 * The episode list of a show in the shape of a parsed RSS feed as the feed cache keeps it (server.ts,
 * parseRssFeedFast: xml-js compact, only the fields the display uses)
 */
export async function ardFeed(id: string): Promise<unknown> {
  const found = await ardShow(id)
  if (!found) throw new Error(`ARD Sounds does not know the show ${id}`)
  const { show: s, episodes } = found
  return {
    _slim: 3, // (the version of the cached shape, see RSS_SLIM_VERSION in server.ts)
    rss: {
      channel: {
        title: { _text: s.title },
        image: { url: { _text: s.image } },
        item: episodes.map((e) => ({
          title: { _text: e.title },
          ...(e.date ? { pubDate: { _text: new Date(e.date).toUTCString() } } : {}),
          guid: { _text: `ard:${e.id}` },
          enclosure: { _attributes: { url: e.url } },
          ...(e.image ? { 'itunes:image': { _attributes: { href: e.image } } } : {}),
          ...(e.duration ? { 'itunes:duration': { _text: hms(e.duration) } } : {}),
          // (for the SD card, podcast-offline.ts: the ARD's download address or none, and the end of its time online)
          _download: e.download,
          ...(e.until ? { _until: e.until } : {}),
        })),
      },
    },
  }
}
