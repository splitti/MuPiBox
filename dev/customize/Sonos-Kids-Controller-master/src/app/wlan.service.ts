import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { environment } from '../environments/environment';
import { WLAN } from './wlan';

@Injectable({
  providedIn: 'root'
})
export class WlanService {

  private rawMediaSubject = new Subject<WLAN[]>();

  constructor(
    private http: HttpClient,
  ) { }

  // --------------------------------------------
  // Handling of RAW media entries from data.json
  // --------------------------------------------

  getRawMediaObservable() {
    return this.rawMediaSubject;
  }

  updateRawMedia() {
    const url = (environment.production) ? '../api/data' : 'http://localhost:8200/api/data';
    this.http.get<WLAN[]>(url).subscribe(media => {
        this.rawMediaSubject.next(media);
    });
  }

  deleteRawMediaAtIndex(index: number) {
    const url = (environment.production) ? '../api/delete' : 'http://localhost:8200/api/delete';
    const body = {
      index
    };

    this.http.post(url, body).subscribe(response => {
      this.updateRawMedia();
    });
  }

  addRawMedia(media: WLAN) {
    const url = (environment.production) ? '../api/add' : 'http://localhost:8200/api/add';

    this.http.post(url, media).subscribe(response => {
      this.updateRawMedia();
    });
  }
}