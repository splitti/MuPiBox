/**
 * A podcast's choice of episodes (its library entry's field episodePick, set in the web app): 'newest:N' (always the
 * N newest), 'oldest:N' (the N oldest the feed has), 'span:A-B' (episodes A to B, counted from the newest: 0 is the
 * newest episode) or 'range:A-B' (as chosen before the span: counted from the oldest, 1 is the oldest; it is kept as
 * it is until another choice is made, the form only offers the span). The display counts the same way (frontend-box,
 * episode-pick.ts); the web app's lists and the episodes kept on the SD card (podcast-offline.ts) follow it.
 */

export const isEpisodePick = (v: unknown): v is string =>
  typeof v === 'string' && /^(newest:\d{1,4}|oldest:\d{1,4}|(range|span):\d{1,5}-\d{1,5})$/.test(v)

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
  // span: episode k is at index k of the newest-first list
  if (kind === 'span') return newestFirst.slice(from, to + 1)
  // range (counted from the oldest): episode k is at index n - k
  return newestFirst.slice(Math.max(0, n - to), Math.max(0, n - from + 1))
}
