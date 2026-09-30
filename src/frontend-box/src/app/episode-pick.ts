/**
 * A podcast's choice of episodes (its library entry's field episodePick, set in the web app): 'newest:N' (always the
 * N newest), 'oldest:N' (the N oldest the feed has) or 'range:A-B' (episodes A to B). Counted by date: episode 1 is
 * the oldest of the feed. The same counting as the box's server (backend-api, episode-pick.ts).
 */
export function pickEpisodes<T>(newestFirst: T[], pick: string | undefined | null): T[] {
  const m = /^(newest|oldest|range):(\d+)(?:-(\d+))?$/.exec(pick ?? '')
  if (!m) return newestFirst
  const n = newestFirst.length
  const a = Number(m[2])
  if (m[1] === 'newest') return newestFirst.slice(0, a)
  if (m[1] === 'oldest') return newestFirst.slice(Math.max(0, n - a))
  const b = m[3] ? Number(m[3]) : n
  const from = Math.min(a, b)
  const to = Math.max(a, b)
  // (episode k is at index n - k of the newest-first list)
  return newestFirst.slice(Math.max(0, n - to), Math.max(0, n - from + 1))
}

/** The episodes newest first by their date (without a date: in the feed's order, which is newest first mostly) */
export function newestFirst<T extends { release_date?: string }>(list: T[]): T[] {
  const at = (t: T) => {
    const v = Date.parse(t.release_date ?? '')
    return Number.isFinite(v) ? v : null
  }
  return list
    .map((t, i) => ({ t, i, at: at(t) }))
    .sort((x, y) => (x.at !== null && y.at !== null && x.at !== y.at ? y.at - x.at : x.i - y.i))
    .map((x) => x.t)
}
