import { Routes } from '@angular/router'

export const routes: Routes = [
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
  {
    path: 'resume',
    loadComponent: () => import('./resume/resume.page').then((m) => m.ResumePage),
  },
  {
    path: 'medialist',
    loadComponent: () => import('./medialist/medialist.page').then((m) => m.MedialistPage),
  },
  {
    path: 'media/:category/:folder',
    loadComponent: () => import('./medialist/medialist.page').then((m) => m.MedialistPage),
  },
  {
    path: 'player',
    loadComponent: () => import('./player/player.page').then((m) => m.PlayerPage),
  },
  {
    path: 'edit',
    loadComponent: () => import('./edit/edit.page').then((m) => m.EditPage),
  },
  {
    path: 'settings',
    loadComponent: () => import('./settings/settings.page').then((m) => m.SettingsPage),
  },
  {
    path: 'wifi',
    loadComponent: () => import('./wifi/wifi.page').then((m) => m.WifiPage),
  },
  {
    path: 'add',
    loadComponent: () => import('./add/add.page').then((m) => m.AddPage),
  },
  {
    path: 'settings',
    loadComponent: () => import('./settings/settings.page').then((m) => m.SettingsPage),
  },
]
