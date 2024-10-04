import { NgModule } from '@angular/core'
import { RouterModule, type Routes } from '@angular/router'
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
