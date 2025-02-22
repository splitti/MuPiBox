import { CategoryType, Sorting } from '@backend-api/folder.model'
import { ChangeDetectionStrategy, Component, computed, effect, model } from '@angular/core'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular/standalone'
import { saveOutline, trashOutline } from 'ionicons/icons'

import { addIcons } from 'ionicons'
import { toSignal } from '@angular/core/rxjs-interop'

export enum AddEditPageSourceType {
  SpotifyUrl = 'spotifyURL',
  SpotifySearch = 'spotifySearch',
  RssUrl = 'rssURL',
  StreamUrl = 'streamURL',
}

@Component({
  selector: 'mupiapp-add-edit',
  templateUrl: 'add-edit.page.html',
  styleUrls: ['add-edit.page.scss'],
  imports: [
    IonToggle,
    IonInput,
    IonButton,
    IonFooter,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonHeader,
    IonToolbar,
    IonCardContent,
    IonCard,
    IonIcon,
    IonCardHeader,
    IonCardTitle,
    IonContent,
    IonSelectOption,
    IonSelect,
    FormsModule,
    ReactiveFormsModule,
  ],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddEditPage {
  protected sourceType = new FormControl<AddEditPageSourceType | undefined>(undefined, Validators.required)
  // This is either the url of the source or the spotify search query.
  protected sourceUrl = new FormControl<string | undefined>(undefined, Validators.required)

  protected category = new FormControl<CategoryType>('audiobook', Validators.required)
  protected folderName = new FormControl<string>('', Validators.required)
  protected folderImageUrl = new FormControl<string>('')
  protected sorting = new FormControl<Sorting>(Sorting.AlphabeticalAscending, Validators.required)

  protected title = new FormControl<string>('', Validators.required)
  protected coverImageUrl = new FormControl<string>('')

  protected shuffle = new FormControl<boolean>(false)
  protected interval = new FormControl<boolean>(false)
  protected intervalStart = new FormControl<number | undefined>(undefined)
  protected intervalEnd = new FormControl<number | undefined>(undefined)

  // If the source is Spotify (not Spotify query), we allow the folder name and cover image
  // to be automatically deduced. In that case, we want to simplify the UI by hiding the (optional)
  // overrriding inputs for folder name and image behind a toggle.
  protected allowAutomaticFolderNameAndImage = computed(
    () => this.sourceTypeSignal() === AddEditPageSourceType.SpotifyUrl,
  )

  // We only allow setting the default shuffle toggle for spotify data sources and non-audiobook
  // categories (since it doesn't make sense to shuffle audiobook tracks).
  protected showShuffleToggle = computed(() => {
    return (
      (this.sourceTypeSignal() === 'spotifyURL' || this.sourceTypeSignal() === 'spotifySearch') &&
      (this.categorySignal() === 'music' || this.categorySignal() === 'other')
    )
  })

  protected useAutomaticFolderNameAndImage = model(true)

  protected sourceTypeSignal = toSignal(this.sourceType.valueChanges)
  protected categorySignal = toSignal(this.category.valueChanges)
  protected intervalSignal = toSignal(this.interval.valueChanges)

  protected formGroup = new FormGroup({
    sourceType: this.sourceType,
    sourceUrl: this.sourceUrl,
    category: this.category,
    sorting: this.sorting,
    folderName: this.folderName,
    folderImageUrl: this.folderImageUrl,
    title: this.title,
    coverImageUrl: this.coverImageUrl,
    shuffle: this.shuffle,
    interval: this.interval,
    intervalStart: this.intervalStart,
    intervalEnd: this.intervalEnd,
  })

  public constructor() {
    addIcons({ saveOutline, trashOutline })

    effect(() => {
      this.setFormControlRequired(this.intervalStart, this.intervalSignal())
      this.setFormControlRequired(this.intervalEnd, this.intervalSignal())
    })
    effect(() => {
      this.setFormControlRequired(this.title, this.sourceTypeSignal() === 'streamURL')
    })
  }

  /**
   * TODO
   */
  protected toggleUseAutomaticFolderNameAndImage(): void {
    this.useAutomaticFolderNameAndImage.update((val) => !val)
  }

  /**
   * TODO
   * @param control
   * @param required
   */
  private setFormControlRequired(control: FormControl, required: boolean): void {
    if (required) {
      control.setValidators([Validators.required])
    } else {
      control.clearValidators()
    }
    control.updateValueAndValidity()
  }
}
