import { AfterViewInit, Component, OnInit, ViewEncapsulation } from '@angular/core'
import type { NgForm } from '@angular/forms'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import {
  AlertController,
  IonCheckbox,
  IonContent,
  IonIcon,
  IonInput,
  IonSelect,
  IonSelectOption,
  NavController,
} from '@ionic/angular/standalone'
import Keyboard from 'simple-keyboard'
import { ActivityIndicatorService } from '../activity-indicator.service'
import { registerLucideIcons } from '../icons/lucide-icons'
import { CategoryType, Media, MediaSorting } from '../media'
import { MediaService } from '../media.service'
import { PlayerCmds, PlayerService } from '../player.service'
import { SettingsHeaderComponent } from '../settings-header/settings-header.component'
import { SpotifyService } from '../spotify.service'

@Component({
  selector: 'app-add',
  encapsulation: ViewEncapsulation.None,
  templateUrl: './add.page.html',
  styleUrls: ['./add.page.scss'],
  imports: [
    FormsModule,
    IonCheckbox,
    IonContent,
    IonIcon,
    IonInput,
    IonSelect,
    IonSelectOption,
    SettingsHeaderComponent,
  ],
})
export class AddPage implements OnInit, AfterViewInit {
  source = 'spotify'
  category: CategoryType = 'audiobook'
  sourceType = 'spotifyURL'
  sorting: MediaSorting = MediaSorting.AlphabeticalAscending
  keyboard: Keyboard
  selectedInputElem: any
  valid = false
  editMedia: Media
  edit = false
  shuffle = false
  firstInput = true
  validateState: boolean
  aPartOfAll = false
  aPartOfAllMin: number
  aPartOfAllMax: number
  index: number
  activityIndicatorVisible = false
  isKeyboardVisible = false

  constructor(
    private mediaService: MediaService,
    private navController: NavController,
    _route: ActivatedRoute,
    private router: Router,
    private playerService: PlayerService,
    private spotifyService: SpotifyService,
    public alertController: AlertController,
    private activityIndicatorService: ActivityIndicatorService,
  ) {
    if (this.router.currentNavigation()?.extras.state) {
      this.editMedia = this.router.currentNavigation().extras.state.media
      this.edit = true
    }
    registerLucideIcons()
  }

  ngOnInit() {
    if (this.edit) {
      this.index = this.editMedia.index
      this.source = this.editMedia.type
      this.category = this.editMedia.category
      this.shuffle = this.editMedia.shuffle
      this.aPartOfAll = this.editMedia.aPartOfAll
      this.aPartOfAllMin = this.editMedia.aPartOfAllMin
      this.aPartOfAllMax = this.editMedia.aPartOfAllMax
      this.sorting = this.editMedia.sorting ?? MediaSorting.AlphabeticalAscending
      if (this.source === 'spotify' && this.editMedia?.query) {
        this.sourceType = 'spotifySearch'
      } else if (
        this.source === 'spotify' &&
        (this.editMedia?.artistid ||
          this.editMedia?.id ||
          this.editMedia?.showid ||
          this.editMedia?.id ||
          this.editMedia?.playlistid ||
          this.editMedia?.audiobookid)
      ) {
        this.sourceType = 'spotifyURL'
        if (this.editMedia?.id) {
          this.editMedia.spotify_url = `https://open.spotify.com/album/${this.editMedia?.id}`
        } else if (this.editMedia?.artistid) {
          this.editMedia.spotify_url = `https://open.spotify.com/artist/${this.editMedia?.artistid}`
        } else if (this.editMedia?.showid) {
          this.editMedia.spotify_url = `https://open.spotify.com/show/${this.editMedia?.showid}`
        } else if (this.editMedia?.audiobookid) {
          this.editMedia.spotify_url = `https://open.spotify.com/show/${this.editMedia?.audiobookid}`
        } else if (this.editMedia?.playlistid) {
          this.editMedia.spotify_url = `https://open.spotify.com/playlist/${this.editMedia?.playlistid}`
        }
      } else if (this.source === 'radio' && this.editMedia?.id) {
        this.sourceType = 'streamURL'
      } else if (this.source === 'rss') {
        this.sourceType = 'rssURL'
      }
    }
  }

