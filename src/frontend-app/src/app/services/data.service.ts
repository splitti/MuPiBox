import { Data } from '@backend-api/data.model'
import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { Observable } from 'rxjs'
import { SpotifyUrlData } from '@backend-api/spotify-url-data.model'
import { environment } from 'src/environments/environment'

/**
 * TODO
 */
@Injectable({
  providedIn: 'root',
})
export class DataService {
  private readonly endpoint = environment.backend.apiUrl

  public constructor(private httpClient: HttpClient) {}

  /**
   * Fetch the data from the backend.
   * @returns - A list of unmodified {@link Data} objects from the backend.
   */
  public getData(): Observable<Data[]> {
    return this.httpClient.get<Data[]>(`${this.endpoint}/data`)
  }

  // public deleteData
  public createData(newData: Data): Observable<Data> {
    return this.httpClient.post<Data>(`${this.endpoint}/data`, newData)
  }
  // public clearResumeData

  /**
   * TODO
   * @param data
   * @returns
   */
  public validateSpotify(data: SpotifyUrlData): Observable<boolean> {
    return this.httpClient.post<boolean>(`${this.endpoint}/validate-spotify`, data)
  }
}
