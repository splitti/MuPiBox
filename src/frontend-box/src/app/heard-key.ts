import type { Media } from './media'

// What of the library was heard (5.1, issue #180): the key of an album, the same as the backend (heard.ts), the app and
// the player (spotify-control.js "Heard") form it:
//   lib:<folder>                   a folder of the box's library (its path below the media folder)
//   nas:<path>                     a NAS folder
//   tidal:<album|playlist>:<id>    an album or a playlist of TIDAL
//   jellyfin:<album|playlist|book>:<id>  an album, a playlist or an audiobook of Jellyfin
//   spotify:<kind>:<id>            what Spotify plays: album, playlist, episode, show (as playMedia starts it)
// null: no tick - a radio, a podcast (its episodes have their own), a folder that holds folders, a TIDAL artist as a whole.

const MAX = 400

function ok(key: string): string | null {
  return key.length <= MAX && !key.includes('\n') ? key : null
}

export function heardKeyOf(media: Media | undefined | null): string | null {
  if (!media) return null
  if (media.type === 'nas' || media.nasPath) {
    if (media.nasIsContainer || !media.nasPath) return null
    return ok(`nas:${media.nasPath}`)
  }
  if (media.type === 'library') {
    if (media.libraryIsContainer) return null
    if (media.libraryPath) return ok(`lib:${media.libraryPath}`)
    // (an old entry: category/artist/title, as the player plays it)
    const category = media.category === 'resume' ? media.resumelocalalbum : media.category
    return media.artist && media.title ? ok(`lib:${category || 'audiobook'}/${media.artist}/${media.title}`) : null
  }
  if (media.type === 'tidal') {
    if (media.tidalKind === 'artist' || !media.id) return null
    return ok(`tidal:${media.tidalKind === 'playlist' ? 'playlist' : 'album'}:${media.id}`)
  }
  if (media.type === 'jellyfin') {
    const kind = media.jellyfinKind ?? 'album'
    if (kind === 'artist' || !media.id) return null
    return ok(`jellyfin:${kind}:${media.id}`)
  }
  if (media.type === 'spotify') {
    if (media.playlistid) return ok(`spotify:playlist:${media.playlistid}`)
    if (media.id) return ok(`spotify:album:${media.id}`)
    if (media.showid) return ok(`spotify:episode:${media.showid}`)
    if (media.audiobookid) return ok(`spotify:show:${media.audiobookid}`)
  }
  return null
}

// The query part that names it on a command to the player ('' without one): "?heard=…" or "&heard=…"
export function heardQuery(url: string, media: Media | undefined): string {
  const key = heardKeyOf(media)
  if (!key) return ''
  return `${url.includes('?') ? '&' : '?'}heard=${encodeURIComponent(key)}`
}
