import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { Observable } from 'rxjs'
import { environment } from '../environments/environment'
import type { WifiConfiguredNetwork } from './wifi-network'

@Injectable({
  providedIn: 'root',
})
export class WifiService {
  constructor(private http: HttpClient) {}

  public getConfiguredNetworks(): Observable<WifiConfiguredNetwork[]> {
    return this.http.get<WifiConfiguredNetwork[]>(`${environment.backend.apiUrl}/wifi/configured`)
  }

  public removeNetwork(id: number): Observable<string> {
    return this.http.delete(`${environment.backend.apiUrl}/wifi/configured/${id}`, { responseType: 'text' })
  }

  public updateNetworkPassword(id: number, password: string): Observable<string> {
    return this.http.post(
      `${environment.backend.apiUrl}/wifi/configured/${id}/password`,
      { password },
      { responseType: 'text' },
    )
  }
}
