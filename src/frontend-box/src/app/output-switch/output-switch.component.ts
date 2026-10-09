import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core'
import type { AudioOutputState } from '../player/player.page'

/**
 * The output capsule in the player's header (design round 2, §4): 64 high - one field, a line, the volume.
 * The field shows where the box plays: the Bluetooth symbol (a Bluetooth device), headphones (the 3.5 mm output) or
 * the speaker (the box's own sound card). Without a choice (one output) only the volume. With two outputs a tap goes
 * to the other one at once, with more the window opens (the player decides, see outputSwitchTap). States of the field:
 * ready (green dot: a Bluetooth device is connected, not playing), connecting (turning ring), not found (red dot; the
 * player shows the message below the header). The volume is only shown - louder and softer are the big buttons.
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
  /** a Bluetooth device is paired (and the parents did not switch the choice off) */
  readonly choosable = input(false)
  readonly volume = input<number | undefined>(undefined)
  /** 'box', a device's MAC (one device), or 'open' (several devices or sound cards: the window) */
  readonly choose = output<string>()

  protected readonly devices = computed(() => this.output()?.devices ?? [])
  private readonly cards = computed(() => this.output()?.cards ?? [])
  private readonly current = computed(() => this.output()?.current ?? 'box')
  /** a Bluetooth device plays */
  protected readonly onBluetooth = computed(() => this.devices().some((d) => d.mac === this.current()))
  /** the 3.5 mm output plays: headphones */
  protected readonly onJack = computed(() => this.cards().find((c) => `card:${c.id}` === this.current())?.kind === 'jack')
  /** the symbol of the output that plays */
  protected readonly symbol = computed<'bluetooth' | 'phones' | 'speaker'>(() => (this.onBluetooth() ? 'bluetooth' : this.onJack() ? 'phones' : 'speaker'))
  /** the Bluetooth device the field stands for: the one playing, else the first paired one */
  protected readonly device = computed(() => this.devices().find((d) => d.mac === this.current()) ?? this.devices()[0])
  protected readonly label = computed(() => (this.onBluetooth() ? this.device()?.name : this.cards().find((c) => `card:${c.id}` === this.current())?.name) ?? 'Box')
  protected readonly state = computed<'bt' | 'connecting' | 'notfound' | 'ready' | 'off'>(() => {
    const d = this.device()
    if (!d) return 'off'
    if (this.busy() && this.devices().some((x) => x.mac === this.busy())) return 'connecting'
    if (this.notFound()) return 'notfound'
    if (this.current() === d.mac) return 'bt'
    return d.connected ? 'ready' : 'off'
  })
  /** the outputs there are: the box's sound cards (one counts as "the box") and the paired devices */
  private readonly optionCount = computed(() => Math.max(this.cards().length, 1) + this.devices().length)

  protected tap(): void {
    // (three or more: the window decides)
    if (this.optionCount() > 2) return this.choose.emit('open')
    // two: a tap goes to the other one
    if (this.devices().length === 1 && this.cards().length < 2) return this.choose.emit(this.onBluetooth() ? 'box' : this.devices()[0].mac)
    const other = this.cards().find((c) => `card:${c.id}` !== this.current())
    if (other) this.choose.emit(`card:${other.id}`)
  }
}
