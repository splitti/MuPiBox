import { ChangeDetectionStrategy, Component, computed, output, Signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { Data } from '@backend-api/data.model'
import { CategoryType } from '@backend-api/folder.model'
import { IonButton, IonIcon, IonItem, IonLabel, IonList } from '@ionic/angular/standalone'
import { DataService } from '../services/data.service'

/**
 * TODO
 */
export interface ClickedDataEntry {
  index: number
  data: Data
}

/**
 * TODO
 */
export interface DataListEntry {
  icon: 'spotify' | 'radio' | 'rss' | 'music-file'
  name: string
  detail: string
  category: CategoryType
  allowEdit: boolean
  data: Data
}

/**
 * TODO
 */
@Component({
  selector: 'mupiapp-data-list',
  templateUrl: 'data-list.component.html',
  styleUrls: ['data-list.component.scss'],
  imports: [IonIcon, IonButton, IonLabel, IonList, IonItem],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataListComponent {
  public entryClicked = output<ClickedDataEntry>()
  private data: Signal<Data[]>
  protected shownData = computed(() => {
    return this.data()?.map((entry) => {
      let detail = ''
      if (entry.type === 'rss' || entry.type === 'radio') {
        detail = entry.id
      } else if (entry.type === 'spotify') {
        if ('query' in entry) {
          detail = entry.query
        } else {
          detail = entry.spotify_url
        }
      }
      return {
        icon: entry.type === 'library' ? 'music-file' : entry.type,
        name: entry.title === undefined ? detail : entry.title,
        detail: entry.title === undefined ? '' : detail,
        category: entry.category,
        allowEdit: entry.type !== 'library',
        data: entry,
      }
    })
  })

  public constructor(private dataService: DataService) {
    // TODO: add loading indicator
    this.data = toSignal(this.dataService.getData())
  }
}
