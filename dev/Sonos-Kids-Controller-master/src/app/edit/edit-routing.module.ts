import { NgModule } from '@angular/core'
import { RouterModule, type Routes } from '@angular/router'
import { EditPage } from './edit.page'

const routes: Routes = [
  {
    path: '',
    component: EditPage,
  },
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class EditPageRoutingModule {}
