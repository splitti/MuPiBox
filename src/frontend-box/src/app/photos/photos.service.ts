import { HttpClient } from '@angular/common/http'
import { computed, inject, Injectable, signal } from '@angular/core'
import { catchError, of } from 'rxjs'
import { environment } from 'src/environments/environment'

/** An album as the display gets it (only albums shown there, with pictures; no source, no account) */
export interface PhotoAlbumSummary {
  id: string
  title: string
  count: number
  /** the first two pictures (the stack): its own picture first */
  pictures: string[]
  /** shown live from Immich, and Immich is away: "Gerade nicht da" */
  away?: boolean
  /** an album of people (Immich): how many faces its stack shows (faceUrl) */
  faces?: number
}

export interface PhotoAsset {
  id: string
  w: number
  h: number
  /** a clip ("Videos anzeigen"), with its length in seconds */
  kind?: 'video'
  duration?: number
}

/** a clip's length as 0:24 */
export const clipLength = (sec: number | undefined): string => {
  const n = Math.max(0, Math.round(Number(sec) || 0))
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`
}

export interface PhotoAlbumDetail {
  id: string
  title: string
  assets: PhotoAsset[]
}

interface AlbumsAnswer {
  enabled: boolean
  startAsSlideshow?: boolean
  slideshowSeconds?: number
  albums: PhotoAlbumSummary[]
}

/** s: grid and stack (400), f: full view (1280), b: the blurred background (32), v: a clip's video */
export type PhotoSize = 's' | 'f' | 'b' | 'v'

/**
 * The photo display on the box (5.1): the albums the parents show here (app › Bibliothek › Fotos) and the settings the
 * display needs. Asked when the start page shows and every two minutes - an album made in the app turns up by itself.
 */
@Injectable({ providedIn: 'root' })
export class PhotosService {
  private readonly http = inject(HttpClient)
  private readonly base = `${environment.backend.apiUrl}/photos`

  private readonly answer = signal<AlbumsAnswer | null>(null)
  readonly albums = computed(() => this.answer()?.albums ?? [])
  /** the box has answered once (before that, "no albums" is not known yet) */
  readonly loaded = computed(() => this.answer() !== null)
  /** the tab "Fotos": switched on, and at least one album with pictures shown on the display */
  readonly available = computed(() => this.answer()?.enabled === true && this.albums().length > 0)
  /** every album there is away (all live from an Immich that is not there): the tab's own page */
  readonly allAway = computed(() => this.albums().length > 0 && this.albums().every((a) => a.away === true))
  readonly startAsSlideshow = computed(() => this.answer()?.startAsSlideshow === true)
  readonly slideshowSeconds = computed(() => {
    const s = this.answer()?.slideshowSeconds
    return s === 8 || s === 5 || s === 3 ? s : 5
  })

  /** back from an album: the start page shows the tab "Fotos" (also when it is made afresh) */
  readonly backToTab = signal(false)

  private lastAsked = 0

  constructor() {
    this.refresh()
    window.setInterval(() => this.refresh(), 120_000)
  }

  /** Asks again (at most every 10 s - the start page calls it on every visit); albums not there: the box asks Immich first */
  refresh(force = false): void {
    if (!force && Date.now() - this.lastAsked < 10_000) return
    this.lastAsked = Date.now()
    const check = this.albums().some((a) => a.away) ? '?check=1' : ''
    this.http
      .get<AlbumsAnswer>(`${this.base}/albums${check}`)
      .pipe(catchError(() => of(null)))
      .subscribe((a) => {
        // (no answer - the server restarts: what was there stays)
        if (a) this.answer.set(a)
      })
  }

  album(id: string) {
    return this.http.get<PhotoAlbumDetail>(`${this.base}/album/${encodeURIComponent(id)}`)
  }

  fileUrl(album: string, asset: string, size: PhotoSize): string {
    return `${this.base}/file/${encodeURIComponent(album)}/${encodeURIComponent(asset)}/${size}`
  }

  /** the n-th face of an album of people */
  faceUrl(album: string, n: number): string {
    return `${this.base}/face/${encodeURIComponent(album)}/${n}`
  }
}
