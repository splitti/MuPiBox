import { ChangeDetectionStrategy, Component, computed, Signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { map, of, switchMap } from 'rxjs'
import { MediaService } from '../media.service'
import type { Mupihat } from '../mupihat'
import { PlayerService } from '../player.service'

// The status at the top right, the same in every theme: WiFi and battery, both 24 px high and in line, the
// percentage inside the battery. Colours come from --st-* variables (defaults below from the toolbar colour; the
// kids' themes set them in theme/km.scss, the other themes in their theme file).
// Nothing in here takes pointer events: a press anywhere on the group reaches the element around it (on the start
// page the button that opens the admin menu when held).
//
// Colours of the other themes (set in each theme file; measured on the box: the colour of the toolbar text and the
// background behind the status; contrast of the number against the fill / the track, both >= 4.5):
//   theme               on       track full     num      low      charge   bolt edge  contrast
//   axolotl             #FFFFFF  42 %  #FFFFFF  #213132  #FF314C  #428CFF  #365354   13.5/4.7
//   blue                #FFFFFF  42 %  #FFFFFF  #042D3A  #FF314C  #428CFF  #054B61   14.6/4.6
//   captainamerica      #FFFFFF  42 %  #FFFFFF  #001B37  #FF314C  #428CFF  #002D5C   17.3/4.5
//   chocolate           #FFFFFF  42 %  #FFFFFF  #33241A  #FF314C  #428CFF  #553C2B   14.9/4.7
//   cinema              #FFFFFF  42 %  #FFFFFF  #564800  #FF314C  #428CFF  #A38800   9/4.6
//   clone-wars          #FFFFFF  42 %  #FFFFFF  #333942  #FF314C  #428CFF  #616D7D   11.6/5
//   comic               #FFFFFF  42 %  #FFFFFF  #182A2A  #FF314C  #428CFF  #284546   15/4.7
//   coverflow           #FFFFFF  42 %  #FFFFFF  #0F0F10  #FF314C  #428CFF  #1C1C1E   19.2/4.5
//   custom              #FFFFFF  42 %  #FFFFFF  #494543  #FF314C  #428CFF  #8B837E   9.5/4.8
//   danger              #FFFFFF  42 %  #FFFFFF  #070A0D  #FF314C  #428CFF  #101820   19.8/4.5
//   dark                #FFFFFF  42 %  #FFFFFF  #1A1A1A  #FF314C  #428CFF  #2A2A2A   17.4/4.6
//   darkred             #FFFFFF  42 %  #FFFFFF  #380000  #FF314C  #428CFF  #8B0000   18/4.7
//   deepblue            #FFFFFF  42 %  #FFFFFF  #160057  #FF314C  #428CFF  #3500D3   17.9/4.5
//   dinosaur            #FFFFFF  46 %  #FFFFFF  #04080B  #FF314C  #428CFF  #0D151E   20.1/5.1
//   earth               #FFFFFF  46 %  #FFFFFF  #000000  #FF314C  #428CFF  #000000   21/4.6
//   enterprise          #FFFFFF  46 %  #FFFFFF  #0A0512  #FF314C  #428CFF  #170C2C   20.1/5
//   fantasybutterflies  #FFFFFF  46 %  #FFFFFF  #020811  #FF314C  #428CFF  #020E20   20.1/4.8
//   forms               #FFFFFF  42 %  #FFFFFF  #191919  #FF314C  #428CFF  #292929   17.6/4.6
//   green               #FFFFFF  42 %  #FFFFFF  #235223  #FF314C  #428CFF  #439C43   9.1/4.7
//   ironman             #FFFFFF  42 %  #FFFFFF  #530000  #FF314C  #428CFF  #CC0000   15.4/4.8
//   light               #FFFFFF  42 %  #FFFFFF  #484848  #FF314C  #428CFF  #888888   9.1/4.7
//   lines               #FFFFFF  42 %  #FFFFFF  #755E01  #FF314C  #428CFF  #FDCB01   6.3/4.8
//   matrix              #FFFFFF  46 %  #FFFFFF  #000000  #FF314C  #428CFF  #000000   21/4.6
//   mint                #FFFFFF  42 %  #FFFFFF  #001121  #FF314C  #428CFF  #00203F   19.1/4.5
//   mystic              #FFFFFF  42 %  #FFFFFF  #10211C  #FF314C  #428CFF  #1A372F   16.7/4.7
//   orange              #FFFFFF  42 %  #FFFFFF  #762A00  #FF314C  #428CFF  #FF5900   10/5
//   pikachu             #FFFFFF  42 %  #FFFFFF  #574D20  #FF314C  #428CFF  #BBA744   8.4/5.2
//   pink                #FFFFFF  42 %  #FFFFFF  #743041  #FF314C  #428CFF  #F9688D   9.4/5.1
//   purple              #FFFFFF  42 %  #FFFFFF  #2A0733  #FF314C  #428CFF  #4F0D61   17.8/4.5
//   red                 #FFFFFF  42 %  #FFFFFF  #55151A  #FF314C  #428CFF  #A12830   13.9/4.6
//   spiderman           #FFFFFF  42 %  #FFFFFF  #30141F  #FF314C  #428CFF  #4F2233   16.9/4.6
//   steampunk           #FFFFFF  42 %  #FFFFFF  #23190F  #FF314C  #428CFF  #3A2919   17.2/4.6
//   supermario          #FFFFFF  42 %  #FFFFFF  #171058  #FF314C  #428CFF  #2C1EA7   16.8/4.6
//   unicorn             #FFFFFF  42 %  #FFFFFF  #1A1513  #FF314C  #428CFF  #2C2320   18.1/4.6
//   vintage             #FFFFFF  42 %  #FFFFFF  #692821  #FF314C  #428CFF  #E15546   10.9/5.1
//   wall-e              #FFFFFF  42 %  #FFFFFF  #1A1A1A  #FF314C  #428CFF  #2A2A2A   17.4/4.6
//   wood                #FFFFFF  42 %  #FFFFFF  #613B11  #FF314C  #428CFF  #B76F20   9.8/4.6
//   xmas                #FFFFFF  42 %  #FFFFFF  #5B0000  #FF314C  #428CFF  #DE0000   14.5/4.8

// dBm -> 1..3 lit arcs
export function wifiLevelOf(signalDbm: number | undefined): number {
  if (signalDbm === undefined) return 3 // connected, the value is not available right now
  if (signalDbm >= -65) return 3
  if (signalDbm >= -75) return 2
  return 1
}

// "-61 dBm" -> -61
function signalDbmOf(text: string | undefined): number | undefined {
  const value = Number.parseInt(String(text ?? ''), 10)
  return Number.isFinite(value) && value < 0 ? value : undefined
}

@Component({
  selector: 'mupi-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="st" [class.st--charging]="charging()" [class.st--low]="percent() <= 15 && !charging()">
      <span class="st-wifi-wrap" [attr.data-level]="wifiLevel()" role="img" [attr.aria-label]="'WiFi ' + wifiLevel() + '/3'">
        <svg class="st-wifi" viewBox="0 0 30 24" width="30" height="24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true">
          <path class="st-w3" d="M1.28 7.98A19.4 19.4 0 0 1 28.72 7.98" />
          <path class="st-w2" d="M5.88 12.58A12.9 12.9 0 0 1 24.12 12.58" />
          <path class="st-w1" d="M10.33 17.03A6.6 6.6 0 0 1 19.67 17.03" />
          <circle cx="15" cy="21.7" r="2.3" fill="currentColor" stroke="none" />
          @if (wifiOff()) {
            <path class="st-wifi-x" d="M4 3L26 22" />
          }
        </svg>
      </span>
      @if (hasBattery()) {
        <div class="st-batt" [style.--pct]="percent()" role="img" [attr.aria-label]="'Battery ' + percent() + ' %'">
          @if (charging()) {
            <svg class="st-bolt" viewBox="0 0 12 16" width="12" height="16" aria-hidden="true">
              <path d="M7.5 0 1 9h4.2L4 16l7-9.5H6.8z" fill="var(--st-charge, #ffb000)" stroke="var(--st-bolt-edge, #1c1c1e)" stroke-width="1.5" stroke-linejoin="round" />
            </svg>
          }
          <div class="st-batt-body"><div class="st-batt-fill"></div><span class="st-batt-num">{{ percent() }}</span></div>
          <div class="st-batt-pole"></div>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      pointer-events: none;
    }
    /* the colours come from the theme (--st-*); without them: the toolbar colour */
    .st {
      display: flex;
      align-items: center;
      gap: 10px;
      height: 64px;
      padding: 0 4px 0 6px;
      color: var(--st-on, currentColor);
      -webkit-tap-highlight-color: transparent;
    }
    .st svg,
    .st-batt,
    .st-batt * {
      pointer-events: none;
    }
    .st-wifi-wrap {
      display: block;
      height: 24px;
    }
    .st-wifi {
      display: block;
      width: 30px;
      height: 24px;
      overflow: visible;
    }
    .st-wifi-wrap[data-level='2'] .st-w3,
    .st-wifi-wrap[data-level='1'] .st-w3,
    .st-wifi-wrap[data-level='1'] .st-w2,
    .st-wifi-wrap[data-level='0'] path,
    .st-wifi-wrap[data-level='0'] circle {
      opacity: 0.3;
    }
    .st-wifi-wrap .st-wifi-x {
      opacity: 1;
    }
    .st-batt {
      display: flex;
      align-items: center;
      gap: 3px;
      height: 24px;
    }
    .st-bolt {
      display: block;
      margin-right: -1px;
    }
    .st-batt-body {
      position: relative;
      width: 46px;
      height: 24px;
      border-radius: 8px;
      overflow: hidden;
      background: var(--st-track, color-mix(in srgb, currentColor 42%, transparent));
    }
    .st-batt-fill {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: calc(var(--pct) * 1%);
      background: var(--st-full, currentColor);
      transition: width 0.6s ease;
    }
    .st--low .st-batt-fill {
      background: var(--st-low, #e5484d);
    }
    .st--charging .st-batt-fill {
      background: var(--st-charge, #ffb000);
    }
    .st-batt-num {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      font: 700 15px/1 var(--ion-font-family, inherit);
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.3px;
      color: var(--st-num, #1c1c1e);
    }
    .st-batt-pole {
      width: 3px;
      height: 9px;
      border-radius: 0 2px 2px 0;
      background: var(--st-track, color-mix(in srgb, currentColor 42%, transparent));
    }
  `,
})
export class StatusComponent {
  // WiFi: from the network state the app polls anyway (one shared request every 5 s)
  private readonly network
  protected readonly wifiLevel: Signal<number>
  // no connection (known): the arcs crossed out; while the state is not known yet only dimmed
  protected readonly wifiOff: Signal<boolean>

  // Battery: only with a MuPiHAT and a battery connected
  private readonly hatActive: Signal<boolean | undefined>
  private readonly hat: Signal<Mupihat | undefined>
  protected readonly hasBattery = computed(() => this.hatActive() === true && this.hat()?.BatteryConnected === 1)
  // 0-100: the granular percentage of the backend, or the four buckets of an older one
  protected readonly percent = computed(() => {
    const hat = this.hat()
    const percent = hat?.Bat_Percent
    if (percent !== undefined && percent !== null) return Math.max(0, Math.min(100, Math.round(percent)))
    switch (hat?.Bat_SOC) {
      case '100%':
        return 100
      case '75%':
        return 75
      case '50%':
        return 50
      case '25%':
        return 25
      default:
        return 0
    }
  })
  protected readonly charging = computed(() => (this.hat()?.IBus ?? 0) > 0)

  public constructor(playerService: PlayerService, mediaService: MediaService) {
    this.network = toSignal(mediaService.network$, { initialValue: undefined })
    this.wifiLevel = computed(() => {
      const network = this.network()
      if (!network || network.onlinestate === 'offline') return 0 // not known yet, or no connection
      if (!network.wifi) return 3 // online without a WiFi: a cable connection
      return wifiLevelOf(signalDbmOf(network.wifisignal))
    })
    this.wifiOff = computed(() => this.network()?.onlinestate === 'offline')
    this.hatActive = toSignal(playerService.getConfig().pipe(map((config) => config.hat_active)))
    this.hat = toSignal(
      toObservable(this.hatActive).pipe(switchMap((active) => (active ? mediaService.mupihat$ : of(undefined)))),
    )
  }
}
