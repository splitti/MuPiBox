import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { ArtworkService } from '../artwork.service';
import { PlayerService, PlayerCmds } from '../player.service';
import { Media } from '../media';
import { MediaService } from '../media.service';
import { CurrentSpotify } from '../current.spotify';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-player',
  templateUrl: './player.page.html',
  styleUrls: ['./player.page.scss'],
})
export class PlayerPage implements OnInit {

  media: Media;
  cover = '';
  playing = true;
  public readonly spotify$: Observable<CurrentSpotify>;
  //currentPlayedSpotify: Observable<CURRENTSPOTIFY>;
  //currentPlayedLocal: Observable<Network>;

  constructor(
    private mediaService: MediaService,
    private route: ActivatedRoute,
    private router: Router,
    private artworkService: ArtworkService,
    private playerService: PlayerService
  ) {
    this.route.queryParams.subscribe(params => {
      if (this.router.getCurrentNavigation().extras.state) {
        this.media = this.router.getCurrentNavigation().extras.state.media;
      }
    });
    if(this.media.type === 'spotify'){
      this.spotify$ = this.mediaService.current$;
    }else if(this.media.type === 'library'){

    }
  }

  ngOnInit() {
    // this.mediaService.getCurrentSpotify().subscribe(spotify: CURRENTSPOTIFY => {
    //   this.currentPlayedSpotify = spotify;
    // });
    //setInterval(this.subscribtion, 1000);
    
    this.artworkService.getArtwork(this.media).subscribe(url => {
      this.cover = url;
    });
  }

  // subscribtion(){
  //   this.currentPlayedSpotify = this.mediaService.getCurrentSpotify();
  // }

  ionViewWillEnter() {
    this.playerService.playMedia(this.media);
  }

  ionViewWillLeave() {
    this.playerService.sendCmd(PlayerCmds.STOP);
  }

  volUp() {
    this.playerService.sendCmd(PlayerCmds.VOLUMEUP);
  }

  volDown() {
    this.playerService.sendCmd(PlayerCmds.VOLUMEDOWN);
  }

  skipPrev() {
    if (this.playing) {
      this.playerService.sendCmd(PlayerCmds.PREVIOUS);
    } else {
      this.playing = true;
      this.playerService.sendCmd(PlayerCmds.PREVIOUS);
    }
  }

  skipNext() {
    if (this.playing) {
      this.playerService.sendCmd(PlayerCmds.NEXT);
    } else {
      this.playing = true;
      this.playerService.sendCmd(PlayerCmds.NEXT);
    }
  }

  playPause() {
    if (this.playing) {
      this.playing = false;
      this.playerService.sendCmd(PlayerCmds.PAUSE);
    } else {
      this.playing = true;
      this.playerService.sendCmd(PlayerCmds.PLAY);
    }
  }

  seekForward() {
    this.playerService.sendCmd(PlayerCmds.SEEKFORWARD);
  }

  seekBack() {
    this.playerService.sendCmd(PlayerCmds.SEEKBACK);
  }
}
