import { RouterModule, Routes } from '@angular/router'

import { NgModule } from '@angular/core'
import { AdminPage } from './admin.page'

const routes: Routes = [
  {
    path: '',
    component: AdminPage,
  },
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AdminPageRoutingModule {}
