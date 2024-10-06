import { BrowserModule, bootstrapApplication } from '@angular/platform-browser'
import { IonicModule, IonicRouteStrategy } from '@ionic/angular'
import { RouteReuseStrategy, provideRouter } from '@angular/router'
import { enableProdMode, importProvidersFrom } from '@angular/core'
import { provideHttpClient, withInterceptorsFromDi, withJsonpSupport } from '@angular/common/http'

import { AppComponent } from './app/app.component'
import { MediaService } from './app/media.service'
import { environment } from './environments/environment'
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
    importProvidersFrom(
      BrowserModule,
      IonicModule.forRoot({
        mode: 'md',
      }),
    ),
    MediaService,
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideHttpClient(withInterceptorsFromDi(), withJsonpSupport()),
  ],
}).catch((err) => console.log(err))
