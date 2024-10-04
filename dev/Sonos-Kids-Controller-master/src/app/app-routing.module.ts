import { NgModule } from '@angular/core'
import { PreloadAllModules, RouterModule, type Routes } from '@angular/router'
import { RouteResolver } from './route.resolver'

const routes: Routes = [
  {
    path: 'home',
    loadChildren: () => import('./home/home.module').then((m) => m.HomePageModule),
    // resolve: {
    //   data: RouteResolver
    // }
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
  {
    path: 'medialist',
    loadChildren: () => import('./medialist/medialist.module').then((m) => m.MedialistPageModule),
  },
  {
    path: 'player',
    loadChildren: () => import('./player/player.module').then((m) => m.PlayerPageModule),
  },
  {
    path: 'edit',
    loadChildren: () => import('./edit/edit.module').then((m) => m.EditPageModule),
  },
  {
    path: 'admin',
    loadChildren: () => import('./admin/admin.module').then((m) => m.AdminPageModule),
  },
  {
    path: 'add',
    loadChildren: () => import('./add/add.module').then((m) => m.AddPageModule),
  },
]

@NgModule({
  imports: [RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })],
  exports: [RouterModule],
  providers: [RouteResolver],
})
export class AppRoutingModule {}
