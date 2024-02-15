import { Component, OnInit, ViewChild } from '@angular/core';
import { IonSlides } from '@ionic/angular';
import { Router, NavigationExtras, ActivatedRoute } from '@angular/router';
import { MediaService } from '../media.service';
import { ArtworkService } from '../artwork.service';
import { PlayerService } from '../player.service';
import { ActivityIndicatorService } from '../activity-indicator.service';
import { Artist } from '../artist';
import { Media } from '../media';
import { Resume } from '../resume';
import { Network } from "../network";
import { Observable } from 'rxjs';
import { Monitor } from '../monitor';
import { xml2json } from 'xml-js';
import { HttpClient } from '@angular/common/http';
import { RssFeed } from '../rssfeed';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage implements OnInit {
  @ViewChild('artist_slider', { static: false }) artistSlider: IonSlides;
  @ViewChild('media_slider', { static: false }) mediaSlider: IonSlides;

  category =  'audiobook';

  artists: Artist[] = [];
  media: Media[] = [];
  mediaFile: Media;
  resumeFile: Resume;
  network: Network;
  monitor: Monitor;
  jsonRSS: RssFeed;
  currentNetwork = "";
  updateNetwork = false;
  covers = {};
  activityIndicatorVisible = false;
  editButtonclickCount = 0;
  editClickTimer = 0;
  public readonly network$: Observable<Network>;

  needsUpdate = false;

  slideOptions = {
    initialSlide: 0,
    slidesPerView: 3,
    autoplay: false,
    loop: false,
    freeMode: true,
    freeModeSticky: true,
    freeModeMomentumBounce: false,
    freeModeMomentumRatio: 1.0,
    freeModeMomentumVelocityRatio: 1.0
  };

  constructor(
    private http: HttpClient,
    private mediaService: MediaService,
    private artworkService: ArtworkService,
    private playerService: PlayerService,
    private activityIndicatorService: ActivityIndicatorService,
    private router: Router,
    private activatedRoute: ActivatedRoute
  ) {
    this.network$ = this.mediaService.network$;
  }

  ngOnInit() {
    this.mediaService.setCategory('audiobook');

    this.mediaService.network$.subscribe(network => {
      this.network = network;
    });
    this.mediaService.monitor$.subscribe(monitor => {
      this.monitor = monitor;
    });

    // Subscribe
    this.mediaService.getMedia().subscribe(media => {
      this.media = media;

      this.media.forEach(currentMedia => {
        this.artworkService.getArtwork(currentMedia).subscribe(url => {
          this.covers[currentMedia.title] = url;
        });

        this.mediaSlider.update().then(null);
      });


      // Workaround as the scrollbar handle isn't visible after the immediate update
      // Seems like a size calculation issue, as resizing the browser window helps
      // Better fix for this?
      window.setTimeout(() => {
        this.mediaSlider?.update();
      }, 1000);
    });

    this.mediaService.getArtists().subscribe(artists => {
      this.artists = artists;

      this.artists.forEach(artist => {
        this.artworkService.getArtistArtwork(artist.coverMedia).subscribe(url => {
          this.covers[artist.name] = url;
        });
      });
      this.artistSlider?.update();

      // Workaround as the scrollbar handle isn't visible after the immediate update
      // Seems like a size calculation issue, as resizing the browser window helps
      // Better fix for this? 
      window.setTimeout(() => {
        this.artistSlider?.update();
      }, 1000);
    });

    this.update();
  }

  ionViewWillEnter() {
    if (this.needsUpdate) {
      this.update();
    }
    this.updateNetwork = true;
    this.mediaService.getMediaObservable().subscribe(mediaFile => {
      this.mediaFile = mediaFile;
    });
    this.mediaService.getResumeObservable().subscribe(resumeFile => {
      this.resumeFile = resumeFile;
    });
    this.checkNetwork();
  }


  checkNetwork(){
    //console.log("Onlinestate:" + this.network?.onlinestate);
    // console.log("CurrentNetwork:" + this.currentNetwork);
    if(this.network?.ip !== undefined){
      if(this.network?.onlinestate !== this.currentNetwork){
        this.currentNetwork = this.network?.onlinestate;
        // console.log("Network changed");
        this.update();
      }
    }
    
    setTimeout(() => {
      if(this.updateNetwork){
        this.checkNetwork();
      }
    }, 1000)
  }

  ionViewDidLeave() {
    this.updateNetwork = false;
    if (this.activityIndicatorVisible) {
      this.activityIndicatorService.dismiss();
      this.activityIndicatorVisible = false;
    }
  }

  categoryChanged(event: any) {
    this.category = event.detail.value;
    this.mediaService.setCategory(this.category);
    this.update();
  }

  update() {
    if (this.category === 'audiobook' || this.category === 'music') {
      this.mediaService.publishArtists();
    } else {
      this.mediaService.publishMedia();
    }
    this.needsUpdate = false;
  }

  artistCoverClicked(clickedArtist: Artist) {
    if(this.monitor?.monitor == "On"){
      this.activityIndicatorService.create().then(indicator => {
        this.activityIndicatorVisible = true;
        indicator.present().then(() => {
          const navigationExtras: NavigationExtras = {
            state: {
              artist: clickedArtist
            }
          };
          this.router.navigate(['/medialist'], navigationExtras);
        });
      });
    }
  }

  artistNameClicked(clickedArtist: Artist) {
    if(this.monitor?.monitor == "On"){
      this.playerService.getConfig().subscribe(config => {
        if (config.tts == null || config.tts.enabled === true) {
          this.playerService.say(clickedArtist.name);
        }
      });
    }
  }

  mediaCoverClicked(clickedMedia: Media) {
    if(this.monitor?.monitor == "On"){
      this.activityIndicatorService.create().then(indicator => {
        this.activityIndicatorVisible = true;
        indicator.present().then(() => {
          const navigationExtras: NavigationExtras = {
            state: {
              media: clickedMedia
            }
          };
          this.router.navigate(['/player'], navigationExtras);
        });
      });
    }
  }

  mediaNameClicked(clickedMedia: Media) {
    if(this.monitor?.monitor == "On"){
      this.playerService.getConfig().subscribe(config => {
        if (config.tts == null || config.tts.enabled === true) {
          this.playerService.say(clickedMedia.title);
        }
      });
    }
  }

  editButtonPressed() {
    window.clearTimeout(this.editClickTimer);

    // var url='https://www.antennebrandenburg.de/programm/hoeren/podcasts/Zappelduster_Podcast/podcast.xml/feed=podcast.xml';
    // var response = '';
    // this.http.get(url, { responseType: 'text' }).subscribe(httpresponse =>
    //   response=httpresponse
    //   );
    //  setTimeout(() => {
    //   this.jsonRSS = JSON.parse(xml2json(response, {compact: true, spaces: 0, ignoreDeclaration: true, trim: true}));
    //   console.log(this.jsonRSS.rss.channel.title._text);
    //   console.log(Object.keys(this.jsonRSS.rss.channel.item).length);
    // }, 1000)

    if (this.editButtonclickCount < 9) {
      this.editButtonclickCount++;

      this.editClickTimer = window.setTimeout(() => {
        this.editButtonclickCount = 0;
      }, 500);
    } else {
      this.editButtonclickCount = 0;
      this.needsUpdate = true;

      this.activityIndicatorService.create().then(indicator => {
        this.activityIndicatorVisible = true;
        indicator.present().then(() => {
          this.router.navigate(['/edit']);
        });
      });
    }
  }

  resume() {
    if(this.monitor?.monitor == "On"){
      console.log(this.mediaFile);
      console.log(this.resumeFile);
      this.activityIndicatorService.create().then(indicator => {
        this.activityIndicatorVisible = true;
        indicator.present().then(() => {
          const navigationExtras: NavigationExtras = {
            state: {
              media: this.mediaFile,
              resume: this.resumeFile
            }
          };
          this.router.navigate(['/player'], navigationExtras);
        });
      });
    }
  }
}
