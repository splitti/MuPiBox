import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { IonicModule } from '@ionic/angular'

import { EditPageRoutingModule } from './edit-routing.module'

import { EditPage } from './edit.page'

@NgModule({
    imports: [CommonModule, FormsModule, IonicModule, EditPageRoutingModule, EditPage],
})
export class EditPageModule {}
