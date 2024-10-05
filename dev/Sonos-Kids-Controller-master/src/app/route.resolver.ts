import { Injectable } from '@angular/core'

import { MediaService } from './media.service'

@Injectable()
export class RouteResolver  {
  constructor(private mediaService: MediaService) {}

  resolve() {
    return this.mediaService.getNetworkObservable()
  }
}
