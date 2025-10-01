import { provideHttpClient, withInterceptorsFromDi, withJsonpSupport } from '@angular/common/http'
import { enableProdMode, importProvidersFrom } from '@angular/core'
import { BrowserModule, bootstrapApplication } from '@angular/platform-browser'
import { provideRouter, RouteReuseStrategy } from '@angular/router'
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone'
import { register as registerSwiperComponents } from 'swiper/element/bundle'
import { AppComponent } from './app/app.component'
import { routes } from './app/app.routes'
import { environment } from './environments/environment'

// Register swiper webcomponents before bootstrapping.
registerSwiperComponents()

if (environment.production) {
  enableProdMode()
}

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    importProvidersFrom(BrowserModule),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideHttpClient(withInterceptorsFromDi(), withJsonpSupport()),
    provideIonicAngular({ mode: 'md' }),
  ],
}).catch((err) => console.log(err))
