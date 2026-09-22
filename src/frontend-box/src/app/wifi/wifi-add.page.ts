import { AfterViewInit, Component, OnInit, ViewEncapsulation } from '@angular/core'
import type { NgForm } from '@angular/forms'
import { FormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { AlertController, IonContent, IonIcon, IonInput, NavController } from '@ionic/angular/standalone'
import Keyboard from 'simple-keyboard'
import { registerLucideIcons } from '../icons/lucide-icons'
import { MediaService } from '../media.service'
import { SettingsHeaderComponent } from '../settings-header/settings-header.component'
import { WifiService } from '../wifi.service'
import type { WLAN } from '../wlan'

interface EditNetworkState {
  id: number
  ssid: string
}

@Component({
  selector: 'app-wifi-add',
  encapsulation: ViewEncapsulation.None,
  templateUrl: './wifi-add.page.html',
  styleUrls: ['./wifi-add.page.scss'],
  imports: [FormsModule, IonContent, IonIcon, IonInput, SettingsHeaderComponent],
})
export class WifiAddPage implements OnInit, AfterViewInit {
  keyboard: Keyboard
  selectedInputElem: any
  valid = false

  /** When set, the page edits the password of an already configured network instead of adding a new one. */
  editNetwork: EditNetworkState | undefined

  /** SSID of a network in range that was picked from the list (only the password is still needed). */
  prefillSsid: string | undefined

  constructor(
    private mediaService: MediaService,
    private wifiService: WifiService,
    private navController: NavController,
    public alertController: AlertController,
    private router: Router,
  ) {
    const state = this.router.currentNavigation()?.extras.state as
      | { editNetwork?: EditNetworkState; newNetworkSsid?: string }
      | undefined
    this.editNetwork = state?.editNetwork
    this.prefillSsid = state?.newNetworkSsid
    registerLucideIcons()
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
        '{smileys}': '😃',
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

    this.selectedInputElem = document.querySelector('.wifi-form ion-input')

    if (this.prefillSsid) {
      // Name already known: fill it in and let the keyboard type into the password field.
      this.keyboard.setInput(this.prefillSsid, 'wlan_ssid')
      const passwordInput = document.querySelector('ion-input[name="wlan_pw"]') as any
      if (passwordInput) {
        this.selectedInputElem = passwordInput
        this.keyboard.setOptions({ disableCaretPositioning: false, inputName: 'wlan_pw' })
      }
      this.validate()
    }
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
    const wlanPw = this.keyboard.getInput('wlan_pw') ?? ''

    if (this.editNetwork) {
      this.wifiService.updateNetworkPassword(this.editNetwork.id, wlanPw).subscribe(() => {
        form.reset()
        this.keyboard.clearInput('wlan_pw')
        this.navController.back()
      })
      return
    }

    const wlan: WLAN = {
      category: 'WLAN',
    }

    const wlanSsid = this.keyboard.getInput('wlan_ssid') ?? ''

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
    const wlanPw = this.keyboard.getInput('wlan_pw') ?? ''

    if (this.editNetwork) {
      this.valid = wlanPw.length >= 8 && wlanPw.length <= 63
      return
    }

    const wlanSsid = this.keyboard.getInput('wlan_ssid') ?? ''
    this.valid = wlanSsid.length > 0 && (wlanPw.length === 0 || (wlanPw.length >= 8 && wlanPw.length <= 63))
  }
}
