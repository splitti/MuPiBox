import type { Media } from './media'

export type ExtraDataMedia = Pick<
  Media,
  'artistcover' | 'shuffle' | 'aPartOfAll' | 'aPartOfAllMin' | 'aPartOfAllMax' | 'sorting' | 'lastPlayedAt'
>

/**
 * Phase-X cover-cache localizer. If {@link url} is a Spotify CDN image URL
 * (https://i.scdn.co/image/<id>), rewrite it to /api/spotify/cover/<id> so
 * the backend serves the bytes from its SD+RAM cache after the first miss.
 * All other URLs (local /cover/* paths, RSS-feed image URLs, the no-cover
 * fallback asset) pass through unchanged. An empty/undefined input returns
 * the no-cover asset.
 */
const NO_COVER_FALLBACK = '../assets/images/nocover_mupi.png'
const SPOTIFY_CDN_RE = /^https:\/\/i\.scdn\.co\/image\/([A-Za-z0-9]+)$/

// Spotify lists the same cover in several sizes (640, 300, 64 px). The tiles are at most ~300 px
// on the box display, so take the smallest one that is at least 300 px wide: a quarter of the bytes
// of the 640 px image, which the Pi otherwise has to decode for every tile while swiping. Images
// without a width (some playlists) or lists without a 300 px entry fall back to the first one.
export function pickCoverUrl(images: { url?: string; width?: number | null }[] | undefined | null): string | undefined {
  if (!images?.length) return undefined
  const sized = images.filter((img) => img?.url && typeof img.width === 'number' && img.width >= 300)
  sized.sort((a, b) => (a.width as number) - (b.width as number))
  return sized[0]?.url ?? images[0]?.url
}

export function localizeCoverUrl(url: string | undefined | null): string {
  if (!url) return NO_COVER_FALLBACK
  const match = url.match(SPOTIFY_CDN_RE)
  return match ? `/api/spotify/cover/${match[1]}` : url
}

export namespace Utils {
  /**
   * Copies the properties of {@link ExtraDataMedia} from {@link source} to {@link target}.
   *
   * @param source - The source of the properties that will be copied.
   * @param target - The target to which the values of the properties will be copied.
   */
  export const copyExtraMediaData = (source: ExtraDataMedia, target: Media): void => {
    // lastPlayedAt MUST be in this list: media.service.updateMedia replaces
    // every resume entry with a Spotify/RSS-derived Media. If lastPlayedAt
    // doesn't survive the round-trip, fetchActiveResumeData's DESC sort
    // sees only zeros and the resume page falls back to mergeMap-completion
    // order — which makes the most-recently-played item appear at a random
    // position (typically the right end of the swiper).
    const keys: (keyof ExtraDataMedia)[] = [
      'artistcover',
      'shuffle',
      'aPartOfAll',
      'aPartOfAllMin',
      'aPartOfAllMax',
      'sorting',
      'lastPlayedAt',
    ]
    for (const key of keys) {
      if (source[key] != null) {
        // biome-ignore lint/suspicious/noExplicitAny: copying typed-key values between Media subsets — narrow union is verbose without runtime benefit
        ;(target as any)[key] = source[key]
      }
    }
  }
}
