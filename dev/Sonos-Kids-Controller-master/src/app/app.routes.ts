import { AddPage } from './add/add.page'
import { AdminPage } from './admin/admin.page'
import { EditPage } from './edit/edit.page'
import { HomePage } from './home/home.page'
import { MedialistPage } from './medialist/medialist.page'
import { PlayerPage } from './player/player.page'
import { Routes } from '@angular/router'

export const routes: Routes = [
  {
    path: 'home',
    component: HomePage,
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
  {
    path: 'medialist',
    component: MedialistPage,
  },
  {
    path: 'player',
    component: PlayerPage,
  },
  {
    path: 'edit',
    component: EditPage,
  },
  {
    path: 'admin',
    component: AdminPage,
  },
  {
    path: 'add',
    component: AddPage,
  },
]
