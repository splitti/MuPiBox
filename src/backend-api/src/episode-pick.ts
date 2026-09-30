/**
 * A podcast's choice of episodes (its library entry's field episodePick, set in the web app): 'newest:N' (always the
 * N newest), 'oldest:N' (the N oldest the feed has) or 'range:A-B' (episodes A to B). Counted by date: episode 1 is
 * the oldest of the feed. The display counts the same way (frontend-box, episode-pick.ts); the web app's lists and
 * the episodes kept on the SD card (podcast-offline.ts) follow it.
 */

export const isEpisodePick = (v: unknown): v is string =>
  typeof v === 'string' && /^(newest:\d{1,4}|oldest:\d{1,4}|range:\d{1,5}-\d{1,5})$/.test(v)

/** The chosen episodes of a list that is newest first, in its order; without a choice all */
export function pickEpisodes<T>(newestFirst: T[], pick: unknown): T[] {
  if (!isEpisodePick(pick)) return newestFirst
  const [kind, value] = pick.split(':')
  const n = newestFirst.length
  if (kind === 'newest') return newestFirst.slice(0, Number(value))
  if (kind === 'oldest') return newestFirst.slice(Math.max(0, n - Number(value)))
  const [a, b] = value.split('-').map(Number)
  const from = Math.min(a, b)
  const to = Math.max(a, b)
  // (episode k is at index n - k of the newest-first list)
  return newestFirst.slice(Math.max(0, n - to), Math.max(0, n - from + 1))
}
