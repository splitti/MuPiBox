import { Injectable } from '@angular/core'

@Injectable({
  providedIn: 'root',
})
export class DataService {
  public print(): void {
    console.log('hallo')
  }
}
