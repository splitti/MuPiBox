import { ChangeDetectionStrategy, Component } from '@angular/core'
import {
  IonBackButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonGrid,
  IonHeader,
  IonIcon,
  IonRow,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone'

import { DataListComponent } from '../data-list/data-list.component'

@Component({
  selector: 'mupiapp-add-edit',
  templateUrl: 'add-edit.page.html',
  styleUrls: ['add-edit.page.scss'],
  imports: [
    IonButtons,
    IonBackButton,
    IonTitle,
    IonHeader,
    IonToolbar,
    IonCardContent,
    IonCard,
    IonCardHeader,
    IonCardSubtitle,
    IonCardTitle,
    IonContent,
    IonIcon,
    IonSegmentButton,
    IonSegment,
    IonRow,
    IonGrid,
    IonSelect,
  ],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddEditPage {}
