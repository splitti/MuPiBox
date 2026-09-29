import type { CurrentMPlayer } from './current.mplayer'
import type { CurrentSpotify } from './current.spotify'
import type { Media } from './media'

// Builds a resume-shaped Media from the Media that started playback plus the
// most recent player state. Mirrors the field-mapping that lived inline in
// player.page.ts:saveResumeFiles so both the in-page saver and the global
// resume-on-cap effect produce identical entries (which lets the backend's
// composite-key dedup overwrite cleanly instead of duplicating).
export function buildResumeMedia(
  source: Media,
  spotify: CurrentSpotify | null | undefined,
  local: CurrentMPlayer | null | undefined,
): Media {
  const resume: Media = { ...source }

  if (resume.type === 'spotify' && resume.showid) {
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
