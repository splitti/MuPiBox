import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone'
import {
  NgZone,
  enableProdMode,
  importProvidersFrom,
  provideExperimentalZonelessChangeDetection,
  ɵNoopNgZone,
} from '@angular/core'
import { RouteReuseStrategy, provideRouter } from '@angular/router'

import { AppComponent } from './app/app.component'
import { bootstrapApplication } from '@angular/platform-browser'
import { environment } from './environments/environment'
import { routes } from './app/app.routes'

if (environment.production) {
  enableProdMode()
}

bootstrapApplication(AppComponent, {
  providers: [
    // Currently we cannot use standalone components together with zoneless apparently.
    // { provide: NgZone, useClass: ɵNoopNgZone },
    // provideExperimentalZonelessChangeDetection(),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({ mode: 'md' }),
    provideRouter(routes),
  ],
}).catch((err) => {
  console.error(err)
})
