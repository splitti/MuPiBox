// What was played today / in the last 7 days, from play_log.jsonl (the backend's play-log poller writes it): the
// app's history (GET /api/app/playlog) and the weekly Telegram summary (weekly-summary.ts) use it
import { promises as fsp } from 'node:fs'

export interface PlaylogSummary {
  range: 'today' | 'week'
  totalMinutes: number
  trackCount: number
  topArtists: { name: string; minutes: number; count: number }[]
  topTitles: { title: string; artist: string; minutes: number; count: number }[]
  timeline: { date: string; minutes: number }[]
}

export async function playlogSummary(
  range: 'today' | 'week',
  currentPlayLogStart?: () => number | null,
): Promise<PlaylogSummary> {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  // The week: today and the six days before, from midnight on - the same days as the bars below (the last 168 hours
  // counted plays in the total that no bar showed). setDate keeps the days right across a clock change.
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
  const cutoffMs = range === 'today' ? todayStart.getTime() : weekStart.getTime()

  let raw = ''
  try {
    // Bewusst asynchron: die Datei liegt im MB-Bereich, und readFileSync
    // hätte den einzigen Thread des Backends blockiert -- also auch
    // Wiedergabesteuerung und Display-Sync, während jemand den
    // Hör-Verlauf öffnet.
    raw = await fsp.readFile('/home/dietpi/.mupibox/play_log.jsonl', 'utf8')
  } catch {
    // file may not exist yet — return empty result
  }
  type Entry = {
    ts: string
    event: 'start' | 'stop'
    source?: string
    title?: string
    artist?: string
    album?: string
    duration_seconds?: number
  }
  const entries: Entry[] = []
  for (const ln of raw.split('\n')) {
    if (!ln) continue
    try {
      const e = JSON.parse(ln) as Entry
      if (Date.parse(e.ts) >= cutoffMs) entries.push(e)
    } catch {
      /* skip malformed line */
    }
  }

  type Play = { tsMs: number; source: string; title: string; artist: string; album: string; duration: number }
  const plays: Play[] = []
  let pending: { tsMs: number; source: string; title: string; artist: string; album: string } | null = null
  // A start without a stop (box switched off, backend killed): how long it really played is unknown.
  // Counting it up to the next start put hours of a switched-off box on the history, so it counts at
  // most this long.
  const ORPHAN_MAX_S = 10 * 60
  const orphanSeconds = (fromMs: number, toMs: number) =>
    Math.min(ORPHAN_MAX_S, Math.max(0, Math.round((toMs - fromMs) / 1000)))
  for (const e of entries) {
    if (e.event === 'start') {
      if (pending !== null) {
        plays.push({ ...pending, duration: orphanSeconds(pending.tsMs, Date.parse(e.ts)) })
      }
      pending = {
        tsMs: Date.parse(e.ts),
        source: e.source ?? '',
        title: e.title ?? '',
        artist: e.artist ?? '',
        album: e.album ?? '',
      }
    } else if (e.event === 'stop' && pending !== null) {
      plays.push({ ...pending, duration: e.duration_seconds ?? 0 })
      pending = null
    }
  }
  if (pending !== null) {
    // Currently still playing (the poller times exactly this start) — count up to now so today's
    // number reflects reality. Otherwise it's a start left over from before a restart.
    const running = currentPlayLogStart?.()
    const isRunning = running != null && Math.abs(running - pending.tsMs) < 2000
    const duration = isRunning
      ? Math.max(0, Math.round((Date.now() - pending.tsMs) / 1000))
      : orphanSeconds(pending.tsMs, Date.now())
    plays.push({ ...pending, duration })
  }

  const totalSeconds = plays.reduce((s, p) => s + p.duration, 0)
  const totalMinutes = Math.round(totalSeconds / 60)
  const trackCount = plays.length

  // (the player writes "undefined" for a stream without an album)
  const whoOf = (p: Play) => p.artist || (p.album && p.album !== 'undefined' ? p.album : '')
  const artistMap = new Map<string, { name: string; seconds: number; count: number }>()
  for (const p of plays) {
    // (no artist: the album instead - for an audio book on the NAS or the SD card and a podcast it names the book or
    // the show; a radio stream has neither: an empty name, the app words it)
    const key = whoOf(p)
    const cur = artistMap.get(key) ?? { name: key, seconds: 0, count: 0 }
    cur.seconds += p.duration
    cur.count += 1
    artistMap.set(key, cur)
  }
  const topArtists = [...artistMap.values()]
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 5)
    .map((a) => ({ name: a.name, minutes: Math.round(a.seconds / 60), count: a.count }))

  const titleMap = new Map<string, { title: string; artist: string; seconds: number; count: number }>()
  for (const p of plays) {
    const key = `${whoOf(p)}|${p.title}`
    const cur = titleMap.get(key) ?? { title: p.title, artist: whoOf(p), seconds: 0, count: 0 }
    cur.seconds += p.duration
    cur.count += 1
    titleMap.set(key, cur)
  }
  const topTitles = [...titleMap.values()]
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 5)
    .map((t) => ({ title: t.title, artist: t.artist, minutes: Math.round(t.seconds / 60), count: t.count }))

  const dateKey = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const timeline: Array<{ date: string; minutes: number }> = []
  if (range === 'today') {
    timeline.push({ date: dateKey(todayStart), minutes: totalMinutes })
  } else {
    const dayBuckets = new Map<string, number>()
    for (let i = 6; i >= 0; i--) {
      dayBuckets.set(dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)), 0)
    }
    for (const p of plays) {
      const d = new Date(p.tsMs)
      const key = dateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate()))
      if (dayBuckets.has(key)) dayBuckets.set(key, (dayBuckets.get(key) ?? 0) + p.duration)
    }
    for (const [date, secs] of dayBuckets) {
      // (seconds summed, rounded once: summed minute fractions gave 3.4999 = 3 where "today" said 4)
      timeline.push({ date, minutes: Math.round(secs / 60) })
    }
  }

  return { range, totalMinutes, trackCount, topArtists, topTitles, timeline }
}
