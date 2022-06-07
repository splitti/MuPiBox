import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { ArtworkService } from '../artwork.service';
import { PlayerService, PlayerCmds } from '../player.service';
import { Media } from '../media';
import { MediaService } from '../media.service';
import { CurrentSpotify } from '../current.spotify';
import { CurrentMPlayer } from '../current.mplayer';
import { Observable } from 'rxjs';
import { IonRange, NavController } from '@ionic/angular';
import { Resume } from '../resume';
import { CurrentPlaylist } from '../current.playlist';

@Component({
  selector: 'app-player',
  templateUrl: './player.page.html',
  styleUrls: ['./player.page.scss'],
})
export class PlayerPage implements OnInit {
  @ViewChild("range", {static: false}) range: IonRange;

  media: Media;
  resume: Resume;
  saveMedia: Media = {
    index: 0,
    type: "spotify",
    category: "playlist",
    id: "",
    title: "",
    shuffle: true,
  }
  resumePlay = false;
  resumeFile: Resume = {
    spotify:{
      track_number: 0,
      progress_ms: 0,
      duration_ms: 0,
    },
    local: {
      album: "",
      currentTracknr: 0,
      progressTime: 0,
    }
  };
  cover = '';
  playing = true;
  updateProgression = false;
  currentPlayedSpotify: CurrentSpotify;
  currentPlayedLocal: CurrentMPlayer;
  currentPlaylist: CurrentPlaylist;
  progress = 0;
  shufflechanged = 0;
  public readonly spotify$: Observable<CurrentSpotify>;
  public readonly local$: Observable<CurrentMPlayer>;
  public readonly playlist$: Observable<CurrentPlaylist>;

  constructor(
    private mediaService: MediaService,
    private route: ActivatedRoute,
    private router: Router,
    private artworkService: ArtworkService,
    private navController: NavController,
    private playerService: PlayerService
  ) {
    this.spotify$ = this.mediaService.current$;
    this.local$ = this.mediaService.local$;
    this.playlist$ = this.mediaService.playlist$;
    this.route.queryParams.subscribe(params => {
      if (this.router.getCurrentNavigation().extras.state.media) {
        this.media = this.router.getCurrentNavigation().extras.state.media;
      }
    });
    this.route.queryParams.subscribe(params => {
      if (this.router.getCurrentNavigation().extras.state.resume) {
        this.resume = this.router.getCurrentNavigation().extras.state.resume;
        this.resumePlay = true;
      }
    });
  }

  ngOnInit() {
    this.mediaService.current$.subscribe(spotify => {
      this.currentPlayedSpotify = spotify;
    });
    this.mediaService.local$.subscribe(local => {
      this.currentPlayedLocal = local;
    });
    this.mediaService.playlist$.subscribe(playlist => {
      this.currentPlaylist = playlist;
    });
    this.artworkService.getArtwork(this.media).subscribe(url => {
      this.cover = url;
    });
  }

  seek(){
    let newValue = +this.range.value;
    if(this.media.type === 'spotify'){
      let duration = this.currentPlayedSpotify.item.duration_ms;
      this.playerService.seekPosition(duration * (newValue / 100));
    } else if (this.media.type === 'library'){
      this.playerService.seekPosition(newValue);
    }
    
  }

  updateProgress(){
    this.mediaService.current$.subscribe(spotify => {
      this.currentPlayedSpotify = spotify;
    });
    this.mediaService.local$.subscribe(local => {
      this.currentPlayedLocal = local;
    });
    this.mediaService.playlist$.subscribe(playlist => {
      this.currentPlaylist = playlist;
    });
    if(this.progress > 1){
      if(this.playing && !this.currentPlayedSpotify.is_playing && !this.currentPlayedLocal.playing){
        this.navController.back();
      }
    }
    if(this.media.type === 'spotify'){
      let seek = this.currentPlayedSpotify?.progress_ms || 0;
      this.progress = (seek / this.currentPlayedSpotify?.item.duration_ms) * 100 || 0;
      setTimeout(() => {
        if(this.updateProgression){
          this.updateProgress();
        }
      }, 1000)
    } else if (this.media.type === 'library'){
      let seek = this.currentPlayedLocal?.progressTime || 0;
      this.progress = seek || 0;
      setTimeout(() => {
        if(this.updateProgression){
          this.updateProgress();
        }
      }, 1000)
    }
  }

