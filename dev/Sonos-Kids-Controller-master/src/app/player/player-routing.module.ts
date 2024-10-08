import { RouterModule, Routes } from '@angular/router'

import { NgModule } from '@angular/core'
import { PlayerPage } from './player.page'

const routes: Routes = [
  {
    path: '',
    component: PlayerPage,
  },
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PlayerPageRoutingModule {}
