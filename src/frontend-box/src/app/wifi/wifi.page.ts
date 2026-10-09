import { Component, computed, effect, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { Router } from '@angular/router'
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import { Subscription, catchError, EMPTY, map, of, switchMap, timer } from 'rxjs'
import { addOutline, arrowBackOutline, gitNetworkOutline, lockClosedOutline, refresh, scanOutline, wifiOutline } from 'ionicons/icons'
import Keyboard from 'simple-keyboard'
import { MediaService } from '../media.service'
import { PlayerCmds, PlayerService } from '../player.service'
import { WifiService } from '../wifi.service'
import type {
  EthernetConfig,
  NetworkLink,
  OnboardWifiStatus,
  WifiBandChoice,
  WifiNetwork,
  WifiStaticAddress,
  WifiStaticCheck,
  WifiStatus,
} from '../wifi-network'

/** The address form of a saved WiFi network: DHCP or a fixed address (see backend eltern/wifi-static.ts) */
interface AddressForm extends WifiStaticAddress {
  ssid: string
  /** the network the box is in now: only there the test runs and saving switches at once */
  active: boolean
  dhcp: boolean
}

// The checks of the test before saving: [text when fine, text when not]
const ADDRESS_CHECKS: Record<string, [string, string]> = {
  network: ['Router and range as in the network now', 'Router or range differ from the network now - a typo?'],
  own: ['The box has this address right now', ''],
  free: ['The address is free', 'Another device already uses this address'],
  router: ['The router answers the new address', 'The router does not answer the new address'],
  dns: ['The DNS server answers', 'The DNS server does not answer'],
}
const ADDRESS_ERRORS: Record<string, string> = {
  ip: 'The IP address is not valid (like 192.168.1.50).',
  mask: 'The mask is not valid (like 255.255.255.0).',
  gateway: 'The router address is not valid.',
  dns: 'The DNS server address is not valid.',
  subnet: 'Address and router are not in the same network.',
  same: 'The address is the router’s.',
  host: 'This address is reserved in the network - please choose another one.',
}

@Component({
  selector: 'app-wifi',
  templateUrl: './wifi.page.html',
  styleUrls: ['./wifi.page.scss'],
  imports: [
    IonTitle,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonButton,
    IonIcon,
    IonContent,
    IonCard,
    IonList,
    IonItem,
    IonLabel,
    IonSpinner,
    IonInput,
  ],
})
export class WifiPage {
  protected network = toSignal(this.mediaService.network$, { initialValue: null })
  // The link as it is right now, asked for every few seconds while the page is open (network.json, which
  // `network` comes from, is only rewritten every 30 seconds)
  private status = signal<WifiStatus | null>(null)
  private statusPolling?: Subscription
  // What the top card shows: the live link, until the first answer the network.json values
  protected card = computed(() => {
    const live = this.status()
    if (!live) {
      const stored = this.network()
      return {
        interface: stored?.interface,
        name: stored?.wifi ?? '—',
        detail: `${stored?.wifilink ?? ''} · ${stored?.wifisignal ?? ''}`,
        ip: stored?.ip ?? '—',
        gateway: stored?.gateway ?? '—',
      }
    }
    const connected = live.state === 'COMPLETED' && live.ssid
    return {
      interface: live.interface,
      name: connected ? live.ssid : 'Connecting …',
      detail: connected
        ? [live.signal !== undefined ? `${live.signal} %` : '', live.signalDbm !== undefined ? `${live.signalDbm} dBm` : '', live.band ? `${live.band} GHz` : '']
            .filter((part) => part !== '')
            .join(' · ')
        : '',
      ip: live.ip ?? '—',
      gateway: live.gateway ?? '—',
    }
  })
  protected networks = signal<WifiNetwork[]>([])
  protected loading = signal(true)
  protected readonly signalBars = [1, 2, 3, 4]

  // Which link carries the default route: WiFi (the view above) or ethernet (a LAN cable), in which case
  // "Networks in range" is hidden and a DHCP/STATIC form is shown instead, modeled on dietpi-config's network
  // adapter screen.
  protected linkType = signal<'wifi' | 'ethernet' | 'none' | null>(null)
  private linkPolling?: Subscription
  // WiFi or LAN chosen at the top (null: the link in use, as before) - the LAN settings without the cable in use too
  protected chosenView = signal<'wifi' | 'lan' | null>(null)
  protected view = computed(() => this.chosenView() ?? (this.linkType() === 'ethernet' ? 'lan' : 'wifi'))
  // The address form of a saved WiFi network (null: the list), the test's checks (null: the keypad is shown)
  protected address = signal<AddressForm | null>(null)
  protected addressChecks = signal<WifiStaticCheck[] | null>(null)
  protected addressBusy = signal(false)
  protected addressNote = signal('')
  private addressTested: { key: string; ok: boolean } | null = null
  // The networks with a fixed address by name, and the one the box last took back to DHCP
  protected fixed = signal<Record<string, WifiStaticAddress>>({})
  protected reverted = signal<{ ssid: string } | null>(null)
  protected readonly addressChecksText = ADDRESS_CHECKS
  // the network the box is in now has a fixed address (no "Renew address" then)
  protected fixedNow = computed(() => {
    const f = this.fixed()[this.card().name]
    return !!f && !f.paused
  })
  // The Static IP/Mask/Gateway/DNS form is laid out to fit one screen exactly (fields + keypad side by
  // side), so the page's own scrolling is turned off only while it is shown.
  protected showStaticLayout = computed(
    () => (this.view() === 'lan' && !this.address() && !this.lanDhcp()) || (!!this.address() && !this.address()?.dhcp && !this.addressChecks()),
  )
  protected ethernet = signal<EthernetConfig | null>(null)
  protected ethernetLoading = signal(true)
  protected ethernetSaving = signal(false)

  // Header icons: onboard WiFi on/off (rfkill) and the ethernet port on/off, both shown regardless of
  // which link is currently active. Polled separately from `ethernet` above so a running edit in the
  // LAN form below is never overwritten by this poll.
  protected onboardWifi = signal<OnboardWifiStatus | null>(null)
  private onboardWifiPolling?: Subscription
  protected ethernetAvailable = signal(false)
  protected ethernetLinkUp = signal(false)
  // the switch as it is set (/api/network/ethernet/power) - not whether a cable has a link: a port without a cable
  // showed as "off" although nothing was switched off
  protected ethernetOff = signal(false)
  protected cableText = computed(() => {
    const eth = this.ethernet()
    if (this.ethernetOff()) return 'Port switched off'
    if (eth?.carrier === true) return 'Cable connected'
    if (eth?.carrier === false) return 'No cable'
    return '—'
  })
  protected ethernetInterfaceName = signal<string | undefined>(undefined)
  private ethernetPowerPolling?: Subscription
  protected lanDhcp = signal(true)
  protected lanIp = signal('')
  protected lanMask = signal('')
  protected lanGateway = signal('')
  protected lanDns = signal('')
  private lanKeyboard?: Keyboard
  private lanSelectedInput: any

  constructor(
    private mediaService: MediaService,
    private wifiService: WifiService,
    public alertController: AlertController,
    private playerService: PlayerService,
    private router: Router,
  ) {
    addIcons({ refresh, wifiOutline, addOutline, arrowBackOutline, lockClosedOutline, scanOutline, gitNetworkOutline })
    // Built as soon as the Static form appears (not just on first focus) - otherwise reloading straight
    // into STATIC mode, or switching STATIC -> DHCP -> STATIC again, left the keypad panel empty until
    // the user happened to tap a field. The setTimeout defers past the current change detection pass, so
    // the .lan-simple-keyboard container (just added by the @if) is guaranteed to exist in the DOM first.
    effect(() => {
      if (this.showStaticLayout()) {
        setTimeout(() => this.ensureLanKeyboard())
      } else {
        this.lanKeyboard?.destroy()
        this.lanKeyboard = undefined
      }
    })
  }

  ionViewWillEnter() {
    this.loadNetworks()
    this.loadFixed()
    this.statusPolling = timer(0, 3000)
      .pipe(switchMap(() => this.wifiService.getStatus().pipe(catchError(() => EMPTY))))
      .subscribe((status) => this.status.set(status))
    this.linkPolling = timer(0, 3000)
      .pipe(switchMap(() => this.wifiService.getLink().pipe(catchError(() => EMPTY))))
      .subscribe((link) => {
        const wasEthernet = this.linkType() === 'ethernet'
        this.linkType.set(link.type)
        if (link.type === 'ethernet' && !wasEthernet) {
          this.loadEthernetConfig()
        }
      })
    this.onboardWifiPolling = timer(0, 3000)
      .pipe(switchMap(() => this.wifiService.getOnboardWifi().pipe(catchError(() => EMPTY))))
      .subscribe((status) => this.onboardWifi.set(status))
    this.ethernetPowerPolling = timer(0, 3000)
      .pipe(
        switchMap(() =>
          this.wifiService.getEthernetConfig().pipe(
            map((config) => ({ ok: true as const, config })),
            catchError(() => of({ ok: false as const })),
          ),
        ),
      )
      .subscribe((result) => {
        this.ethernetAvailable.set(result.ok)
        if (result.ok) {
          this.ethernetLinkUp.set(result.config.linkUp ?? false)
          this.ethernetOff.set(result.config.off === true)
          this.ethernetInterfaceName.set(result.config.interface)
          // (the LAN card shows the cable: kept fresh while the page is open)
          if (this.ethernet()) this.ethernet.set({ ...(this.ethernet() as EthernetConfig), carrier: result.config.carrier, off: result.config.off, currentIp: result.config.currentIp, currentGateway: result.config.currentGateway })
        }
      })
  }

  ionViewWillLeave() {
    this.statusPolling?.unsubscribe()
    this.linkPolling?.unsubscribe()
    this.onboardWifiPolling?.unsubscribe()
    this.ethernetPowerPolling?.unsubscribe()
    this.lanKeyboard?.destroy()
    this.lanKeyboard = undefined
  }

  // Reads the ethernet DHCP/STATIC config and fills the form with it (a running edit is discarded, same as
  // the WiFi networks list is reloaded from scratch after a change).
  protected loadEthernetConfig() {
    this.ethernetLoading.set(true)
    this.wifiService.getEthernetConfig().subscribe({
      next: (config) => {
        this.ethernet.set(config)
        this.lanDhcp.set(config.dhcp)
        this.lanIp.set(config.ip)
        this.lanMask.set(config.mask)
        this.lanGateway.set(config.gateway)
        this.lanDns.set(config.dns)
        this.ethernetLoading.set(false)
      },
      error: () => this.ethernetLoading.set(false),
    })
  }

  protected async saveEthernetConfig() {
    this.ethernetSaving.set(true)
    this.wifiService
      .setEthernetConfig({
        dhcp: this.lanDhcp(),
        ip: this.lanIp().trim(),
        mask: this.lanMask().trim(),
        gateway: this.lanGateway().trim(),
        dns: this.lanDns().trim(),
      })
      .subscribe({
        next: () => {
          this.ethernetSaving.set(false)
          this.loadEthernetConfig()
        },
        error: async (error) => {
          this.ethernetSaving.set(false)
          const alert = await this.alertController.create({
            cssClass: 'alert',
            header: 'Could not save',
            message: typeof error?.error === 'string' && error.error ? error.error : 'The network settings could not be saved.',
            buttons: ['OK'],
          })
          await alert.present()
        },
      })
  }

  async ethernetRestartButtonPressed() {
    const alert = await this.alertController.create({
      cssClass: 'alert',
      header: 'Restart network',
      message: 'Apply the settings and restart the network connection? The box may briefly lose network access.',
      buttons: [
        {
          text: 'Restart',
          handler: () => {
            this.wifiService.restartEthernet().subscribe(() => setTimeout(() => this.loadEthernetConfig(), 3000))
          },
        },
        {
          text: 'Cancel',
        },
      ],
    })

    await alert.present()
  }

  // Onscreen keyboard for the Static IP/Mask/Gateway/DNS fields (the kiosk has no physical keyboard), built
  // only once the user actually taps into one of them: its container only exists in the DOM once STATIC is
  // chosen, and simple-keyboard needs it present when constructed.
  private ensureLanKeyboard() {
    if (this.lanKeyboard) {
      return
    }
    this.lanKeyboard = new Keyboard('.lan-simple-keyboard', {
      onChange: (input) => {
        if (this.lanSelectedInput) {
          this.lanSelectedInput.value = input
        }
        this.applyLanField(this.lanSelectedInput?.name, input)
      },
      theme: 'hg-theme-default hg-theme-ios',
      layout: {
        default: ['1 2 3', '4 5 6', '7 8 9', '{bksp} 0 .'],
      },
      display: { '{bksp}': '⌫' },
    })
  }

  private applyLanField(name: string | undefined, value: string) {
    // (the address form of a WiFi network has its own fields)
    const field = { wa_ip: 'ip', wa_mask: 'mask', wa_gateway: 'gateway', wa_dns: 'dns' }[name ?? ''] as keyof WifiStaticAddress | undefined
    if (field) {
      this.address.update((a) => (a ? { ...a, [field]: value } : a))
      return
    }
    switch (name) {
      case 'lan_ip':
        this.lanIp.set(value)
        break
      case 'lan_mask':
        this.lanMask.set(value)
        break
      case 'lan_gateway':
        this.lanGateway.set(value)
        break
      case 'lan_dns':
        this.lanDns.set(value)
        break
    }
  }

  protected lanFocusChanged(event: any) {
    // (the test's list stands where the keypad is: a tap into a field brings the keypad back)
    if (this.addressChecks()) {
      this.addressChecks.set(null)
      const target = event.target
      setTimeout(() => this.lanFocusChanged({ target }), 60)
      return
    }
    this.ensureLanKeyboard()
    this.lanSelectedInput = event.target
    this.lanKeyboard?.setOptions({ inputName: event.target.name })
    this.lanKeyboard?.setInput(event.target.value ?? '', event.target.name)
  }

  protected lanInputChanged(event: any) {
    this.lanKeyboard?.setInput(event.target.value ?? '', event.target.name)
    this.applyLanField(event.target.name, event.target.value ?? '')
  }

  // WiFi or LAN at the top: the LAN settings also when the cable is not the link in use (set up before plugging in)
  protected chooseView(view: 'wifi' | 'lan') {
    this.chosenView.set(view)
    if (view === 'lan' && !this.ethernet()) this.loadEthernetConfig()
  }

  /** The saved networks with a fixed address, and the note of one taken back to DHCP */
  protected loadFixed() {
    this.wifiService
      .getWifiStatic()
      .pipe(catchError(() => EMPTY))
      .subscribe((state) => {
        this.fixed.set(state.networks ?? {})
        this.reverted.set(state.reverted ?? null)
      })
  }

  /** "Renew address": the address fetched anew from the router - the WiFi's, or (lan) the cable's */
  async renewAddressButtonPressed(lan?: string) {
    const alert = await this.alertController.create({
      cssClass: 'alert',
      header: 'Renew address',
      message: `The box gets its ${lan ? 'LAN' : 'WiFi'} address anew from the router. The connection is gone for a moment.`,
      buttons: [{ text: 'Renew', handler: () => this.wifiService.renewAddress(lan).pipe(catchError(() => EMPTY)).subscribe() }, { text: 'Cancel' }],
    })
    await alert.present()
  }

  /** The address form of a saved network: its fixed address (also a paused one), else - in the network the box is in -
   * the address it has from DHCP now as a start, so mostly only the last number is changed */
  protected openAddress(network: WifiNetwork, staticMode?: boolean) {
    const fixed = this.fixed()[network.ssid]
    const stored = this.network()
    const now = network.current ? { ip: this.card().ip, mask: stored?.subnet ?? '', gateway: this.card().gateway, dns: '' } : null
    const start = fixed ?? now ?? { ip: '', mask: '255.255.255.0', gateway: '', dns: '' }
    this.addressTested = null
    this.addressChecks.set(null)
    this.addressNote.set('')
    this.address.set({
      ssid: network.ssid,
      active: !!network.current,
      dhcp: staticMode ? false : !fixed || !!fixed.paused,
      ip: start.ip === '—' ? '' : start.ip,
      mask: start.mask,
      gateway: start.gateway === '—' ? '' : start.gateway,
      dns: start.dns ?? '',
    })
  }

  protected setAddressMode(dhcp: boolean) {
    this.address.update((a) => (a ? { ...a, dhcp } : a))
    this.addressChecks.set(null)
  }

  protected closeAddress() {
    this.address.set(null)
    this.addressChecks.set(null)
  }

  private addressValues(a: AddressForm): WifiStaticAddress {
    return { ip: a.ip.trim(), mask: a.mask.trim(), gateway: a.gateway.trim(), dns: a.dns.trim() }
  }

  /** The test before saving (in the network the box is in): its checks where the keypad was; true when all is fine */
  protected testAddress(): Promise<boolean | null> {
    const a = this.address()
    if (!a) return Promise.resolve(null)
    const values = this.addressValues(a)
    this.addressBusy.set(true)
    this.addressNote.set('Testing - the connection stays as it is …')
    return new Promise((resolve) => {
      this.wifiService.testWifiStatic(a.ssid, values).subscribe({
        next: (r) => {
          this.addressBusy.set(false)
          if (r.active === false) {
            // (the box left this network meanwhile: nothing was tested - saved without the switch, see the backend)
            this.addressNote.set('The box is not in this network right now - nothing to test; the address is used the next time it joins.')
            this.addressTested = null
            this.addressChecks.set(null)
            resolve(true)
            return
          }
          this.addressNote.set('')
          const ok = r.checks.every((c) => c.ok)
          this.addressTested = { key: JSON.stringify(values), ok }
          this.addressChecks.set(r.checks)
          resolve(ok)
        },
        error: (e) => {
          this.addressBusy.set(false)
          this.addressNote.set(ADDRESS_ERRORS[e?.error?.field] ?? (e?.status === 409 ? 'The box is changing its address right now - try again in a moment.' : 'The test could not run.'))
          resolve(null)
        },
      })
    })
  }

  private async ask(header: string, message: string, ok: string): Promise<boolean> {
    const alert = await this.alertController.create({ cssClass: 'alert', header, message, buttons: [{ text: 'Cancel', role: 'cancel' }, { text: ok, role: 'confirm' }] })
    await alert.present()
    return (await alert.onDidDismiss()).role === 'confirm'
  }

  /** Saving: in the network the box is in, tested first (with these values) and asked again when something failed */
  protected async saveAddress() {
    const a = this.address()
    if (!a) return
    const fixed = this.fixed()[a.ssid]
    if (a.dhcp && !fixed) return this.closeAddress()
    const values = this.addressValues(a)
    if (a.active && !a.dhcp) {
      const ok = this.addressTested?.key === JSON.stringify(values) ? this.addressTested.ok : await this.testAddress()
      if (ok === null) return
      if (!ok && !(await this.ask('Save anyway?', 'Something failed in the test (see the list). If the box does not reach its router with the new address, it goes back to DHCP after about 30 seconds.', 'Save anyway'))) return
    }
    if (a.active) {
      const text = a.dhcp
        ? `The box gets its address in “${a.ssid}” from the router again. The connection is gone for a moment.`
        : `The box switches to ${values.ip} in “${a.ssid}”. If it does not reach its router there, it goes back to DHCP after about 30 seconds and keeps the values here to correct them.`
      if (!(await this.ask('Change the address?', text, 'Change'))) return
    }
    this.addressBusy.set(true)
    this.wifiService.setWifiStatic(a.ssid, a.dhcp ? 'dhcp' : values).subscribe({
      next: () => {
        this.addressBusy.set(false)
        this.closeAddress()
        this.loadFixed()
      },
      error: (e) => {
        this.addressBusy.set(false)
        this.addressNote.set(ADDRESS_ERRORS[e?.error?.field] ?? (e?.status === 409 ? 'The box is changing its address right now - try again in a moment.' : 'Could not save.'))
      },
    })
  }

  /** The note "back to DHCP": read (OK), or the form opened with the paused values to correct them */
  protected revertedOk() {
    this.wifiService.seenWifiStatic().pipe(catchError(() => EMPTY)).subscribe(() => this.reverted.set(null))
  }

  protected revertedCorrect() {
    const r = this.reverted()
    if (!r) return
    const network = this.networks().find((n) => n.ssid === r.ssid) ?? ({ ssid: r.ssid, current: this.card().name === r.ssid } as WifiNetwork)
    this.revertedOk()
    this.openAddress(network, true)
  }

  // Scans for networks in range (takes a few seconds) and merges them with the saved ones.
  protected loadNetworks() {
    this.loading.set(true)
    this.wifiService.getNetworks().subscribe({
      next: (networks) => {
        this.networks.set(networks)
        this.loading.set(false)
      },
      error: () => {
        this.loading.set(false)
      },
    })
  }

  // 0-4 lit bars for the signal strength in percent.
  protected signalLevel(network: WifiNetwork): number {
    const signal = network.signal ?? 0
    if (!network.available || signal <= 0) {
      return 0
    }
    return signal >= 75 ? 4 : signal >= 50 ? 3 : signal >= 25 ? 2 : 1
  }

  // "2.4 GHz", "5 GHz" or "2.4 + 5 GHz" (both). For the connected network the band in use is added
  // when the network is available on more than one.
  protected bandText(network: WifiNetwork): string {
    const bands = [...(network.bands ?? [])].sort((x, y) => Number(x) - Number(y))
    if (bands.length === 0) {
      return ''
    }
    const text = `${bands.join(' + ')} GHz`
    return network.current && network.connectedBand && bands.length > 1 ? `${text} (connected on ${network.connectedBand} GHz)` : text
  }

  // The 2.4 / 5 GHz choice is offered for a saved network that is broadcast on both bands. One that is
  // already limited to a band keeps it, so the limit can always be lifted again.
  protected canChooseBand(network: WifiNetwork): boolean {
    if (network.id === undefined) {
      return false
    }
    return (network.bands?.length ?? 0) > 1 || (network.band !== undefined && network.band !== 'auto')
  }

  protected setBand(network: WifiNetwork, band: WifiBandChoice) {
    if (network.id === undefined || (network.band ?? 'auto') === band) {
      return
    }
    // The connection is set up again when this is the network in use: give it about ten seconds
    this.loading.set(true)
    this.wifiService.setNetworkBand(network.id, band).subscribe({
      next: () => setTimeout(() => this.loadNetworks(), network.current ? 10000 : 500),
      error: () => this.loadNetworks(),
    })
  }

  addNetworkButtonPressed() {
    this.router.navigate(['/wifi/add'])
  }

  // A network in range that is not saved yet: add it with the name already filled in.
  connectNetworkButtonPressed(network: WifiNetwork) {
    this.router.navigate(['/wifi/add'], { state: { newNetworkSsid: network.ssid } })
  }

  changeNetworkButtonPressed(network: WifiNetwork) {
    this.router.navigate(['/wifi/add'], { state: { editNetwork: { id: network.id, ssid: network.ssid } } })
  }

  async deleteNetworkButtonPressed(network: WifiNetwork) {
    const alert = await this.alertController.create({
      cssClass: 'alert',
      header: 'Delete network',
      message: `Do you want to remove the saved network "${network.ssid}"?`,
      buttons: [
        {
          text: 'Delete',
          handler: () => {
            this.wifiService.removeNetwork(network.id).subscribe(() => {
              this.loadNetworks()
            })
          },
        },
        {
          text: 'Cancel',
        },
      ],
    })

    await alert.present()
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

  // Onboard WiFi radio on/off (rfkill, immediate) - independent of a USB WiFi adapter that may also be
  // plugged in. Turning it on is harmless so it needs no confirmation; turning it off can disconnect
  // WiFi right away if the onboard adapter is the one currently in use.
  protected onboardWifiTooltip = computed(() => {
    const status = this.onboardWifi()
    if (!status || !status.available) {
      return 'Onboard WiFi'
    }
    if (status.bootDisabled) {
      return 'Onboard WiFi is switched off at the start - tap to turn it on (after a restart)'
    }
    return status.enabled ? 'Onboard WiFi is on - tap to turn it off' : 'Onboard WiFi is off - tap to turn it on'
  })

  async onboardWifiButtonPressed() {
    const status = this.onboardWifi()
    if (!status?.available) {
      return
    }
    if (!status.enabled) {
      this.setOnboardWifi(true)
      return
    }
    const alert = await this.alertController.create({
      cssClass: 'alert',
      header: 'Turn off onboard WiFi',
      message: 'Turn off the onboard WiFi radio? If it is the adapter currently in use, this disconnects WiFi immediately.',
      buttons: [
        {
          text: 'Turn off',
          handler: () => this.setOnboardWifi(false),
        },
        {
          text: 'Cancel',
        },
      ],
    })

    await alert.present()
  }

  private setOnboardWifi(enabled: boolean) {
    this.wifiService.setOnboardWifi(enabled).subscribe((answer) => {
      this.wifiService.getOnboardWifi().subscribe((status) => this.onboardWifi.set(status))
      // (switched off at the start: the chip comes back with a restart)
      if (answer === 'reboot') this.offerRestartForOnboardWifi()
    })
  }

  private async offerRestartForOnboardWifi() {
    const alert = await this.alertController.create({
      cssClass: 'alert',
      header: 'Onboard WiFi',
      message: 'The onboard WiFi was switched off at the start. It is on again after a restart.',
      buttons: [
        {
          text: 'Restart now',
          handler: () => {
            this.wifiService.restartBox().subscribe({ error: (err) => console.error('[wifi] /api/reboot failed:', err) })
          },
        },
        { text: 'Later', role: 'cancel' },
      ],
    })
    await alert.present()
  }

  // Ethernet port on/off (administrative link state, immediate) - independent of its DHCP/STATIC config.
  // Turning it off while connected through that same cable cuts the connection with no way to undo it
  // remotely, so it always asks first.
  protected lanTooltip = computed(() =>
    !this.ethernetOff() ? 'LAN (ethernet) is on - tap to turn it off' : 'LAN (ethernet) is off - tap to turn it on',
  )

  async lanPowerButtonPressed() {
    if (this.ethernetOff()) {
      this.setLanPower(true)
      return
    }
    const alert = await this.alertController.create({
      cssClass: 'alert',
      header: 'Turn off LAN',
      message:
        'Turn off the ethernet port? If the box is connected through this cable right now, you will lose that connection immediately and need physical access to the box to turn it back on.',
      buttons: [
        {
          text: 'Turn off',
          handler: () => this.setLanPower(false),
        },
        {
          text: 'Cancel',
        },
      ],
    })

    await alert.present()
  }

  private setLanPower(enabled: boolean) {
    this.wifiService.setEthernetPower(enabled).subscribe(() => {
      this.ethernetOff.set(!enabled)
      this.ethernetLinkUp.set(enabled)
    })
  }
}
