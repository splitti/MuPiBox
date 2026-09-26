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
    // preview of the overlay texts for the admin interface (Display texts): /text-preview?screen=blocked|quiet|parents
    path: 'text-preview',
    loadComponent: () => import('./text-preview/text-preview.page').then((m) => m.TextPreviewPage),
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
    path: 'wifi/add',
    loadComponent: () => import('./wifi/wifi-add.page').then((m) => m.WifiAddPage),
  },
  {
    path: 'bluetooth',
    loadComponent: () => import('./bluetooth/bluetooth.page').then((m) => m.BluetoothPage),
  },
  {
    path: 'add',
    loadComponent: () => import('./add/add.page').then((m) => m.AddPage),
  },
]
