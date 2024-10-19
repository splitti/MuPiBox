import { BrowserModule, bootstrapApplication } from '@angular/platform-browser'
import { RouteReuseStrategy, provideRouter } from '@angular/router'
import { enableProdMode, importProvidersFrom } from '@angular/core'
import { provideHttpClient, withInterceptorsFromDi, withJsonpSupport } from '@angular/common/http'

import { AppComponent } from './app/app.component'
import { IonicRouteStrategy } from '@ionic/angular'
import { MediaService } from './app/media.service'
import { environment } from './environments/environment'
import { provideIonicAngular } from '@ionic/angular/standalone'
import { register as registerSwiperComponents } from 'swiper/element/bundle'
import { routes } from './app/app.routes'

// Register swiper webcomponents before bootstrapping.
registerSwiperComponents()

if (environment.production) {
  enableProdMode()
}

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    importProvidersFrom(BrowserModule),
    MediaService,
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideHttpClient(withInterceptorsFromDi(), withJsonpSupport()),
    provideIonicAngular({ mode: 'md' }),
  ],
}).catch((err) => console.log(err))
