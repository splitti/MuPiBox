import { CategoryType, Sorting } from '@backend-api/folder.model'
import { ChangeDetectionStrategy, Component, computed, model, signal } from '@angular/core'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonFooter,
  IonGrid,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonRow,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular/standalone'

import { SourceType } from '@backend-api/data.model'
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
  protected sourceTypeControl = new FormControl<AddEditPageSourceType | undefined>(undefined, Validators.required)
  protected sourceUrl = new FormControl<string | undefined>(undefined, Validators.required)

  protected category = new FormControl<CategoryType>('audiobook', Validators.required)
  protected folderName = new FormControl<string>('', Validators.required)
  protected folderImageUrl = new FormControl<string>('')
  protected sorting = new FormControl<Sorting>(Sorting.AlphabeticalAscending, Validators.required)

  protected title = new FormControl<string>('', Validators.required)
  protected coverImageUrl = new FormControl<string>('')

  protected shuffle = new FormControl<boolean>(false)
  protected interval = new FormControl<boolean>(false)

  // If the source is Spotify (not Spotify query), we allow the folder name and cover image
  // to be automatically deduced. In that case, we want to simplify the UI by hiding the (optional)
  // overrriding inputs for folder name and image behind a toggle.
  protected allowAutomaticFolderNameAndImage = computed(() => this.sourceType() === AddEditPageSourceType.SpotifyUrl)

  protected automaticFolderNameAndImage = model(true)

  protected sourceType = toSignal(this.sourceTypeControl.valueChanges)
  protected intervalSignal = toSignal(this.interval.valueChanges)

  protected formGroup = new FormGroup({
    sourceType: this.sourceTypeControl,
    sourceUrl: this.sourceUrl,
    category: this.category,
    sorting: this.sorting,
    folderName: this.folderName,
    folderImageUrl: this.folderImageUrl,
    title: this.title,
    coverImageUrl: this.coverImageUrl,
    shuffle: this.shuffle,
    interval: this.interval,
  })
}
