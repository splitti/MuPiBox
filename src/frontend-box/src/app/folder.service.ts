import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { Folder } from '@backend-api/folder.model'
import { Observable } from 'rxjs'
import { environment } from 'src/environments/environment'

/**
 * TODO
 */
@Injectable({
  providedIn: 'root',
})
export class FolderService {
  private endpoint = `${environment.backend.apiUrl}/folders`

  public constructor(private httpClient: HttpClient) {}

  /**
   * TODO
   * @returns
   */
  public getFolder(): Observable<Folder[]> {
    return this.httpClient.get<Folder[]>(this.endpoint)
  }
}
