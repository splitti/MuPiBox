import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { ArtworkService } from '../artwork.service';
import { PlayerService, PlayerCmds } from '../player.service';
import { Media } from '../media';
import { MediaService } from '../media.service';
import { CurrentSpotify } from '../current.spotify';
import { CurrentMPlayer } from '../current.mplayer';
import { Observable } from 'rxjs';
import { IonRange } from '@ionic/angular';
import { Resume } from '../resume';

@Component({
  selector: 'app-player',
  templateUrl: './player.page.html',
  styleUrls: ['./player.page.scss'],
})
export class PlayerPage implements OnInit {
  @ViewChild("range", {static: false}) range: IonRange;

  media: Media;
  resume: Resume;
  resumeFile: Resume = {
    spotify:{
      id: "",
      track_number: 0,
      progress_ms: 0,
    },
    local: {
      album: "",
      currentTracknr: 0,
      progressTime: 0,
    }
  };
  cover = '';
  playing = true;
  currentPlayedSpotify: CurrentSpotify;
  currentPlayedLocal: CurrentMPlayer;
  progress = 0;
  public readonly spotify$: Observable<CurrentSpotify>;
  public readonly local$: Observable<CurrentMPlayer>;

  constructor(
    private mediaService: MediaService,
    private route: ActivatedRoute,
    private router: Router,
    private artworkService: ArtworkService,
    private playerService: PlayerService
  ) {
    this.spotify$ = this.mediaService.current$;
    this.local$ = this.mediaService.local$;
    this.route.queryParams.subscribe(params => {
      if (this.router.getCurrentNavigation().extras.state.media) {
        this.media = this.router.getCurrentNavigation().extras.state.media;
      }
    });
    this.route.queryParams.subscribe(params => {
      if (this.router.getCurrentNavigation().extras.state.resume) {
        this.resume = this.router.getCurrentNavigation().extras.state.resume;
      }
    });
  }

  ngOnInit() {
    console.log(this.media.type);
    this.mediaService.current$.subscribe(spotify => {
      this.currentPlayedSpotify = spotify;
    });
    this.mediaService.local$.subscribe(local => {
      this.currentPlayedLocal = local;
    });

    this.artworkService.getArtwork(this.media).subscribe(url => {
      this.cover = url;
    });
  }

  seek(){
    console.log(this.media.type);
    let newValue = +this.range.value;
    if(this.media.type === 'spotify'){
      let duration = this.currentPlayedSpotify.item.duration_ms;
      this.playerService.seekPosition(duration * (newValue / 100));
    } else if (this.media.type === 'library'){
      this.playerService.seekPosition(newValue);
    }
    
  }

  updateProgress(){
    console.log(this.media.type);
    this.mediaService.current$.subscribe(spotify => {
      this.currentPlayedSpotify = spotify;
    });
    this.mediaService.local$.subscribe(local => {
      this.currentPlayedLocal = local;
    });
    if(this.media.type === 'spotify'){
      let seek = this.currentPlayedSpotify?.progress_ms || 0;
      console.log(seek);
      this.progress = (seek / this.currentPlayedSpotify?.item.duration_ms) * 100 || 0;
      setTimeout(() => {
        this.updateProgress();
      }, 1000)
    } else if (this.media.type === 'library'){
      let seek = this.currentPlayedLocal?.progressTime || 0;
      console.log(seek);
      this.progress = seek || 0;
      setTimeout(() => {
        this.updateProgress();
      }, 1000)
    }
  }

  ionViewWillEnter() {
    console.log(this.media);
    this.playerService.playMedia(this.media);
    this.updateProgress();
  }

  ionViewWillLeave() {
    this.saveResumeFiles();
    this.playerService.sendCmd(PlayerCmds.STOP);
  }

  saveResumeFiles(){
    this.mediaService.current$.subscribe(spotify => {
      this.currentPlayedSpotify = spotify;
    });
    this.mediaService.local$.subscribe(local => {
      this.currentPlayedLocal = local;
    });
    if(this.media.type === 'spotify'){
      this.resumeFile.spotify.id = this.currentPlayedSpotify.item.album.id || "";
      this.resumeFile.spotify.track_number = this.currentPlayedSpotify.item.track_number  || 0;
      this.resumeFile.spotify.progress_ms = this.currentPlayedSpotify.progress_ms  || 0;
    } else if (this.media.type === 'library'){
      this.resumeFile.local.album = this.currentPlayedLocal.album || "";
      this.resumeFile.local.currentTracknr = this.currentPlayedLocal.currentTracknr  || 0;
      this.resumeFile.local.progressTime = this.currentPlayedLocal.progressTime  || 0;
    }
    this.mediaService.saveMedia(this.media);
    this.mediaService.saveResume(this.resumeFile);
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
