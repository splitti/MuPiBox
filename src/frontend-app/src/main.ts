import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone'
import { RouteReuseStrategy, provideRouter } from '@angular/router'
import { enableProdMode, provideExperimentalZonelessChangeDetection } from '@angular/core'

import { AppComponent } from './app/app.component'
import { bootstrapApplication } from '@angular/platform-browser'
import { environment } from './environments/environment'
import { routes } from './app/app.routes'

if (environment.production) {
  enableProdMode()
}

bootstrapApplication(AppComponent, {
  providers: [
    provideExperimentalZonelessChangeDetection(),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({ mode: 'md' }),
    provideRouter(routes),
  ],
}).catch((err) => console.error(err))
