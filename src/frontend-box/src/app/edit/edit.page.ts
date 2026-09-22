import { AsyncPipe } from '@angular/common'
import { Component, OnInit } from '@angular/core'
import { NavigationExtras, Router } from '@angular/router'
import { AlertController, IonContent, IonIcon } from '@ionic/angular/standalone'
import type { Observable } from 'rxjs'
import { ActivityIndicatorService } from '../activity-indicator.service'
import { registerLucideIcons } from '../icons/lucide-icons'
import type { Media } from '../media'
import { MediaService } from '../media.service'
import { PlayerCmds, PlayerService } from '../player.service'
import { SettingsHeaderComponent } from '../settings-header/settings-header.component'

const CATEGORY_LABELS: Record<string, string> = {
  audiobook: 'Hörspiele',
  music: 'Musik',
  other: 'Podcasts & Radio',
}

@Component({
  selector: 'app-edit',
  templateUrl: './edit.page.html',
  styleUrls: ['./edit.page.scss'],
  imports: [AsyncPipe, IonContent, IonIcon, SettingsHeaderComponent],
})
export class EditPage implements OnInit {
  media: Observable<Media[]>
  activityIndicatorVisible = false

  constructor(
    private mediaService: MediaService,
    public alertController: AlertController,
    private playerService: PlayerService,
    private router: Router,
    private activityIndicatorService: ActivityIndicatorService,
  ) {
    registerLucideIcons()
  }

  ngOnInit() {
    this.media = this.mediaService.fetchRawMedia()
  }

  /** Icon for the source of an entry. */
  protected typeIcon(item: Media): string {
    switch (item.type) {
      case 'rss':
        return 'lucide-podcast'
      case 'radio':
        return 'lucide-radio'
      case 'library':
        return 'lucide-headphones'
      default:
        return 'lucide-music'
    }
  }

  /** Summary line: label and title, or what the entry searches for. */
  protected primaryText(item: Media): string {
    const parts = [item.artist, item.title].filter((part) => part)
    if (parts.length > 0) {
      return parts.join(' – ')
    }
    return (
      item.query ||
      item.id ||
      item.artistid ||
      item.showid ||
      item.playlistid ||
      item.audiobookid ||
      `Eintrag ${item.index}`
    )
  }

  /** Details line: category, source and the ids / options that are set. */
  protected detailText(item: Media): string {
    const parts: string[] = [CATEGORY_LABELS[item.category || 'audiobook'] ?? item.category, item.type]
    if (item.query) parts.push(`Suche: ${item.query}`)
    if (item.id) parts.push(`ID: ${item.id}`)
    if (item.artistid) parts.push(`Artist: ${item.artistid}`)
    if (item.showid) parts.push(`Show: ${item.showid}`)
    if (item.audiobookid) parts.push(`Hörbuch: ${item.audiobookid}`)
    if (item.playlistid) parts.push(`Playlist: ${item.playlistid}`)
    if (item.shuffle) parts.push('Zufall')
    if (item.aPartOfAll) parts.push(`Intervall ${item.aPartOfAllMin ?? 0} – ${item.aPartOfAllMax || 'Ende'}`)
    if (item.sorting) parts.push(`Sortierung: ${item.sorting}`)
    return parts.join(' · ')
  }

  async deleteButtonPressed(item: Media) {
    const alert = await this.alertController.create({
      cssClass: 'alert',
      header: 'Eintrag löschen',
      message: 'Soll der Eintrag aus der Bibliothek (und bei lokalen Medien vom Speicher) gelöscht werden?',
      buttons: [
        {
          text: 'Löschen',
          handler: () => {
            this.activityIndicatorService.create().then((indicator) => {
              this.activityIndicatorVisible = true
              indicator.present().then(() => {
                this.mediaService.deleteRawMediaAtIndex(item.index)
                setTimeout(async () => {
                  const check = this.mediaService.getResponse()
                  console.log(`write check: ${check}`)
                  if (check === 'error' || check === 'locked') {
                    this.activityIndicatorService.dismiss()
                    this.activityIndicatorVisible = false
                    if (check === 'error') {
                      const alert = await this.alertController.create({
                        cssClass: 'alert',
                        header: 'Fehler',
                        message: 'Der Eintrag konnte nicht gelöscht werden.',
                        buttons: [
                          {
                            text: 'OK',
                          },
                        ],
                      })
                      await alert.present()
                    } else if (check === 'locked') {
                      const alert = await this.alertController.create({
                        cssClass: 'alert',
                        header: 'Fehler',
                        message: 'Datei gesperrt, bitte gleich noch einmal versuchen.',
                        buttons: [
                          {
                            text: 'OK',
                          },
                        ],
                      })
                      await alert.present()
                    }
                  } else {
                    console.log(`Index: ${item.index}`)
                    if (item.type === 'library') {
                      this.playerService.deleteLocal(item)
                    }
                    this.playerService.sendCmd(PlayerCmds.INDEX)
                    setTimeout(() => {
                      this.media = this.mediaService.fetchRawMedia()
                      this.activityIndicatorService.dismiss()
                      this.activityIndicatorVisible = false
                    }, 2000)
                  }
                }, 2000)
              })
            })
          },
        },
        {
          text: 'Abbrechen',
        },
      ],
    })

    await alert.present()
  }

  editButtonPreddes(item: Media) {
    this.activityIndicatorService.create().then((indicator) => {
      this.activityIndicatorVisible = true
      indicator.present().then(() => {
        const navigationExtras: NavigationExtras = {
          state: {
            media: item,
          },
        }
        this.router.navigate(['/add'], navigationExtras)
      })
    })
  }

  ionViewWillEnter() {
    this.media = this.mediaService.fetchRawMedia()
  }

  ionViewDidLeave() {
    if (this.activityIndicatorVisible) {
      this.activityIndicatorService.dismiss()
      this.activityIndicatorVisible = false
    }
  }

  addButtonPressed() {
    this.router.navigate(['/add'])
  }

  async clearResumePressed() {
    const alert = await this.alertController.create({
      cssClass: 'alert',
      header: 'Weiterhören leeren',
      message: 'Sollen alle Weiterhören-Einträge gelöscht werden?',
      buttons: [
        {
          text: 'Leeren',
          handler: () => {
            this.playerService.sendCmd(PlayerCmds.CLEARRESUME)
            setTimeout(() => {
              this.media = this.mediaService.fetchRawMedia()
            }, 2000)
          },
        },
        {
          text: 'Abbrechen',
        },
      ],
    })

    await alert.present()
  }
}
