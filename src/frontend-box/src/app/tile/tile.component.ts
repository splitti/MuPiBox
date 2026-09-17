import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'

/**
 * Square media tile as designed in the Figma board: cover image with a frosted
 * label band at the bottom and a blue indicator bar. Tapping the image emits
 * {@link tileClicked}, tapping the label emits {@link labelClicked} (used for TTS).
 */
@Component({
  selector: 'mupi-tile',
  templateUrl: './tile.component.html',
  styleUrls: ['./tile.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TileComponent {
  public imgSrc = input.required<string>()
  public title = input.required<string>()
  public tileClicked = output<void>()
  public labelClicked = output<void>()

  protected onLabelClick(event: Event): void {
    event.stopPropagation()
    this.labelClicked.emit()
  }
}
