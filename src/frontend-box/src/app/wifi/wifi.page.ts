import { AfterViewInit, Component, OnInit, ViewChild, ViewEncapsulation } from '@angular/core'
import { AlertController, IonSelect, IonTitle, NavController } from '@ionic/angular/standalone'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCol,
  IonContent,
  IonGrid,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonRow,
  IonSegment,
  IonToolbar,
} from '@ionic/angular/standalone'
import { PlayerCmds, PlayerService } from '../player.service'
import { refresh, wifiOutline } from 'ionicons/icons'

import { FormsModule } from '@angular/forms'
import Keyboard from 'simple-keyboard'
import { MediaService } from '../media.service'
import type { NgForm } from '@angular/forms'
import type { WLAN } from '../wlan'
import { addIcons } from 'ionicons'

@Component({
  selector: 'app-wifi',
  encapsulation: ViewEncapsulation.None,
  templateUrl: './wifi.page.html',
  styleUrls: ['./wifi.page.scss'],
  standalone: true,
  imports: [
    IonTitle,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonButton,
    IonIcon,
    IonContent,
    IonGrid,
    IonRow,
    IonCol,
    IonItem,
    IonInput,
  ],
})
export class WifiPage implements OnInit, AfterViewInit {
  @ViewChild('segment', { static: false }) segment: IonSegment
  @ViewChild('select', { static: false }) select: IonSelect

  @ViewChild('wlan_segment', { static: false }) wlanSegment: IonSelect

  @ViewChild('wlan_ssid', { static: false }) wlanSsid: IonInput
  @ViewChild('wlan_pw', { static: false }) wlanPw: IonInput

  keyboard: Keyboard
  selectedInputElem: any
  valid = false

  constructor(
    private mediaService: MediaService,
    private navController: NavController,
    public alertController: AlertController,
    private playerService: PlayerService,
  ) {
    addIcons({ refresh, wifiOutline })
  }

  ngOnInit() {}

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
          '{alt} , {space} . {bksp}',
        ],
        shift: [
          'Q W E R T Z U I O P Ü',
          'A S D F G H J K L Ö Ä',
          '{shiftactivated} Y X C V B N M {shift}',
          '{alt} , {space} . {bksp}',
        ],
        alt: [
          '1 2 3 4 5 6 7 8 9 0 =',
          `% @ # $ § & * ° ^ / \\ ' "`,
          '_ ~ - + ; : { } [ ] ( )',
          '{default} ! {space} ? {bksp}',
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
      },
    })

    this.selectedInputElem = document.querySelector('ion-input:first-child')
  }

  cancelButtonPressed() {
    this.navController.back()
  }

  focusChanged(event: any) {
    this.selectedInputElem = event.target

    this.keyboard.setOptions({
      disableCaretPositioning: false,
      inputName: event.target.name,
    })
  }

  inputChanged(event: any) {
    this.keyboard.setInput(event.target.value, event.target.name)
    this.validate()
  }

  handleLayoutChange(button) {
    const currentLayout = this.keyboard.options.layoutName
    let layout: string

    switch (button) {
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

  submit(form: NgForm) {
    const wlan: WLAN = {
      category: 'WLAN',
    }

    const wlanSsid = this.keyboard.getInput('wlan_ssid') ?? ''
    const wlanPw = this.keyboard.getInput('wlan_pw') ?? ''

    if (wlanSsid.length) {
      wlan.ssid = wlanSsid
    }
    if (wlanPw.length) {
      wlan.pw = wlanPw
    }

    this.mediaService.addWLAN(wlan)

    form.reset()

    this.keyboard.clearInput('wlan_ssid')
    this.keyboard.clearInput('wlan_pw')

    this.validate()

    this.navController.back()
  }

  validate() {
    const wlanSsid = this.keyboard.getInput('wlan_ssid')
    const wlanPw = this.keyboard.getInput('wlan_pw')

    this.valid = wlanSsid.length > 0 && (wlanPw.length === 0 || (wlanPw.length >= 8 && wlanPw.length <= 63))
  }

  async wifiRestartButtonPressed() {
    const alert = await this.alertController.create({
      cssClass: 'alert',
      header: 'Restart Wifi',
      message: 'Do you want to restart the wifi network?',
      buttons: [
        {
          text: 'Restart',
          handler: () => {
            this.playerService.sendCmd(PlayerCmds.NETWORKRESTART)
          },
        },
        {
          text: 'Cancel',
        },
      ],
    })

    await alert.present()
  }

  async enableWifiOnButtonPressed() {
    const alert = await this.alertController.create({
      cssClass: 'alert',
      header: 'OnBoard-Wifi',
      message: 'Enable OnBoard-Wifi.',
      buttons: [
        {
          text: 'Enable',
          handler: () => {
            this.playerService.sendCmd(PlayerCmds.ENABLEWIFI)
          },
        },
        {
          text: 'Cancel',
        },
      ],
    })

    await alert.present()
  }
}
