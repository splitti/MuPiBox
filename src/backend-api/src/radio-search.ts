/**
 * Radio stations of every language through radio-browser.info - a free directory kept by its users (no key; it asks
 * for a telling User-Agent). A station found here is added as an ordinary radio entry (type 'radio', its stream as
 * the id). Only what the player plays well: no HLS streams (mplayer takes them badly), only stations the directory
 * last found working, each station once (the directory lists many twice: http and https, other bitrates).
 */

import { CONTENT_LANGUAGES } from './podcast-search'

// The directory's names of the languages (its "language" field, in English)
const DIRECTORY_LANGUAGE: Record<string, string> = {
  de: 'german',
  en: 'english',
  fr: 'french',
  nl: 'dutch',
  it: 'italian',
  es: 'spanish',
  pt: 'portuguese',
  pl: 'polish',
  cs: 'czech',
  da: 'danish',
  sv: 'swedish',
  nb: 'norwegian',
  fi: 'finnish',
  el: 'greek',
  tr: 'turkish',
  uk: 'ukrainian',
  ru: 'russian',
}
// Tags of children's stations, as the directory's users write them
const KIDS_TAGS = ['kids', 'children', 'kinder', 'kinderradio', 'enfants', 'bambini', 'niños', 'barn', 'dzieci', 'kinderen']
const SERVERS = ['de1', 'de2', 'fi1', 'nl1'].map((s) => `https://${s}.api.radio-browser.info`)
const CODECS = /^(mp3|aac|aac\+|ogg|opus)$/i

export interface RadioHit {
  name: string
  url: string
  image: string
  country: string
  codec: string
  bitrate: number
  tags: string[]
  kids: boolean
}

interface RawStation {
  name?: string
  url_resolved?: string
  favicon?: string
  countrycode?: string
  codec?: string
  bitrate?: number
  tags?: string
  hls?: number
  lastcheckok?: number
}

async function query(params: Record<string, string>): Promise<RawStation[]> {
  const search = new URLSearchParams({ hidebroken: 'true', order: 'clickcount', reverse: 'true', limit: '60', ...params })
  let last: unknown
  // (one server after the other: the directory runs on several, one of them may be down)
  for (const server of SERVERS) {
    try {
      const r = await fetch(`${server}/json/stations/search?${search}`, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'MuPiBox/5 (music box for children)' } })
      if (!r.ok) throw new Error(`radio-browser answered ${r.status}`)
      return (await r.json()) as RawStation[]
    } catch (error) {
      last = error
    }
  }
  throw last instanceof Error ? last : new Error('radio-browser not reachable')
}

const normName = (name: string) =>
  name
    .toLowerCase()
    .replace(/\[[^\]]*\]|\([^)]*\)/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

function hits(raw: RawStation[]): RadioHit[] {
  const seen = new Set<string>()
  const out: RadioHit[] = []
  for (const s of raw) {
    const url = s.url_resolved ?? ''
    const name = (s.name ?? '').trim()
    if (!name || !/^https?:\/\//.test(url) || s.hls === 1 || s.lastcheckok !== 1 || !CODECS.test(s.codec ?? '')) continue
    const key = normName(name)
    if (!key || seen.has(key)) continue
    seen.add(key)
    const tags = (s.tags ?? '')
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
    out.push({
      name,
      url,
      image: /^https:\/\//.test(s.favicon ?? '') ? (s.favicon as string) : '',
      country: s.countrycode ?? '',
      codec: s.codec ?? '',
      bitrate: s.bitrate ?? 0,
      tags: tags.slice(0, 4),
      kids: tags.some((t) => KIDS_TAGS.includes(t)),
    })
  }
  return out
}

/** Stations whose name has the term, in a language (most listened to first); kidsOnly: children's stations */
export async function searchRadio(term: string, lang: string, kidsOnly: boolean): Promise<RadioHit[]> {
  const language = DIRECTORY_LANGUAGE[lang] ?? 'german'
  const found = hits(await query({ name: term, language }))
  return (kidsOnly ? found.filter((h) => h.kids) : found).slice(0, 40)
}

const SUGGEST_TTL_MS = 6 * 60 * 60 * 1000
const suggestCache = new Map<string, { at: number; hits: RadioHit[] }>()

/** Children's stations of a language, the most listened to first */
export async function kidsRadio(lang: string): Promise<RadioHit[]> {
  const cached = suggestCache.get(lang)
  if (cached && Date.now() - cached.at < SUGGEST_TTL_MS) return cached.hits
  const language = DIRECTORY_LANGUAGE[lang] ?? 'german'
  const lists = await Promise.allSettled(['kids', 'children', 'kinder'].map((tag) => query({ tag, language, limit: '40' })))
  const raw = lists.flatMap((l) => (l.status === 'fulfilled' ? l.value : []))
  // (the lists of the tags together, the most listened to first)
  const ranked = raw.sort((a, b) => ((b as { clickcount?: number }).clickcount ?? 0) - ((a as { clickcount?: number }).clickcount ?? 0))
  const found = hits(ranked).slice(0, 40)
  suggestCache.set(lang, { at: Date.now(), hits: found })
  return found
}

export const radioLanguageKnown = (lang: string) => lang in CONTENT_LANGUAGES && lang in DIRECTORY_LANGUAGE
