import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { ArtworkService } from '../artwork.service';
import { PlayerService, PlayerCmds } from '../player.service';
import { Media } from '../media';
import { MediaService } from '../media.service';
import { CurrentSpotify } from '../current.spotify';
import { Observable } from 'rxjs';
import { IonRange } from '@ionic/angular';

@Component({
  selector: 'app-player',
  templateUrl: './player.page.html',
  styleUrls: ['./player.page.scss'],
})
export class PlayerPage implements OnInit {
  @ViewChild("range", {static: false}) range: IonRange;

  media: Media;
  cover = '';
  playing = true;
  currentPlayedSpotify: CurrentSpotify;
  progress = 0;
  // isTouched = false;
  // currSecsText;
  // durationText;
  // currRangeTime;
  // maxRangeValue;
  public readonly spotify$: Observable<CurrentSpotify>;

  constructor(
    private mediaService: MediaService,
    private route: ActivatedRoute,
    private router: Router,
    private artworkService: ArtworkService,
    private playerService: PlayerService
  ) {
    this.spotify$ = this.mediaService.current$;
    this.route.queryParams.subscribe(params => {
      if (this.router.getCurrentNavigation().extras.state) {
        this.media = this.router.getCurrentNavigation().extras.state.media;
      }
    });
  }

  ngOnInit() {
    this.mediaService.current$.subscribe(spotify => {
      this.currentPlayedSpotify = spotify;
    });
    
    this.artworkService.getArtwork(this.media).subscribe(url => {
      this.cover = url;
    });
  }

  // sToTime(t){
  //   return this.padZero(parseInt(String((t / (60)) % 60))) + ":" +
  //     this.padZero(parseInt(String((t) % 60)));
  // }

  // padZero(v){
  //   return (v < 10) ? "0" + v : v;
  // }

  // playSong(){
  //   this.currSong.play().then(() => {
  //     this.durationText = this.sToTime(this.currentPlayedSpotify.item.duration_ms);
  //     this.maxRangeValue = Number(this.currentPlayedSpotify.item.duration_ms.toFixed(2).toString().substring(0,5));
  //   })

  //   this.currSong.addEv
  // }

  seek(){
    let newValue = this.range.value;
    let duration = this.currentPlayedSpotify.item.duration_ms;
    this.playerService.sendCmd(PlayerCmds.SEEKFORWARD);//seek(duration * (newValue / 100))add playerservice and spotifycontroll
  }

  updateProgress(){
    this.mediaService.current$.subscribe(spotify => {
      this.currentPlayedSpotify = spotify;
    });
    let seek = this.currentPlayedSpotify.progress_ms;
    console.log(this.seek);
    this.progress = (seek / this.currentPlayedSpotify.item.duration_ms) * 100 || 0;
    setTimeout(() => {
      this.updateProgress();
    }, 1000)
  }

  ionViewWillEnter() {
    this.playerService.playMedia(this.media);
    this.updateProgress();
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
