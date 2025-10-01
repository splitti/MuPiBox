import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { Router, RouterLinkWithHref } from '@angular/router'
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import { add } from 'ionicons/icons'
import { ClickedDataEntry, DataListComponent } from '../data-list/data-list.component'
import { DataService } from '../services/data.service'

@Component({
  selector: 'mupiapp-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    IonButton,
    IonTitle,
    IonButtons,
    IonToolbar,
    IonHeader,
    DataListComponent,
    IonContent,
    IonIcon,
    RouterLinkWithHref,
  ],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  private dataService = inject(DataService)
  private router = inject(Router)

  public constructor() {
    addIcons({ add })
  }

  protected entryClicked(clickedData: ClickedDataEntry): void {
    this.router.navigate(['edit', clickedData.index])
  }

  protected clearResume(): void {
    this.dataService.clearResumeData().subscribe()
  }
}
