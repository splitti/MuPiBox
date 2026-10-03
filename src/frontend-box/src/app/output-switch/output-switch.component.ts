import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core'
import type { AudioOutputState } from '../player/player.page'

/**
 * "Hören mit" in the player's header (design round 2, §4): two fields - the box's speaker | the headset - shown only
 * while a Bluetooth device is paired. With one device a tap switches at once, with several the window opens (the
 * player decides, see outputSwitchTap). States on the headset field: ready (green dot), connecting (turning ring),
 * not found (red dot; the player shows the message below the header).
 */
@Component({
  selector: 'mupi-output-switch',
  templateUrl: './output-switch.component.html',
  styleUrls: ['./output-switch.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OutputSwitchComponent {
  readonly output = input<AudioOutputState | null>(null)
  readonly busy = input<string | null>(null)
  readonly notFound = input(false)
  /** 'box', a device's MAC (one device), or 'open' (several: the window) */
  readonly choose = output<string>()

  private readonly devices = computed(() => this.output()?.devices ?? [])
  protected readonly onBox = computed(() => (this.output()?.current ?? 'box') === 'box')
  /** the headset the right field stands for: the one playing, else the first paired one */
  protected readonly device = computed(() => {
    const o = this.output()
    return this.devices().find((d) => d.mac === o?.current) ?? this.devices()[0]
  })
  protected readonly state = computed<'bt' | 'connecting' | 'notfound' | 'ready' | 'off'>(() => {
    const d = this.device()
    if (!d) return 'off'
    if (this.busy() && this.busy() !== 'box') return 'connecting'
    if (this.notFound()) return 'notfound'
    if (this.output()?.current === d.mac) return 'bt'
    return d.connected ? 'ready' : 'off'
  })

  protected tapBox(): void {
    if (this.devices().length > 1) return this.choose.emit('open')
    if (!this.onBox()) this.choose.emit('box')
  }

  protected tapHeadset(): void {
    if (this.devices().length > 1) return this.choose.emit('open')
    const d = this.device()
    if (d && this.output()?.current !== d.mac) this.choose.emit(d.mac)
  }
}
