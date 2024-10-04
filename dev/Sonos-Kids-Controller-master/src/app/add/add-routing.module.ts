import { NgModule } from '@angular/core'
import { RouterModule, type Routes } from '@angular/router'

import { AddPage } from './add.page'

const routes: Routes = [
  {
    path: '',
    component: AddPage,
  },
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AddPageRoutingModule {}
