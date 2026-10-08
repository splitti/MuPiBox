import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core'
import type { AudioOutputState } from '../player/player.page'

/**
 * The output capsule in the player's header (design round 2, §4): 64 high - box | headphones, a line, the volume.
 * The left field is the box's speaker, the right one the headphones (a paired Bluetooth device or the 3.5 mm output);
 * the one that plays is marked. Without a choice only the volume. A tap on either opens "Hören mit" (the player's
 * window) - switching at once tried a Bluetooth device that was off and only said "not found". States of the right
 * field: ready (green dot: a Bluetooth device is connected, not playing), connecting (turning ring), not found (red dot;
 * the player shows the message below the header). The volume is only shown - louder and softer are the big buttons.
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
  /** 'open': the window "Hören mit" */
  readonly choose = output<string>()

  protected readonly devices = computed(() => this.output()?.devices ?? [])
  private readonly cards = computed(() => this.output()?.cards ?? [])
  private readonly current = computed(() => this.output()?.current ?? 'box')
  /** a Bluetooth device plays */
  protected readonly onBluetooth = computed(() => this.devices().some((d) => d.mac === this.current()))
  /** the 3.5 mm output plays: headphones */
  protected readonly onJack = computed(() => this.cards().find((c) => `card:${c.id}` === this.current())?.kind === 'jack')
  /** the box's own speaker plays (not Bluetooth, not the 3.5 mm output) */
  protected readonly onBox = computed(() => !this.onBluetooth() && !this.onJack())
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
  protected tap(): void {
    this.choose.emit('open')
  }
}