  ngAfterViewInit() {
    this.keyboard = new Keyboard({
      onChange: (input) => {
        this.selectedInputElem.value = input
        this.validate()
      },
      onKeyPress: (button) => {
        this.handleLayoutChange(button)
      },
      theme: 'hg-theme-default hg-theme-ios',
      layout: {
        default: [
          'q w e r t z u i o p ü',
          'a s d f g h j k l ö ä',
          '{shift} y x c v b n m {shift}',
          '{alt} {collapse} , {space} . {bksp}',
        ],
        shift: [
          'Q W E R T Z U I O P Ü',
          'A S D F G H J K L Ö Ä',
          '{shiftactivated} Y X C V B N M {shift}',
          '{alt} {collapse} , {space} . {bksp}',
        ],
        alt: [
          '1 2 3 4 5 6 7 8 9 0 =',
          `% @ # $ § & * ° ^ / \\ ' "`,
          '_ ~ - + ; : { } [ ] ( )',
          '{default} {collapse} ! {space} ? {bksp}',
        ],
      },
      display: {
        '{alt}': '123',
        '{smileys}': '\uD83D\uDE03',
        '{shift}': '⇧',
        '{shiftactivated}': '⇧',
        '{enter}': '⮐ ',
        '{bksp}': '⌫',
        '{altright}': '123',
        '{downkeyboard}': '🞃',
        '{space}': ' ',
        '{default}': 'ABC',
        '{back}': '⇦',
        '{collapse}': '▼',
      },
    })

    this.hideKeyboard()
    this.selectedInputElem = document.querySelector('.add-form ion-input')

    this.validate()
  }

  ionViewDidLeave() {
    if (this.activityIndicatorVisible) {
      this.activityIndicatorService.dismiss()
      this.activityIndicatorVisible = false
    }
  }

  ionViewWillLeave() {
    this.edit = false
  }

  cancelButtonPressed() {
    this.navController.back()
  }

  sourceTypeChanged(event: any) {
    this.sourceType = event.detail.value

    this.keyboard.clearInput('spotifyURL')
    this.keyboard.clearInput('spotifySearch')
    this.keyboard.clearInput('rssURL')
    this.keyboard.clearInput('streamURL')

    this.aPartOfAll = false
    this.shuffle = false

    this.validate()
  }

  focusChanged(event: any) {
    this.selectedInputElem = event.target

    if (!this.isKeyboardVisible) {
      this.showKeyboard()
    }

    this.keyboard.setOptions({
      disableCaretPositioning: false,
      inputName: event.target.name,
    })

    if (this.edit) {
      switch (event.target.name) {
        case 'label':
          this.keyboard.setInput(this.editMedia.artist, event.target.name)
          break
        case 'title':
          this.keyboard.setInput(this.editMedia.title, event.target.name)
          break
        case 'spotifyURL':
          this.keyboard.setInput(this.editMedia.spotify_url, event.target.name)
          break
        case 'labelcover':
          this.keyboard.setInput(this.editMedia.artistcover, event.target.name)
          break
        case 'cover':
          this.keyboard.setInput(this.editMedia.cover, event.target.name)
          break
        case 'spotifySearch':
          this.keyboard.setInput(this.editMedia.query, event.target.name)
          break
        case 'spotify_aPartOfAllMin':
          this.keyboard.setInput(this.editMedia.aPartOfAllMin?.toString(), event.target.name)
          break
        case 'spotify_aPartOfAllMax':
          this.keyboard.setInput(this.editMedia.aPartOfAllMax?.toString(), event.target.name)
          break
        case 'rssURL':
          this.keyboard.setInput(this.editMedia.id, event.target.name)
          break
        case 'streamURL':
          this.keyboard.setInput(this.editMedia.id, event.target.name)
          break
      }
    }
  }

  inputChanged(event: any) {
    this.keyboard.setInput(event.target.value, event.target.name)
    this.validate()
  }

