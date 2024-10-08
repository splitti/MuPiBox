import { RouterModule, Routes } from '@angular/router'

import { NgModule } from '@angular/core'
import { HomePage } from './home.page'

const routes: Routes = [
  {
    path: '',
    component: HomePage,
  },
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class HomePageRoutingModule {}
