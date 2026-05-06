import { HttpClient } from '@angular/common/http'
import { Injectable, inject, Signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { catchError, of, switchMap, timer } from 'rxjs'
import { environment } from 'src/environments/environment'
import type { PlaytimeStatus } from './playtime.model'

const POLL_INTERVAL_MS = 30_000

@Injectable({ providedIn: 'root' })
export class PlaytimeService {
  private http = inject(HttpClient)

  readonly status: Signal<PlaytimeStatus> = toSignal(
    timer(0, POLL_INTERVAL_MS).pipe(
      switchMap(() =>
        this.http
          .get<PlaytimeStatus>(`${environment.backend.apiUrl}/playtime`)
          .pipe(catchError(() => of<PlaytimeStatus>({ enabled: false }))),
      ),
    ),
    { initialValue: { enabled: false } as PlaytimeStatus },
  )
}
