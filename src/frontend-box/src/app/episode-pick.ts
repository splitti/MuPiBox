/**
 * A podcast's choice of episodes (its library entry's field episodePick, set in the web app): 'newest:N' (always the
 * N newest), 'oldest:N' (the N oldest the feed has) or 'range:A-B' (episodes A to B). Counted by date: episode 1 is
 * the oldest of the feed. The same counting as the box's server (backend-api, episode-pick.ts).
 */
export function pickEpisodes<T>(newestFirst: T[], pick: string | undefined | null): T[] {
  const m = /^(?:(newest|oldest):(\d{1,4})|range:(\d{1,5})-(\d{1,5}))$/.exec(pick ?? '')
  if (!m) return newestFirst
  const n = newestFirst.length
  if (m[1] === 'newest') return newestFirst.slice(0, Number(m[2]))
  if (m[1] === 'oldest') return newestFirst.slice(Math.max(0, n - Number(m[2])))
  const from = Math.min(Number(m[3]), Number(m[4]))
  const to = Math.max(Number(m[3]), Number(m[4]))
  // (episode k is at index n - k of the newest-first list)
  return newestFirst.slice(Math.max(0, n - to), Math.max(0, n - from + 1))
}

/**
 * The episodes newest first by their date, as the server counts them: only those with an audio file (id), one without
 * a date after all dated ones, in the feed's order.
 */
export function newestFirst<T extends { id?: string; release_date?: string }>(list: T[]): T[] {
  return list
    .filter((t) => !!t.id)
    .map((t, i) => {
      const v = Date.parse(t.release_date ?? '')
      return { t, at: Number.isFinite(v) ? v : -i }
    })
    .sort((x, y) => y.at - x.at)
    .map((x) => x.t)
}
