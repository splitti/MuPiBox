import { Component, OnInit, ViewChild } from '@angular/core';
import { IonSlides } from '@ionic/angular';
import { ActivatedRoute, Router, NavigationExtras } from '@angular/router';
import { MediaService } from '../media.service';
import { ArtworkService } from '../artwork.service';
import { PlayerService } from '../player.service';
import { ActivityIndicatorService } from '../activity-indicator.service';
import { Media } from '../media';
import { Artist } from '../artist';

@Component({
  selector: 'app-medialist',
  templateUrl: './medialist.page.html',
  styleUrls: ['./medialist.page.scss'],
})
export class MedialistPage implements OnInit {
  @ViewChild('slider', { static: false }) slider: IonSlides;

  artist: Artist;
  media: Media[] = [];
  covers = {};
  activityIndicatorVisible = false;
  aPartOfAllMedia: Media[] = [];

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
      }
    });
  }

  ngOnInit() {
    // Subscribe
    console.log("this.artist");
    console.log(this.artist);
    
    if(this.artist.coverMedia.showid && this.artist.coverMedia.showid.length > 0){
      this.mediaService.getMediaFromShow(this.artist).subscribe(media => {
        this.media = media;
  
        this.media.forEach(currentMedia => {
          this.artworkService.getArtwork(currentMedia).subscribe(url => {
            this.covers[currentMedia.title] = url;
          });
        });

        console.log("ShowID this.media all");
        console.log(this.media);

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

        console.log("if ShowID this.media");
        console.log(this.media);
  
        // Workaround as the scrollbar handle isn't visible after the immediate update
        // Seems like a size calculation issue, as resizing the browser window helps
        // Better fix for this? 
        window.setTimeout(() => {
          this.slider.update();
        }, 1000);
      });
    } else {
      this.mediaService.getMediaFromArtist(this.artist).subscribe(media => {
        this.media = media;
  
        this.media.forEach(currentMedia => {
          this.artworkService.getArtwork(currentMedia).subscribe(url => {
            this.covers[currentMedia.title] = url;
          });
        });

        console.log("getMediaFromArtist this.media all");
        console.log(this.media);

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

        console.log("getMediaFromArtist this.media");
        console.log(this.media);
  
        // Workaround as the scrollbar handle isn't visible after the immediate update
        // Seems like a size calculation issue, as resizing the browser window helps
        // Better fix for this? 
        window.setTimeout(() => {
          this.slider.update();
        }, 1000);
      });

    }

    // Retreive data through subscription above
    this.mediaService.publishArtistMedia();
  }

  ionViewDidLeave() {
    if (this.activityIndicatorVisible) {
      this.activityIndicatorService.dismiss();
      this.activityIndicatorVisible = false;
    }
    this.aPartOfAllMedia = [];
  }

  coverClicked(clickedMedia: Media) {
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

  mediaNameClicked(clickedMedia: Media) {
    this.playerService.getConfig().subscribe(config => {
      if (config.tts == null || config.tts.enabled === true) {
        this.playerService.say(clickedMedia.title);
      }
    });
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
