/**
 * Podcasts of every language through Apple's podcast directory (the iTunes Search API: free, no key - the same the
 * online covers use). It knows the shows of most broadcasters (Deutschlandfunk, SRF, ORF, RTÉ, BBC, Sveriges Radio,
 * Český rozhlas, ...) with their RSS feed: a show found here is added as an ordinary podcast (type 'rss'), so the
 * episodes on the SD card, going on where it was left and the offline list work for it as for any other.
 *
 * The directory is asked in the countries of a language (its stores): only the search term goes to Apple.
 */

export interface ContentLanguage {
  /** the language's name in itself (shown as it is, in every language of the app) */
  name: string
  /** Apple's stores that are asked for it */
  countries: string[]
}

// The languages the search offers (the app's choice on the search page)
export const CONTENT_LANGUAGES: Record<string, ContentLanguage> = {
  de: { name: 'Deutsch', countries: ['DE', 'AT', 'CH'] },
  en: { name: 'English', countries: ['GB', 'IE', 'US'] },
  fr: { name: 'Français', countries: ['FR', 'BE', 'CH'] },
  nl: { name: 'Nederlands', countries: ['NL', 'BE'] },
  it: { name: 'Italiano', countries: ['IT', 'CH'] },
  es: { name: 'Español', countries: ['ES'] },
  pt: { name: 'Português', countries: ['PT', 'BR'] },
  pl: { name: 'Polski', countries: ['PL'] },
  cs: { name: 'Čeština', countries: ['CZ'] },
  da: { name: 'Dansk', countries: ['DK'] },
  sv: { name: 'Svenska', countries: ['SE', 'FI'] },
  nb: { name: 'Norsk', countries: ['NO'] },
  fi: { name: 'Suomi', countries: ['FI'] },
  el: { name: 'Ελληνικά', countries: ['GR'] },
  tr: { name: 'Türkçe', countries: ['TR'] },
  uk: { name: 'Українська', countries: ['UA'] },
  ru: { name: 'Русский', countries: ['RU'] },
}

export interface PodcastHit {
  title: string
  author: string
  feedUrl: string
  image: string
  genre: string
  episodes: number
  country: string
  kids: boolean
  explicit: boolean
}

// Apple's genres for children: "Kids & Family" (1305) with its "Education for Kids" (1519) and "Stories for Kids"
// (1520) - not its "Parenting" (1521) and "Pets & Animals" (1522), which are for grown-ups
const KIDS = new Set(['1305', '1519', '1520'])
const NOT_KIDS = new Set(['1521', '1522'])

interface RawHit {
  collectionName?: string
  artistName?: string
  feedUrl?: string
  artworkUrl600?: string
  artworkUrl100?: string
  primaryGenreName?: string
  genreIds?: string[]
  trackCount?: number
  collectionExplicitness?: string
}

async function searchCountry(term: string, country: string): Promise<(PodcastHit & { rank: number })[]> {
  return appleHits(`https://itunes.apple.com/search?${new URLSearchParams({ media: 'podcast', entity: 'podcast', term, country, limit: '25' })}`, country)
}

// The shows of an answer of Apple's search or lookup, in its order
async function appleHits(url: string, country: string): Promise<(PodcastHit & { rank: number })[]> {
  const r = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'user-agent': 'MuPiBox' } })
  if (!r.ok) throw new Error(`Apple answered ${r.status}`)
  const results = ((await r.json()) as { results?: RawHit[] }).results ?? []
  return results
    .filter((h): h is RawHit & { feedUrl: string } => typeof h.feedUrl === 'string' && /^https?:\/\//.test(h.feedUrl))
    .map((h, rank) => {
      const ids = new Set((h.genreIds ?? []).map(String))
      return {
        title: (h.collectionName ?? '').trim(),
        author: (h.artistName ?? '').trim(),
        feedUrl: h.feedUrl,
        image: h.artworkUrl600 || h.artworkUrl100 || '',
        genre: h.primaryGenreName ?? '',
        episodes: h.trackCount ?? 0,
        country,
        kids: [...ids].some((id) => KIDS.has(id)) && ![...ids].some((id) => NOT_KIDS.has(id)),
        explicit: h.collectionExplicitness === 'explicit',
        rank,
      }
    })
}

/** Shows for a search term in the stores of a language; kidsOnly: Apple's children's genres, nothing explicit */
export async function searchPodcasts(term: string, lang: string, kidsOnly: boolean): Promise<PodcastHit[]> {
  const countries = CONTENT_LANGUAGES[lang]?.countries ?? ['DE']
  const answers = await Promise.allSettled(countries.map((c) => searchCountry(term, c)))
  const found = answers.flatMap((a) => (a.status === 'fulfilled' ? a.value : []))
  if (!found.length && answers.every((a) => a.status === 'rejected')) throw new Error('Apple not reachable')
  // one show once (the same feed in several stores), the best place it had; the first store's order first
  const byFeed = new Map<string, PodcastHit & { rank: number }>()
  for (const hit of found) {
    const have = byFeed.get(hit.feedUrl)
    if (!have || hit.rank < have.rank) byFeed.set(hit.feedUrl, hit)
  }
  const hits = [...byFeed.values()]
    .filter((h) => h.title && (!kidsOnly || (h.kids && !h.explicit)))
    .sort((a, b) => a.rank - b.rank)
    .map(({ rank: _rank, ...h }) => h)
  return (await onlyLanguage(hits, lang)).slice(0, 40)
}

// A show's name for comparing: the ARD adds its station ("Kakadu – Das Kinderhörspiel - Deutschlandfunk Kultur")
const comparable = (title: string) =>
  title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/**
 * The hits of Apple's directory and of the ARD Audiothek in one list, taking turns. A show in both once - with its
 * feed: an RSS feed is the steadier way than the ARD's interface.
 */
