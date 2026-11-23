import { HttpClient } from '@angular/common/http'
import { Injectable, inject, signal } from '@angular/core'
import { catchError, of } from 'rxjs'
import { environment } from '../environments/environment'
import { heardKeyOf } from './heard-key'
import type { Media } from './media'

export type HeardState = 'started' | 'finished'

/**
 * What of the library was heard (5.1, issue #180) on the display: the ticks at the albums of a list (MedialistPage) -
 * yellow when started, green when heard to its end. The player notes both, the backend keeps them (heard.ts); this
 * reads them while a list is on the screen. Off in the app ("Gehört-Haken"): no ticks.
 */
@Injectable({ providedIn: 'root' })
export class HeardService {
  private readonly http = inject(HttpClient)

  /** key → state (heard-key.ts); empty while off or not loaded */
  readonly items = signal<ReadonlyMap<string, HeardState>>(new Map())
  private shownJson = '{}'
  private loading = false

  /** asks the backend again (a list opened, now and then while it is open) - a new value only when something changed */
  refresh(): void {
    if (this.loading) return
    this.loading = true
    this.http
      .get<{ enabled?: boolean; items?: Record<string, HeardState> }>(`${environment.backend.apiUrl}/heard`)
      .pipe(catchError(() => of(null)))
      .subscribe((res) => {
        this.loading = false
        // (no answer: the ticks stay as they were)
        if (!res) return
        const items = res.enabled === false ? {} : (res.items ?? {})
        const json = JSON.stringify(items)
        if (json === this.shownJson) return
        this.shownJson = json
        this.items.set(new Map(Object.entries(items).filter(([, s]) => s === 'started' || s === 'finished')))
      })
  }

  /** the state of an album of a list (items: this.items(), read once for the list); null: none, or no tick for it */
  stateOf(media: Media, items: ReadonlyMap<string, HeardState>): HeardState | null {
    if (items.size === 0) return null
    const key = heardKeyOf(media)
    return key ? (items.get(key) ?? null) : null
  }
}
