import { ChangeDetectionStrategy, Component, computed, effect, inject, model, Signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { AsyncValidatorFn, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import {
  Data,
  isRadioData,
  isRssData,
  isSpotifyData,
  isSpotifyQueryData,
  RadioData,
  RssData,
} from '@backend-api/data.model'
import { CategoryType, Sorting } from '@backend-api/folder.model'
import { SpotifyUrlData } from '@backend-api/spotify-url-data.model'
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
  IonNote,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import { saveOutline, trashOutline } from 'ionicons/icons'
import { catchError, lastValueFrom, map, Observable, of, switchMap } from 'rxjs'
import { DataService } from '../services/data.service'

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
    IonNote,
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
  protected sourceUrl = new FormControl<string | undefined>(undefined, {
    validators: Validators.required,
  })

  protected category = new FormControl<CategoryType>('audiobook', Validators.required)
  protected folderName = new FormControl<string | undefined>(undefined, Validators.required)
  protected folderImageUrl = new FormControl<string | undefined>(undefined)
  protected sorting = new FormControl<Sorting>(Sorting.AlphabeticalAscending, Validators.required)

  protected title = new FormControl<string | undefined>(undefined, Validators.required)
  protected coverImageUrl = new FormControl<string | undefined>(undefined)

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

  protected isEditing = computed(() => this.editDataId() !== null)
  private editDataId: Signal<number | null>
  private editData: Signal<Data | null>

  private readonly router = inject(Router)
  private readonly route = inject(ActivatedRoute)
  private readonly dataService = inject(DataService)

  public constructor() {
    addIcons({ saveOutline, trashOutline })

    effect(() => {
      this.setFormControlRequired(this.intervalStart, this.intervalSignal())
      this.setFormControlRequired(this.intervalEnd, this.intervalSignal())
    })
    effect(() => {
      this.setFormControlRequired(this.title, this.sourceTypeSignal() === 'streamURL')
    })
    effect(() => {
      this.setFormControlRequired(this.folderName, !this.allowAutomaticFolderNameAndImage())
    })
    effect(() => {
      if (this.sourceTypeSignal() === AddEditPageSourceType.SpotifyUrl) {
        this.sourceUrl.setAsyncValidators([this.getSourceUrlValidator()])
      } else [this.sourceUrl.clearAsyncValidators()]
      this.sourceUrl.updateValueAndValidity()
    })

    this.editDataId = toSignal<number | null>(
      this.route.paramMap.pipe(
        map((params) => {
          const idFromParams = params.get('id')
          return idFromParams !== null ? Number(idFromParams) : null
        }),
      ),
    )
    this.editData = toSignal<Data | null>(
      toObservable(this.editDataId).pipe(
        switchMap((id) => {
          if (id === null) {
            return of(null)
          }
          return this.dataService.getDataById(id)
        }),
      ),
    )

    // Set edit data to the form fields.
    effect(
      () => {
        const data = this.editData()
        if (data == null) {
          return
        }
        if (isSpotifyData(data)) {
          if (isSpotifyQueryData(data)) {
            this.sourceType.setValue(AddEditPageSourceType.SpotifySearch)
            this.sourceUrl.setValue(data.query)
          } else {
            this.sourceType.setValue(AddEditPageSourceType.SpotifyUrl)
            this.sourceUrl.setValue(data.spotify_url)
          }
        } else if (isRadioData(data)) {
          this.sourceType.setValue(AddEditPageSourceType.StreamUrl)
          this.sourceUrl.setValue(data.id)
        } else if (isRssData(data)) {
          this.sourceType.setValue(AddEditPageSourceType.RssUrl)
          this.sourceUrl.setValue(data.id)
        }
        this.category.setValue(data.category)
        // this.sorting.setValue(data.sorting)
        this.folderName.setValue(data.artist)
        this.folderImageUrl.setValue(data.artistcover)
        this.useAutomaticFolderNameAndImage.set(data.artist === undefined && data.artistcover === undefined)

        this.title.setValue(data.title)
        this.coverImageUrl.setValue(data.cover)
        if (isRadioData(data)) {
          this.shuffle.setValue(false)
          this.interval.setValue(false)
          this.intervalStart.setValue(undefined)
          this.intervalEnd.setValue(undefined)
        } else {
          // this.shuffle.setValue(data?.shuffle ?? false)
          if ('aPartOfAll' in data) {
            this.interval.setValue(data.aPartOfAll ?? false)
            this.intervalStart.setValue(data.aPartOfAllMin ?? undefined)
            this.intervalEnd.setValue(data.aPartOfAllMax ?? undefined)
          } else {
            this.interval.setValue(false)
            this.intervalStart.setValue(undefined)
            this.intervalEnd.setValue(undefined)
          }
        }
      },
      { allowSignalWrites: true },
    )
  }

  /**
   * TODO
   */
  protected toggleUseAutomaticFolderNameAndImage(): void {
    this.useAutomaticFolderNameAndImage.update((val) => !val)
  }

  protected create(): void {
    this.formGroup.setErrors(null)
    if (this.formGroup.invalid) {
      return
    }
    let dataToCreate: Data | null = null
    switch (this.sourceType.value) {
      case AddEditPageSourceType.SpotifyUrl:
        // this.createSpotify()
        break
      case AddEditPageSourceType.SpotifySearch:
        // this.createSpotifySearch()
        break
      case AddEditPageSourceType.RssUrl: {
        const rssData: RssData = {
          type: 'rss',
          category: this.category.value,
          artist: this.folderName.value,
          artistcover: this.folderImageUrl.value,
          title: this.title.value,
          cover: this.coverImageUrl.value,
          aPartOfAll: this.interval.value,
          aPartOfAllMin: this.interval.value ? this.intervalStart.value : undefined,
          aPartOfAllMax: this.interval.value ? this.intervalEnd.value : undefined,
          sorting: this.sorting.value,
          id: this.sourceUrl.value,
        }
        dataToCreate = rssData
        break
      }
      case AddEditPageSourceType.StreamUrl: {
        const radioData: RadioData = {
          type: 'radio',
          category: this.category.value,
          artist: this.folderName.value,
          artistcover: this.folderImageUrl.value,
          title: this.title.value,
          cover: this.coverImageUrl.value,
          id: this.sourceUrl.value,
        }
        dataToCreate = radioData
        break
      }
    }
    // TODO: Handle m3u stuff?
    if (dataToCreate === null) {
      return
    }
    lastValueFrom(this.dataService.createData(dataToCreate))
      .then(() => {
        // TODO: Maybe show confirmation?
        this.router.navigate([''])
      })
      .catch((error) => {
        // TODO: Allow submitting form again.
        this.formGroup.setErrors({
          createError: 'Failed to create entry. This might be due to a locked data file. Please try again in a moment.',
        })
      })
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

  /**
   * TODO
   * @param control T
   * @returns
   */
  private getSourceUrlValidator(): AsyncValidatorFn {
    return (control: FormControl): Observable<{ [key: string]: any } | null> => {
      if (!control.value) {
        return of(null)
      }
      return this.dataService.validateSpotify(this.extractSpotifyUrlData(control.value)).pipe(
        map((isValid: boolean) => {
          return isValid ? null : { invalidSpotifyUrl: true }
        }),
        catchError(() => of({ invalidSpotifyUrl: true })),
      )
    }
  }

  private extractSpotifyUrlData(url: string): SpotifyUrlData | null {
    const regex = '^https://open.spotify.com/.*(playlist|show|album|artist|audiobooks)/([a-zA-Z0-9]+)(.*)$'
    const match = url.match(regex)
    if (!match) {
      return null
    }
    return {
      type: match[1] as SpotifyUrlData['type'],
      id: match[2],
    }
  }
}
