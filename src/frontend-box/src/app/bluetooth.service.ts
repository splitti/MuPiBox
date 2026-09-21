import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { Observable } from 'rxjs'
import { environment } from '../environments/environment'
import type { BluetoothDevice, BluetoothStatus } from './bluetooth'

@Injectable({
  providedIn: 'root',
})
export class BluetoothService {
  constructor(private http: HttpClient) {}

  public getStatus(): Observable<BluetoothStatus> {
    return this.http.get<BluetoothStatus>(`${environment.backend.apiUrl}/bluetooth/status`)
  }

  public setPower(on: boolean): Observable<string> {
    return this.http.post(`${environment.backend.apiUrl}/bluetooth/power`, { on }, { responseType: 'text' })
  }

  public scan(): Observable<BluetoothDevice[]> {
    return this.http.post<BluetoothDevice[]>(`${environment.backend.apiUrl}/bluetooth/scan`, {})
  }

  public pair(mac: string): Observable<string> {
    return this.http.post(`${environment.backend.apiUrl}/bluetooth/pair`, { mac }, { responseType: 'text' })
  }

  public remove(mac: string): Observable<string> {
    return this.http.post(`${environment.backend.apiUrl}/bluetooth/remove`, { mac }, { responseType: 'text' })
  }
}
