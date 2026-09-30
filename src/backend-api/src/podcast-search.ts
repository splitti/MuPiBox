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
  const url = `https://itunes.apple.com/search?${new URLSearchParams({ media: 'podcast', entity: 'podcast', term, country, limit: '25' })}`
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
  return [...byFeed.values()]
    .filter((h) => h.title && (!kidsOnly || (h.kids && !h.explicit)))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 40)
    .map(({ rank: _rank, ...h }) => h)
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
