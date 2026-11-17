// The tile of the start page an entry of the library belongs to (5.1, a day's limit per tile - "Kachel-Limit"): the same
// key as the display forms it (frontend-box tile-key.ts) and the player counts by (spotify-control.js "Tile time"):
//   artist:<category>:<name>   the artist's tile (the name as the start page shows it - the entry's own artist)
//   lib:<path>                 a folder of the box's library (the player takes it for the tile whose folder it is in)
//   nas:<path>                 a NAS folder (the same)
//   single:<category>:<id>     a playlist or radio station without an artist: a tile of its own
// The category as the start page sorts it: none is "audiobook", the old "radio" is "other".

const MAX = 400

export function tileCategory(category: unknown): string {
  const c = typeof category === 'string' && category ? category : 'audiobook'
  return c === 'radio' ? 'other' : c
}

function ok(key: string): string | null {
  return key.length <= MAX && !key.includes('\n') ? key : null
}

/** A data.json row: its tile, or null (nothing to count it by). nameFromSource: the artist the display takes from the
 *  source when the row has none (a podcast's name from its feed). */
export function tileKeyOfRow(item: Record<string, unknown>, nameFromSource?: string): string | null {
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  if (str(item.nasPath)) return ok(`nas:${str(item.nasPath)}`)
  const cat = tileCategory(item.category)
  if (item.type === 'library') {
    if (str(item.libraryPath)) return ok(`lib:${str(item.libraryPath)}`)
    // (an old row: category/artist/title)
    return str(item.artist) ? ok(`lib:${str(item.category) || 'audiobook'}/${str(item.artist)}/${str(item.title)}`) : null
  }
  const artist = str(item.artist) || nameFromSource || ''
  if (!artist) {
    if (str(item.playlistid)) return ok(`single:${cat}:${str(item.playlistid)}`)
    if (item.type === 'radio' && str(item.id)) return ok(`single:${cat}:${str(item.id)}`)
    if (item.type === 'tidal' && item.tidalKind === 'playlist' && str(item.id)) return ok(`single:${cat}:${str(item.id)}`)
    if (item.type === 'jellyfin' && item.jellyfinKind === 'playlist' && str(item.id)) return ok(`single:${cat}:${str(item.id)}`)
    return null
  }
  return ok(`artist:${cat}:${artist}`)
}

/** "&tile=…" for a command to the player that has a query already ('' without a tile) */
export function tileParam(key: string | null): string {
  return key ? `&tile=${encodeURIComponent(key)}` : ''
}

/** "&heard=…" - what of the library starts, for the ticks of what was heard (../heard.ts; '' for nothing) */
export function heardParam(key: string | null): string {
  return key && key.length <= 400 && !key.includes('\n') ? `&heard=${encodeURIComponent(key)}` : ''
}