  handleLayoutChange(button) {
    const currentLayout = this.keyboard.options.layoutName
    let layout: string

    switch (button) {
      case '{collapse}':
        this.hideKeyboard()
        return
      case '{shift}':
      case '{shiftactivated}':
      case '{default}':
        layout = currentLayout === 'default' ? 'shift' : 'default'
        break
      case '{alt}':
      case '{altright}':
        layout = currentLayout === 'alt' ? 'default' : 'alt'
        break
      case '{smileys}':
        layout = currentLayout === 'smileys' ? 'default' : 'smileys'
        break
      default:
        break
    }

    if (layout) {
      this.keyboard.setOptions({
        layoutName: layout,
      })
    }
  }

  categoryChanged(event: any) {
    this.category = event.detail.value
    this.shuffle = false
    this.validate()
  }

  spotifyIDfetcher(url: string, keyword: string) {
    const keywordIndex = url.indexOf(keyword)
    const questionMarkIndex = url.indexOf('?', keywordIndex)

    // Überprüfen, ob ein Fragezeichen gefunden wurde
    if (questionMarkIndex !== -1) {
      // Die Zeichen zwischen dem Schlüsselwort und dem ersten Fragezeichen extrahieren
      const substring = url.substring(keywordIndex + keyword.length, questionMarkIndex)
      return substring
    }
    // Wenn kein Fragezeichen gefunden wurde, die Zeichen bis zum Ende der URL extrahieren
    const substring = url.substring(keywordIndex + keyword.length)
    return substring
  }

