import type { CurrentMPlayer } from './current.mplayer'
import type { CurrentSpotify } from './current.spotify'
import type { Media } from './media'

// Builds a resume-shaped Media from the Media that started playback plus the
// most recent player state. Mirrors the field-mapping that lived inline in
// player.page.ts:saveResumeFiles so both the in-page saver and the global
// resume-on-cap effect produce identical entries (which lets the backend's
// composite-key dedup overwrite cleanly instead of duplicating).
/**
 * A resume entry made from a placeholder (Spotify did not answer when the list was made: "Nicht verfügbar", the no-cover
 * picture) takes the name and cover of what plays; without them false - not to be kept. The list's own marks go.
 */
export function cleanResumePlaceholder(resume: Media, spotify: CurrentSpotify | null | undefined): boolean {
  delete resume.row
  if (!resume.unavailable) return true
  const album = spotify?.item?.album as { name?: string; images?: { url?: string }[] } | undefined
  if (!album?.name) return false
  delete resume.unavailable
  resume.title = album.name
  const cover = album.images?.[0]?.url
  if (cover) resume.cover = cover
  return true
}

export function buildResumeMedia(
  source: Media,
  spotify: CurrentSpotify | null | undefined,
  local: CurrentMPlayer | null | undefined,
): Media {
  const resume: Media = { ...source }
  cleanResumePlaceholder(resume, spotify)

  // (the track's place not known - see player.page saveResumeFiles: the values the entry has stay)
  if (resume.type === 'spotify' && !resume.showid && !spotify?.item?.track_number) {
    // nothing of the position
  } else if (resume.type === 'spotify' && resume.showid) {
    resume.resumespotifytrack_number = spotify?.item?.track_number || 1
    resume.resumespotifyprogress_ms = spotify?.progress_ms || 0
    resume.resumespotifyduration_ms = spotify?.item?.duration_ms || 0
  } else if (resume.type === 'spotify') {
    resume.resumespotifytrack_number = spotify?.item?.track_number || 0
    resume.resumespotifyprogress_ms = spotify?.progress_ms || 0
    resume.resumespotifyduration_ms = spotify?.item?.duration_ms || 0
  } else if (resume.type === 'library') {
    // resumelocalalbum kept for downgrade-safety; new readers prefer category.
    resume.resumelocalalbum = resume.category
    resume.resumelocalcurrentTracknr = local?.currentTracknr || 0
    resume.resumelocalprogressTime = local?.progressTime || 0
  } else if (resume.type === 'rss') {
    resume.resumerssprogressTime = local?.progressTime || 0
  }

  // Recover the original category if we inherited the legacy in-memory
  // 'resume' marker (e.g. AppComponent saver runs while currentMedia was
  // populated from a clicked-resume-card flow).
  if (resume.category === 'resume' && resume.resumelocalalbum) {
    resume.category = resume.resumelocalalbum
  }
  resume.isResume = true
  resume.index = undefined
  return resume
}
