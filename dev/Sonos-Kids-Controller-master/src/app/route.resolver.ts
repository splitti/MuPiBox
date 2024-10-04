import { Injectable } from '@angular/core'
import type { Resolve } from '@angular/router'
import type { MediaService } from './media.service'

@Injectable()
export class RouteResolver implements Resolve<any> {
  constructor(private mediaService: MediaService) {}

  resolve() {
    return this.mediaService.getNetworkObservable()
  }
}