  ionViewWillEnter() {
    console.log(this.media);
    this.currentPlaylist?.items.forEach(element => {
      console.log(element.track?.name);
    });
    this.updateProgression = true;
    this.playerService.playMedia(this.media);
    this.updateProgress();
    if (this.resumePlay){
      this.resumePlayback();
    }
    if(this.media.shuffle){
      setTimeout(() => {
        this.playerService.sendCmd(PlayerCmds.SHUFFLEON);
      }, 500)
      setTimeout(() => {
        this.skipNext();
      }, 1000) 
    }
  }

  ionViewWillLeave() {
    if((this.media.type === 'spotify' && this.currentPlayedSpotify.currently_playing_type !== 'episode') || this.media.type === 'library'){
      this.saveResumeFiles();
    }
    this.resumePlay = false;
    this.updateProgression = false;
    this.playerService.sendCmd(PlayerCmds.SHUFFLEOFF);
    this.playerService.sendCmd(PlayerCmds.STOP);
    if(this.media.type === 'spotify' && (this.media.category === 'playlist' || this.media.category === 'music')) {
      if(this.shufflechanged % 2 === 1){
        this.saveMedia.shuffle = this.media?.shuffle;
        this.saveMedia.index = this.media?.index;
        this.saveMedia.id = this.media?.id;
        this.saveMedia.title = this.media?.title;
        this.saveMedia.type = this.media?.type;
        this.saveMedia.category = this.media?.category;
        this.mediaService.editRawMediaAtIndex(this.saveMedia.index, this.saveMedia);
      }
    } 
  }

  resumePlayback(){
    if(this.media.type === 'spotify' && !this.media.shuffle){
      let j = 1;
      for(let i = 1; i < this.resume.spotify.track_number; i++){
        setTimeout(() => {
          this.skipNext();
          j = i + 1;
          if(j === this.resume.spotify.track_number){
            setTimeout(() => {
              this.playerService.seekPosition(this.resume.spotify.duration_ms * (this.resume.spotify.progress_ms / 100));
            }, 2000)
          }
        }, 2000)
      }
      if (this.resume.spotify.track_number === 1){
        setTimeout(() => {
          this.playerService.seekPosition(this.resume.spotify.duration_ms * (this.resume.spotify.progress_ms / 100));
        }, 2000)
      }
    } else if (this.media.type === 'library'){
      let j = 1;
      for(let i = 1; i < this.resume.local.currentTracknr; i++){
        setTimeout(() => {
          this.skipNext();
          j = i + 1;
          if(j === this.resume.local.currentTracknr){
            setTimeout(() => {
              this.playerService.seekPosition(this.resume.local.progressTime);
            }, 2000) 
          }
        }, 2000)
      }
      if (this.resume.local.currentTracknr === 1){
        setTimeout(() => {
          this.playerService.seekPosition(this.resume.local.progressTime);
        }, 2000)
      }
    }
  }

  saveResumeFiles(){
    this.mediaService.current$.subscribe(spotify => {
      this.currentPlayedSpotify = spotify;
    });
    this.mediaService.local$.subscribe(local => {
      this.currentPlayedLocal = local;
    });
    if(this.media.type === 'spotify'){
      this.resumeFile.spotify.track_number = this.currentPlayedSpotify.item.track_number  || 0;
      this.resumeFile.spotify.progress_ms = this.currentPlayedSpotify.progress_ms  || 0;
      this.resumeFile.spotify.duration_ms = this.currentPlayedSpotify.item.duration_ms || 0;
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

  toggleshuffle(){
    if (this.media.shuffle) {
      this.shufflechanged++;
      this.media.shuffle = false;
      this.playerService.sendCmd(PlayerCmds.SHUFFLEOFF);
    } else {
      this.shufflechanged++;
      this.media.shuffle = true;
      this.playerService.sendCmd(PlayerCmds.SHUFFLEON);
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
    if((this.media.type === 'spotify' && this.currentPlayedSpotify.currently_playing_type !== 'episode') || this.media.type === 'library'){
      this.saveResumeFiles();
    }
  }

  seekForward() {
    this.playerService.sendCmd(PlayerCmds.SEEKFORWARD);
  }

  seekBack() {
    this.playerService.sendCmd(PlayerCmds.SEEKBACK);
  }
}
