import { Component, OnInit, ViewChild } from '@angular/core';
import { IonSlides } from '@ionic/angular';
import { ActivatedRoute, Router, NavigationExtras } from '@angular/router';
import { MediaService } from '../media.service';
import { ArtworkService } from '../artwork.service';
import { PlayerService } from '../player.service';
import { ActivityIndicatorService } from '../activity-indicator.service';
import { Media } from '../media';
import { Artist } from '../artist';
import { Monitor } from '../monitor';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-medialist',
  templateUrl: './medialist.page.html',
  styleUrls: ['./medialist.page.scss'],
})
export class MedialistPage implements OnInit {
  @ViewChild('slider', { static: false }) slider: IonSlides;

  artist: Artist;
  media: Media[] = [];
  resumemedia: Media[] = [];
  resume = false;
  covers = {};
  monitor: Monitor;
  activityIndicatorVisible = false;
  aPartOfAllMedia: Media[] = [];
  private getMediaFromResumeSubscription: Subscription;
  private getMediaFromShowSubscription: Subscription;
  private getMediaFromArtistSubscription: Subscription;

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
    private route: ActivatedRoute,
    private router: Router,
    private mediaService: MediaService,
    private artworkService: ArtworkService,
    private playerService: PlayerService,
    private activityIndicatorService: ActivityIndicatorService
  ) {
    this.route.queryParams.subscribe(params => {
      if (this.router.getCurrentNavigation().extras.state) {
        this.artist = this.router.getCurrentNavigation().extras.state.artist;
        if (this.router.getCurrentNavigation().extras.state?.resume === "resume") {
          this.resume = true;
        }
      }
    });
  }

  ngOnInit() {
    // Subscribe
    console.log("this.artist", this.artist);
    if(this.resume){
      this.getMediaFromResumeSubscription = this.mediaService.getMediaFromResume().subscribe(media => {
        this.media = media;
  
        this.media.forEach(currentMedia => {
          this.artworkService.getArtwork(currentMedia).subscribe(url => {
            this.covers[currentMedia.title] = url;
          });
        });

        console.log("getMediaFromResume", this.media);

        this.slider.update();
  
        // Workaround as the scrollbar handle isn't visible after the immediate update
        // Seems like a size calculation issue, as resizing the browser window helps
        // Better fix for this? 
        window.setTimeout(() => {
          this.slider.update();
        }, 1000);
      });
    }else{
      if((this.artist.coverMedia.showid && this.artist.coverMedia.showid.length > 0) || (this.artist.coverMedia.type == 'rss' && this.artist.coverMedia.id.length > 0)){
        this.getMediaFromShowSubscription = this.mediaService.getMediaFromShow(this.artist).subscribe(media => {
          this.media = media;
    
          this.media.forEach(currentMedia => {
            this.artworkService.getArtwork(currentMedia).subscribe(url => {
              this.covers[currentMedia.title] = url;
            });
          });
  
          console.log("ShowID this.media all", this.media);
  
          if(this.artist.coverMedia?.aPartOfAll){
            for (let i = 0; i < this.media.length; i++){
              let rev = this.media.length - i;
              if(rev >= (this.artist.coverMedia?.aPartOfAllMin) && rev <= (this.artist.coverMedia?.aPartOfAllMax)){
                this.aPartOfAllMedia.push(this.media[i]);
              }
            }
            this.media = this.aPartOfAllMedia;
          }
  
          this.slider.update();
  
          console.log("if ShowID this.media", this.media);
    
          // Workaround as the scrollbar handle isn't visible after the immediate update
          // Seems like a size calculation issue, as resizing the browser window helps
          // Better fix for this? 
          window.setTimeout(() => {
            this.slider.update();
          }, 1000);
        });
      } else {
        this.getMediaFromArtistSubscription = this.mediaService.getMediaFromArtist(this.artist).subscribe(media => {
          this.media = media;
    
          this.media.forEach(currentMedia => {
            this.artworkService.getArtwork(currentMedia).subscribe(url => {
              this.covers[currentMedia.title] = url;
            });
          });
  
          console.log("getMediaFromArtist this.media all", this.media);
  
          if(this.artist.coverMedia?.aPartOfAll){
            let min: number;
            let max: number;
            if(this.artist.coverMedia?.aPartOfAllMin == null){
              min = 0
            }else{
              min = this.artist.coverMedia?.aPartOfAllMin -1;
            }
            if(this.artist.coverMedia?.aPartOfAllMax == null){
              max = parseInt(this.artist.albumCount) -1;
            }else{
              max = this.artist.coverMedia?.aPartOfAllMax -1;
            }
            console.log("Min: " + min);
            console.log("Max: " + max);
            console.log("media.length: " + this.media.length);
            for (let i = 0; i < this.media.length; i++){
              if(i >= min && i <= max){
                this.aPartOfAllMedia.push(this.media[i]);
              }
            }
            this.media = this.aPartOfAllMedia;
          }
  
          this.slider.update();
  
          console.log("getMediaFromArtist this.media", this.media);
    
          // Workaround as the scrollbar handle isn't visible after the immediate update
          // Seems like a size calculation issue, as resizing the browser window helps
          // Better fix for this? 
          window.setTimeout(() => {
            this.slider.update();
          }, 1000);
        });
      }
      this.getMediaFromResumeSubscription = this.mediaService.getMediaFromResume().subscribe(media => {
        this.resumemedia = media;
        console.log("getMediaFromResume in this.resumemedia", this.resumemedia);
      });
    }

    // Retreive data through subscription above
    this.mediaService.publishArtistMedia();
    this.mediaService.publishResume();

    this.mediaService.monitor$.subscribe(monitor => {
      this.monitor = monitor;
    });
  }

  ngOnDestroy(){
    this.getMediaFromResumeSubscription.unsubscribe();
    this.getMediaFromShowSubscription.unsubscribe();
    this.getMediaFromArtistSubscription.unsubscribe();
  }

  ionViewWillEnter() {
    this.mediaService.publishResume();
  }

  ionViewDidLeave() {
    if (this.activityIndicatorVisible) {
      this.activityIndicatorService.dismiss();
      this.activityIndicatorVisible = false;
    }
    this.aPartOfAllMedia = [];
  }

  coverClicked(clickedMedia: Media) {
    if(this.monitor?.monitor == "On"){
      this.activityIndicatorService.create().then(indicator => {
        this.activityIndicatorVisible = true;
        clickedMedia.resumeindex = -1;
        console.log("search:", clickedMedia);
        for (let i = 0; i < this.resumemedia.length; i++) {
          console.log("this.resumemedia[" + i + "].id:", this.resumemedia[i].id);
          if ((this.resumemedia[i].id === clickedMedia.id || this.resumemedia[i].playlistid === clickedMedia.id) || (this.resumemedia[i].artist === clickedMedia.artist && this.resumemedia[i].id === clickedMedia.id && clickedMedia.type === 'library')) {
            clickedMedia.resumeindex = i;
            console.log("found index at:", i);
            break;
          }
        }
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

  backButtonPressed(){
    if(this.resume){
      this.mediaService.setCategory("audiobook");
      this.resume = false;
    }
  }

  slideDidChange() {
    // console{}.log('Slide did change');
  }

  slidePrev() {
    this.slider.slidePrev();
  }

  slideNext() {
    this.slider.slideNext();
  }
}
