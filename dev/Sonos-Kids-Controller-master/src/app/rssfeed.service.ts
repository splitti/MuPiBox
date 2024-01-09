import { Injectable } from '@angular/core';
import { Observable, defer, throwError, of, range } from 'rxjs';
import { retryWhen, flatMap, tap, delay, take, map, mergeMap, mergeAll, toArray, switchMap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { HttpClient } from '@angular/common/http';
//import { xml2json } from 'xml-js';
import { RssFeed } from './rssfeed';
import { Media } from './media';

declare const require: any;
const xml2js = require('xml2js');

@Injectable({
  providedIn: 'root'
})
export class RssFeedService {

  jsonRSS: RssFeed;
  url: string;

  constructor(private http: HttpClient) {}

  getRssFeed(
    id: string,
    category: string,
    index: number,
    shuffle: boolean, 
    aPartOfAll: boolean,
    aPartOfAllMin: number,
    aPartOfAllMax: number,
    manualArtistcover: string
  ): Observable<Media[]> {
    this.url = 'http://mupibox:8200/api/rssfeed?url=' + id;
    return this.http.get(this.url/*, { responseType: 'text' }*/).pipe(
      //switchMap(async (xml) => await this.parseXmlToJsonRss(xml)),
      map((response: RssFeed) => {
        return response.rss.channel.item.map((item) => {
          const media: Media = {
            id: item.enclosure?.$?.url,
            artist: response.rss?.channel?.title._text,
            title: item?.title._text,
            cover: item['itunes:image']?.$?.href,
            artistcover: response.rss?.channel?.image?.url,
            type: 'rss',
            category,
            index,
          };
          if (manualArtistcover) {
            media.artistcover = manualArtistcover;
          }
          if (shuffle) {
            media.shuffle = shuffle;
          }
          if (aPartOfAll) {
            media.aPartOfAll = aPartOfAll;
          }
          if (aPartOfAllMin) {
            media.aPartOfAllMin = aPartOfAllMin;
          }
          if (aPartOfAllMax) {
            media.aPartOfAllMax = aPartOfAllMax;
          }
          console.log(media);
          return media;
        });
      }),
      mergeAll(),
      toArray()
    );
  }

  async parseXmlToJsonRss(xml) {
    // With parser
    /* const parser = new xml2js.Parser({ explicitArray: false });
    parser
      .parseStringPromise(xml)
      .then(function(result) {
        console.log(result);
        console.log("Done");
      })
      .catch(function(err) {
        // Failed
      }); */

    // Without parser
    return await xml2js
      .parseStringPromise(xml, { explicitArray: false })
      .then((response) => response);
  }
  
  
  
  
  
  
  // test (){
  //   var url='https://www.antennebrandenburg.de/programm/hoeren/podcasts/Zappelduster_Podcast/podcast.xml/feed=podcast.xml';
  //   var response = '';
  //   this.http.get(url, { responseType: 'text' }).subscribe(httpresponse =>
  //     response=httpresponse
  //     );
  //    setTimeout(() => {
  //     this.jsonRSS = JSON.parse(xml2json(response, {compact: true, spaces: 0, ignoreDeclaration: true, trim: true}));
  //     console.log(this.jsonRSS.rss.channel.title._text);
  //     console.log(Object.keys(this.jsonRSS.rss.channel.item).length); //Total Number of elements
  //   }, 1000)

  //   //Umbau Add Parameter hinzufügen automatich laden und speichern Cover einmalig
  //   //Umbau Home/Radio Interface und Funktion
  //   //Media Service
  // }

  // getRssFeedCover(id: string){
  //   this.http.get(id, { responseType: 'text' }).subscribe(httpresponse =>
  //       this.httpResponse=httpresponse);
  //   setTimeout(() => {
  //       this.jsonRSS = JSON.parse(xml2json(this.httpResponse, {compact: true, spaces: 0, ignoreDeclaration: true, trim: true}));
  //       return this.jsonRSS.rss.channel.image.url._text;
  //   }, 500)
  // }
}