export function mergeHits(apple: PodcastHit[], ard: PodcastHit[]): PodcastHit[] {
  const names = apple.map((h) => comparable(h.title))
  const same = (a: string, b: string) => Math.min(a.length, b.length) >= 6 && (a.startsWith(b) || b.startsWith(a))
  const onlyArd = ard.filter((h) => !names.some((n) => same(n, comparable(h.title))))
  const out: PodcastHit[] = []
  for (let i = 0; i < Math.max(apple.length, onlyArd.length); i++) {
    if (apple[i]) out.push(apple[i])
    if (onlyArd[i]) out.push(onlyArd[i])
  }
  return out.slice(0, 50)
}

// Apple's charts of "Stories for Kids" (1520) and "Education for Kids" (1519) in a language's first store: shows for
// children to start with, without a list kept by hand (Kids & Family itself also holds parenting shows)
const CHART_GENRES = ['1520', '1519']
const TOP_TTL_MS = 6 * 60 * 60 * 1000
const topCache = new Map<string, { at: number; hits: PodcastHit[] }>()

export async function topKidsPodcasts(lang: string): Promise<PodcastHit[]> {
  const cached = topCache.get(lang)
  if (cached && Date.now() - cached.at < TOP_TTL_MS) return cached.hits
  const country = CONTENT_LANGUAGES[lang]?.countries[0] ?? 'DE'
  const charts = await Promise.all(
    CHART_GENRES.map(async (genre) => {
      const r = await fetch(`https://itunes.apple.com/${country.toLowerCase()}/rss/toppodcasts/limit=50/genre=${genre}/json`, {
        signal: AbortSignal.timeout(10000),
        headers: { 'user-agent': 'MuPiBox' },
      })
      if (!r.ok) return [] as string[]
      const entries = ((await r.json()) as { feed?: { entry?: { id?: { attributes?: { 'im:id'?: string } } }[] } }).feed?.entry ?? []
      return entries.map((e) => e.id?.attributes?.['im:id']).filter((id): id is string => !!id && /^\d+$/.test(id))
    }),
  )
  // taking turns between the two charts, each show once
  const ids: string[] = []
  for (let i = 0; i < 50; i++) for (const chart of charts) if (chart[i] && !ids.includes(chart[i])) ids.push(chart[i])
  if (!ids.length) return []
  const found = await appleHits(`https://itunes.apple.com/lookup?${new URLSearchParams({ id: ids.join(','), entity: 'podcast', country })}`, country)
  const byId = new Map(found.map((h) => [h.feedUrl, h]))
  const hits = (await onlyLanguage([...byId.values()].filter((h) => h.title && h.kids && !h.explicit), lang)).slice(0, 40)
  topCache.set(lang, { at: Date.now(), hits })
  return hits
}

// --- Only shows of the chosen language ---
// Apple knows countries (its stores), not languages: the Swedish store lists English, German, Russian shows too. A
// feed names its language itself (<language>sv</language>, "de-DE"): the start of each hit's feed is read (a checked
// GET, set by server.ts) and remembered. A title in another script (Cyrillic, Arabic, ... for Swedish) is left out at
// once; a feed that names no language stays, after the others.
let readFeedHead: ((url: string) => Promise<string>) | null = null
export function setFeedHeadReader(read: (url: string) => Promise<string>): void {
  readFeedHead = read
}
const feedLanguages = new Map<string, string>()
async function feedLanguage(url: string): Promise<string> {
  const known = feedLanguages.get(url)
  if (known !== undefined) return known
  let lang = ''
  try {
    const head = readFeedHead ? await readFeedHead(url) : ''
    lang = /<language>\s*(?:<!\[CDATA\[)?\s*([A-Za-z]{2,3})/i.exec(head)?.[1]?.toLowerCase() ?? ''
  } catch {
    lang = ''
  }
  if (feedLanguages.size > 5000) feedLanguages.clear()
  feedLanguages.set(url, lang)
  return lang
}
// (Norwegian comes as nb, no or nn)
const SAME_LANGUAGE: Record<string, string[]> = { nb: ['nb', 'no', 'nn'] }
const OTHER_SCRIPT = /[\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Devanagari}\p{Script=Greek}]/u
const SCRIPT_OF: Record<string, RegExp> = { ru: /\p{Script=Cyrillic}/u, uk: /\p{Script=Cyrillic}/u, el: /\p{Script=Greek}/u }
function fitsScript(title: string, lang: string): boolean {
  const own = SCRIPT_OF[lang]
  // a language with its own script: its script or Latin; the others: no other script
  if (own) return !OTHER_SCRIPT.test(title.replace(new RegExp(own.source, 'gu'), ''))
  return !OTHER_SCRIPT.test(title)
}

export async function onlyLanguage(hits: PodcastHit[], lang: string): Promise<PodcastHit[]> {
  const wanted = SAME_LANGUAGE[lang] ?? [lang]
  const candidates = hits.filter((h) => fitsScript(`${h.title} ${h.author}`, lang)).slice(0, 60)
  const langs: string[] = new Array(candidates.length)
  // (a few at a time: the box asks the feeds' servers, each one once)
  let next = 0
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (next < candidates.length) {
        const i = next++
        langs[i] = await feedLanguage(candidates[i].feedUrl)
      }
    }),
  )
  const same = candidates.filter((_h, i) => wanted.includes(langs[i]))
  const unknown = candidates.filter((_h, i) => langs[i] === '')
  return [...same, ...unknown]
}