  m3uStreamfetcher(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Herunterladen des Inhalts der m3u-Datei
      fetch(url)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`)
          }
          return response.text()
        })
        .then((m3uInhalt) => {
          // RegExp zum Extrahieren der ersten URL
          const urlRegExp = /(?:^|\r?\n)(?:\s*#.*\r?\n)*\s*(https?:\/\/\S+)/i
          const match = m3uInhalt.match(urlRegExp)

          if (match?.[1]) {
            const ersteURL = match[1]
            resolve(ersteURL)
          } else {
            reject(new Error('No URL found.'))
          }
        })
        .catch((error) => {
          reject(error)
        })
    })
  }

  submit(form: NgForm) {
    this.activityIndicatorService.create().then((indicator) => {
      this.activityIndicatorVisible = true
      indicator.present().then(() => {
        if (this.sourceType === 'spotifyURL' || this.sourceType === 'spotifySearch') {
          this.source = 'spotify'
        } else if (this.sourceType === 'streamURL') {
          this.source = 'radio'
        } else if (this.sourceType === 'rssURL') {
          this.source = 'rss'
        }

        const media: Media = {
          index: this.index,
          type: this.source,
          category: this.category,
          shuffle: this.shuffle,
          aPartOfAll: this.aPartOfAll,
          aPartOfAllMin: this.aPartOfAllMin,
          aPartOfAllMax: this.aPartOfAllMax,
          sorting: this.sorting,
        }

        if (form.form.value.label?.length) {
          media.artist = form.form.value.label
        }
        if (form.form.value.labelcover?.length) {
          media.artistcover = form.form.value.labelcover
        }
        if (form.form.value.cover?.length) {
          media.cover = form.form.value.cover
        }
        if (form.form.value.title?.length) {
          media.title = form.form.value.title
        }
        if (form.form.value.rssURL?.length) {
          if (form.form.value.rssURL.startsWith('https://')) {
            // Ersetze 'https' durch 'http'
            form.form.value.rssURL = form.form.value.rssURL.replace('https://', 'http://')
          }
          media.id = form.form.value.rssURL
        }
        if (form.form.value.spotifySearch?.length) {
          media.query = form.form.value.spotifySearch
        }
        if (form.form.value.streamURL?.length) {
          media.id = form.form.value.streamURL
          if (media.id.endsWith('.m3u')) {
            this.m3uStreamfetcher(media.id)
              .then((firstURL) => {
                console.log('First found URL:', firstURL)
                media.id = firstURL
              })
              .catch((error) => {
                console.error('Error for extract url from m3u:', error)
              })
          }
          if (media.id.startsWith('https://')) {
            // Ersetze 'https' durch 'http'
            media.id = media.id.replace('https://', 'http://')
          }
        }
        if (form.form.value.spotifyURL?.length) {
          media.spotify_url = form.form.value.spotifyURL
          if (media.spotify_url.startsWith('https://open.spotify.com/')) {
            if (media.spotify_url.includes('playlist/')) {
              media.playlistid = this.spotifyIDfetcher(media.spotify_url, 'playlist/')
            } else if (media.spotify_url.includes('artist/')) {
              media.artistid = this.spotifyIDfetcher(media.spotify_url, 'artist/')
            } else if (media.spotify_url.includes('album/')) {
              media.id = this.spotifyIDfetcher(media.spotify_url, 'album/')
            } else if (media.spotify_url.includes('show/')) {
              media.showid = this.spotifyIDfetcher(media.spotify_url, 'show/')
            }
          }
        }
        this.save(media, form)
      })
    })
  }

  async save(media: Media, form: NgForm) {
    if (this.source === 'spotify' && this.sourceType === 'spotifyURL') {
      let spotifyValidationResult: boolean
      try {
        spotifyValidationResult = await this.validateSpotify(media)
      } catch (_error) {
        spotifyValidationResult = false
      }
      if (!spotifyValidationResult) {
        this.activityIndicatorService.dismiss()
        this.activityIndicatorVisible = false

        let spotifyError = 'Die ID ist ungültig oder es besteht keine Internetverbindung.'
        if (!media.playlistid && !media.artistid && !media.id && !media.showid) {
          spotifyError =
            'Die URL ist ungültig. Sie muss mit "https://open.spotify.com/" beginnen und "playlist/", "artist/", "album/" oder "show/" enthalten.'
        }

        const alert = await this.alertController.create({
          cssClass: 'alert',
          header: 'Hinweis',
          message: spotifyError,
          buttons: [
            {
              text: 'OK',
            },
          ],
        })

        await alert.present()
        return
      }

      const isAudiobook = await this.isAudiobook(media)
      if (isAudiobook) {
        media.audiobookid = media.showid
        media.showid = null
      }
    }

    if (this.edit) {
      this.mediaService.editRawMediaAtIndex(this.editMedia.index, media)
      setTimeout(async () => {
        const check = this.mediaService.getResponse()
        console.log(`write check: ${check}`)
        if (check === 'error' || check === 'locked') {
          this.activityIndicatorService.dismiss()
          this.activityIndicatorVisible = false
          if (check === 'error') {
            const alert = await this.alertController.create({
              cssClass: 'alert',
              header: 'Hinweis',
              message: 'Der Eintrag konnte nicht gespeichert werden.',
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
              header: 'Hinweis',
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
          form.reset()

          this.keyboard.clearInput('label')
          this.keyboard.clearInput('title')
          this.keyboard.clearInput('spotifyURL')
          this.keyboard.clearInput('spotifySearch')
          this.keyboard.clearInput('rssURL')
          this.keyboard.clearInput('streamURL')
          this.keyboard.clearInput('labelcover')
          this.keyboard.clearInput('cover')
          this.keyboard.clearInput('spotify_aPartOfAllMin')
          this.keyboard.clearInput('spotify_aPartOfAllMax')

          this.validate()

          setTimeout(() => {
            this.navController.back()
          }, 2000)
        }
      }, 2000)
    } else {
      this.mediaService.addRawMedia(media)
      setTimeout(async () => {
        const check = this.mediaService.getResponse()
        console.log(`write check: ${check}`)
        if (check === 'error' || check === 'locked') {
          this.activityIndicatorService.dismiss()
          this.activityIndicatorVisible = false
          if (check === 'error') {
            const alert = await this.alertController.create({
              cssClass: 'alert',
              header: 'Hinweis',
              message: 'Der Eintrag konnte nicht gespeichert werden.',
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
              header: 'Hinweis',
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
          form.reset()

          this.keyboard.clearInput('label')
          this.keyboard.clearInput('title')
          this.keyboard.clearInput('spotifyURL')
          this.keyboard.clearInput('spotifySearch')
          this.keyboard.clearInput('rssURL')
          this.keyboard.clearInput('streamURL')
          this.keyboard.clearInput('labelcover')
          this.keyboard.clearInput('cover')
          this.keyboard.clearInput('spotify_aPartOfAllMin')
          this.keyboard.clearInput('spotify_aPartOfAllMax')

          this.validate()

          this.playerService.sendCmd(PlayerCmds.INDEX)

          setTimeout(() => {
            this.navController.back()
          }, 2000)
        }
      }, 2000)
    }
  }

  async validateSpotify(media: Media): Promise<boolean> {
    let validationResult: Promise<boolean> = Promise.resolve(false)
    if (media.playlistid) {
      validationResult = this.spotifyService.validateSpotify(media.playlistid, 'playlist')
    } else if (media.artistid) {
      validationResult = this.spotifyService.validateSpotify(media.artistid, 'artist')
    } else if (media.id) {
      validationResult = this.spotifyService.validateSpotify(media.id, 'album')
    } else if (media.showid) {
      validationResult = this.spotifyService.validateSpotify(media.showid, 'show')
    }

    const timeout: Promise<boolean> = new Promise((resolve) => setTimeout(() => resolve(false), 30000))

    return Promise.race([validationResult, timeout])
  }

  async isAudiobook(media: Media): Promise<boolean> {
    let validationResult: Promise<boolean> = Promise.resolve(false)
    if (media.showid) {
      validationResult = this.spotifyService.validateSpotify(media.showid, 'audiobook')
    }

    const timeout: Promise<boolean> = new Promise((resolve) => setTimeout(() => resolve(false), 30000))

    return Promise.race([validationResult, timeout])
  }

  validate() {
    if (this.sourceType === 'spotifyURL' || this.sourceType === 'spotifySearch' || this.sourceType === 'rssURL') {
      const label = this.keyboard.getInput('label')
      const spotifyURL = this.keyboard.getInput('spotifyURL')
      const spotifySearch = this.keyboard.getInput('spotifySearch')
      const rssURL = this.keyboard.getInput('rssURL')
      const labelcover = this.keyboard.getInput('labelcover')
      const cover = this.keyboard.getInput('cover')

      this.valid =
        spotifyURL?.length > 0 ||
        (spotifySearch?.length > 0 && label?.length > 0) ||
        (rssURL?.length > 0 && label?.length > 0) ||
        (this.edit && (spotifyURL?.length > 0 || label?.length > 0 || labelcover?.length > 0 || cover?.length > 0)) ||
        (this.edit &&
          (spotifySearch?.length > 0 || label?.length > 0 || labelcover?.length > 0 || cover?.length > 0)) ||
        (this.edit && (rssURL?.length > 0 || label?.length > 0 || labelcover?.length > 0 || cover?.length > 0)) ||
        (this.edit && this.shuffle !== this.editMedia?.shuffle) ||
        (this.edit && this.aPartOfAll !== this.editMedia?.aPartOfAll) ||
        (this.edit && this.aPartOfAllMin !== this.editMedia?.aPartOfAllMin) ||
        (this.edit && this.aPartOfAllMax !== this.editMedia?.aPartOfAllMax) ||
        (this.edit && this.sorting !== this.editMedia?.sorting)
    } else if (this.sourceType === 'streamURL') {
      const label = this.keyboard.getInput('label')
      const streamURL = this.keyboard.getInput('streamURL')
      const labelcover = this.keyboard.getInput('labelcover')
      const cover = this.keyboard.getInput('cover')
      const title = this.keyboard.getInput('title')

      this.valid =
        (streamURL?.length > 0 && label?.length > 0 && title?.length > 0) ||
        (this.edit &&
          (title?.length > 0 ||
            streamURL?.length > 0 ||
            label?.length > 0 ||
            labelcover?.length > 0 ||
            cover?.length > 0))
    }
  }

  /** The keyboard is docked in its own panel; the whole panel is shown or hidden. */
  private showKeyboard() {
    const panel = document.querySelector('.keyboard-panel') as HTMLElement
    if (panel) {
      panel.style.display = 'block'
      this.isKeyboardVisible = true
    }
  }

  private hideKeyboard() {
    const panel = document.querySelector('.keyboard-panel') as HTMLElement
    if (panel) {
      panel.style.display = 'none'
      this.isKeyboardVisible = false
    }
  }
}
