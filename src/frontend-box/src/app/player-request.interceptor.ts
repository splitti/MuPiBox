import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { Observable } from 'rxjs'
import { environment } from '../environments/environment'

/**
 * Marks every request to the player (port 5005) as coming from the box's own pages. The player
 * only runs commands for requests with this header (or from local non-browser clients), so a
 * foreign web page can no longer trigger play/stop/shutdown through an <img> or a link - it
 * could only send the header after a CORS preflight, which the player refuses for other origins.
 */
@Injectable()
export class PlayerRequestInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (req.url.startsWith(environment.backend.playerUrl)) {
      return next.handle(req.clone({ setHeaders: { 'X-Requested-With': 'XMLHttpRequest' } }))
    }
    return next.handle(req)
  }
}
