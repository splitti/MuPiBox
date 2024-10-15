import { provideHttpClient, withInterceptorsFromDi, withJsonpSupport } from '@angular/common/http'
import { enableProdMode, importProvidersFrom } from '@angular/core'
import { BrowserModule, bootstrapApplication } from '@angular/platform-browser'
import { RouteReuseStrategy, provideRouter } from '@angular/router'
import { IonicModule, IonicRouteStrategy } from '@ionic/angular'

import { register as registerSwiperComponents } from 'swiper/element/bundle'
import { AppComponent } from './app/app.component'
import { routes } from './app/app.routes'
import { MediaService } from './app/media.service'
import { environment } from './environments/environment'

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
