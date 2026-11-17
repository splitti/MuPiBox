// Audible's library of the signed-in account, as the box needs it (docs/audible-5.1.md, A2): the audiobooks (no podcasts,
// decided), their series and covers. Read in pages of 50 and kept for 30 minutes - Audible limits how often it is asked, and
// a library changes seldom. A series in the box's library ("audibleKind 'series'") is the books of the account in that
// series, in the series' order; books bought later come with it.

import { AudibleError, type AudibleSession, apiJson } from './client'

export const isAsin = (v: unknown): v is string => typeof v === 'string' && /^[A-Z0-9]{10}$/.test(v)

/** One audiobook of the account */
export interface AudibleBook {
  asin: string
  title: string
  subtitle: string
  authors: string[]
  narrators: string[]
  /** length in minutes (0 unknown) */
  minutes: number
  /** Amazon's id of the cover ('' none): /api/audible/image/<id> */
  image: string
  /** the series it belongs to, with its place there ('' none given) */
  series: { asin: string; title: string; sequence: string }[]
  /** heard to its end in Audible */
  finished: boolean
  /** release date YYYY-MM-DD ('' unknown) */
  released: string
}

/** A series with the account's books of it, in the series' order */
export interface AudibleSeries {
  asin: string
  title: string
  books: { asin: string; sequence: string }[]
  /** the cover of its first book */
  image: string
}

// (the books Audible delivers as audio: one part or several parts behind one ASIN - podcasts and their episodes are left
// out, the box has podcasts of its own)
const BOOK_TYPES = new Set(['SinglePartBook', 'MultiPartBook'])
// (big pages: a library of 2000 books in 2 to 4 requests instead of 40 - Audible takes up to 1000; a smaller one if it
// refuses the size)
const PAGES = [1000, 50]
const MAX_BOOKS = 5000
const FRESH_MS = 30 * 60 * 1000
const GROUPS = 'contributors,media,product_attrs,product_desc,product_details,relationships,series,is_finished'

const text = (v: unknown, max = 300) => (typeof v === 'string' ? v.replace(/[\r\n\t]+/g, ' ').trim().slice(0, max) : '')
const names = (v: unknown) =>
  Array.isArray(v)
    ? v
        .map((x) => text((x as { name?: unknown })?.name, 120))
        .filter(Boolean)
        .slice(0, 12)
    : []

/** Amazon's id of a picture from its address (…/images/I/<id>._SL500_.jpg) */
export function imageIdOf(url: unknown): string {
  const m = typeof url === 'string' ? /^https:\/\/m\.media-amazon\.com\/images\/I\/([A-Za-z0-9+_-]{5,60})\.[^/]*$/.exec(url) : null
  return m ? m[1] : ''
}
export const isImageId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9+_-]{5,60}$/.test(v)

/** A library entry of Audible's answer as the box keeps it - null for what the box does not play */
export function bookOf(raw: unknown): AudibleBook | null {
  const r = (raw ?? {}) as Record<string, any>
  if (!isAsin(r.asin) || !BOOK_TYPES.has(String(r.content_delivery_type ?? ''))) return null
  const images = (r.product_images ?? {}) as Record<string, unknown>
  const series = Array.isArray(r.series)
    ? r.series
        .filter((s: any) => isAsin(s?.asin))
        .map((s: any) => ({ asin: s.asin as string, title: text(s.title, 200), sequence: text(s.sequence, 20) }))
        .slice(0, 5)
    : []
  const released = text(r.release_date ?? r.issue_date, 10)
  return {
    asin: r.asin,
    title: text(r.title) || r.asin,
    subtitle: text(r.subtitle),
    authors: names(r.authors),
    narrators: names(r.narrators),
    minutes: Number.isFinite(Number(r.runtime_length_min)) ? Math.max(0, Math.round(Number(r.runtime_length_min))) : 0,
    image: imageIdOf(images['500'] ?? Object.values(images)[0]),
    series,
    finished: r.is_finished === true,
    released: /^\d{4}-\d{2}-\d{2}$/.test(released) ? released : '',
  }
}

