import { RouterModule, Routes } from '@angular/router'

import { NgModule } from '@angular/core'
import { MedialistPage } from './medialist.page'

const routes: Routes = [
  {
    path: '',
    component: MedialistPage,
  },
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MedialistPageRoutingModule {}
