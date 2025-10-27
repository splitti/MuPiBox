import { Routes } from '@angular/router'

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
    pathMatch: 'full',
  },
  {
    path: 'add',
    loadComponent: () => import('./add-edit/add-edit.page').then((m) => m.AddEditPage),
    pathMatch: 'full',
  },
  {
    path: 'edit/:id',
    loadComponent: () => import('./add-edit/add-edit.page').then((m) => m.AddEditPage),
    pathMatch: 'full',
  },
]