/** The whole library of the account (up to 3000 entries), only the audiobooks */
export async function fetchLibrary(session: AudibleSession): Promise<AudibleBook[]> {
  for (const size of PAGES) {
    try {
      return await fetchPages(session, size)
    } catch (err) {
      if (!(err instanceof AudibleError && err.problem === 'refused') || size === PAGES[PAGES.length - 1]) throw err
    }
  }
  return []
}

async function fetchPages(session: AudibleSession, size: number): Promise<AudibleBook[]> {
  const books = new Map<string, AudibleBook>()
  let seen = 0
  for (let page = 1; seen < MAX_BOOKS; page++) {
    const body = await apiJson<{ items?: unknown[] }>(session, 'GET', 'library', { query: { page, num_results: size, response_groups: GROUPS, sort_by: '-PurchaseDate' }, timeoutMs: 60000 })
    const items = Array.isArray(body?.items) ? body.items : []
    seen += items.length
    for (const raw of items) {
      const b = bookOf(raw)
      // (once each: a book bought while the pages were read moves the others by one)
      if (b && !books.has(b.asin)) books.set(b.asin, b)
    }
    if (items.length < size) break
  }
  return [...books.values()]
}

// "3", "3.5", "1-3", "" -> a number to sort by (unknown last)
const place = (s: string) => {
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY
}

/** The series of the books, each with its books in the series' order (then by release) - only series the account has books of */
export function seriesOf(books: AudibleBook[]): AudibleSeries[] {
  const map = new Map<string, AudibleSeries & { released: Map<string, string> }>()
  for (const b of books) {
    for (const s of b.series) {
      let x = map.get(s.asin)
      if (!x) map.set(s.asin, (x = { asin: s.asin, title: s.title, books: [], image: '', released: new Map() }))
      if (!x.title && s.title) x.title = s.title
      if (!x.books.some((y) => y.asin === b.asin)) x.books.push({ asin: b.asin, sequence: s.sequence })
      x.released.set(b.asin, b.released)
    }
  }
  const byAsin = new Map(books.map((b) => [b.asin, b]))
  return [...map.values()]
    .map(({ released, ...x }) => {
      x.books.sort((a, b) => place(a.sequence) - place(b.sequence) || (released.get(a.asin) ?? '').localeCompare(released.get(b.asin) ?? ''))
      // (the cover of its first book - or of the first one that has a cover)
      x.image = x.books.map((y) => byAsin.get(y.asin)?.image ?? '').find(Boolean) ?? ''
      return { ...x, title: x.title || x.asin }
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'de'))
}

/** The account's library, kept for 30 minutes (and per device - a new sign-in is another account maybe) */
export class AudibleLibrary {
  private kept: { key: string; at: number; books: AudibleBook[] } | null = null
  private loading: { key: string; p: Promise<AudibleBook[]> } | null = null

  constructor(private readonly fetchBooks: (s: AudibleSession) => Promise<AudibleBook[]> = fetchLibrary) {}

  /** the books; fresh: asked anew (the parents bought something) */
  async books(session: AudibleSession, key: string, fresh = false): Promise<AudibleBook[]> {
    if (!fresh && this.kept?.key === key && Date.now() - this.kept.at < FRESH_MS) return this.kept.books
    if (this.loading?.key === key) return this.loading.p
    const p = this.fetchBooks(session)
    this.loading = { key, p }
    try {
      const books = await p
      this.kept = { key, at: Date.now(), books }
      return books
    } finally {
      if (this.loading?.p === p) this.loading = null
    }
  }

  /** the books kept, however old (null none for this device) - for when Audible does not answer */
  /** how old the kept books are, ms (Infinity none for this device) */
  age(key: string): number {
    return this.kept?.key === key ? Date.now() - this.kept.at : Number.POSITIVE_INFINITY
  }

  stale(key: string): AudibleBook[] | null {
    return this.kept?.key === key ? this.kept.books : null
  }

  forget(): void {
    this.kept = null
  }
}

/** The box's one copy of the library (the app's page, and the display for a whole series) */
export const audibleLibrary = new AudibleLibrary()
