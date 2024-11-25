import { Data } from '@backend-api/data.model'
import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { Observable } from 'rxjs'
import { environment } from 'src/environments/environment'

@Injectable({
  providedIn: 'root',
})
export class DataService {
  private endpoint = `${environment.backend.apiUrl}/data`

  public constructor(private httpClient: HttpClient) {}

  public getData(): Observable<Data[]> {
    return this.httpClient.get<Data[]>(this.endpoint)
  }
}
