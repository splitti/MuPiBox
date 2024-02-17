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
import { CurrentPlaylist } from '../current.playlist';
import { CurrentEpisode } from '../current.episode';
import { CurrentShow } from '../current.show';
import { Monitor } from '../monitor';
import { AlbumStop } from '../albumstop';

@Component({
  selector: 'app-player',
  templateUrl: './player.page.html',
  styleUrls: ['./player.page.scss'],
})
export class PlayerPage implements OnInit {
  @ViewChild("range", {static: false}) range: IonRange;

  media: Media;
  monitor: Monitor;
  albumStop: AlbumStop;
  resumePlay = false;
  cover = '';
  playing = true;
  updateProgression = false;
  currentPlayedSpotify: CurrentSpotify;
  currentPlayedLocal: CurrentMPlayer;
  currentPlaylist: CurrentPlaylist;
  currentEpisode: CurrentEpisode;
  currentShow: CurrentShow;
  playlistTrackNr = 0;
  showTrackNr = 0;
  goBackTimer = 0;
  progress = 0;
  shufflechanged = 0;
  tmpProgressTime = 0;
  public readonly spotify$: Observable<CurrentSpotify>;
  public readonly local$: Observable<CurrentMPlayer>;
  public readonly playlist$: Observable<CurrentPlaylist>;
  public readonly episode$: Observable<CurrentEpisode>;
  public readonly show$: Observable<CurrentShow>;

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
    this.episode$ = this.mediaService.episode$;
    this.show$ = this.mediaService.show$;
    this.route.queryParams.subscribe(params => {
      if (this.router.getCurrentNavigation().extras.state.media) {
        this.media = this.router.getCurrentNavigation().extras.state.media;
        if(this.media.category === "resume") {this.resumePlay = true;}
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
    this.mediaService.episode$.subscribe(episode => {
      this.currentEpisode = episode;
    });
    this.mediaService.show$.subscribe(show => {
      this.currentShow = show;
    });
    this.artworkService.getArtwork(this.media).subscribe(url => {
      this.cover = url;
    });
    this.mediaService.monitor$.subscribe(monitor => {
      this.monitor = monitor;
    });
    this.mediaService.albumStop$.subscribe(albumStop => {
      this.albumStop = albumStop;
    });
  }

  seek(){
    if(this.monitor?.monitor == "On"){
      let newValue = +this.range.value;
      if(this.media.type === 'spotify'){
        if(this.media.showid?.length > 0){
          let duration = this.currentEpisode?.duration_ms;
          this.playerService.seekPosition(duration * (newValue / 100));
        }else{
          let duration = this.currentPlayedSpotify?.item.duration_ms;
          this.playerService.seekPosition(duration * (newValue / 100));
        }
      } else if (this.media.type === 'library' || this.media.type === 'rss'){
        this.playerService.seekPosition(newValue);
      }
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
    this.mediaService.episode$.subscribe(episode => {
      this.currentEpisode = episode;
    });
    this.mediaService.show$.subscribe(show => {
      this.currentShow = show;
    });

    this.playing = !this.currentPlayedLocal?.pause;

    if(this.media.type === 'spotify'){
      let seek = this.currentPlayedSpotify?.progress_ms || 0;
      if (this.media.showid?.length > 0) {
        this.progress = (seek / this.currentEpisode?.duration_ms) * 100 || 0;
      }else{
        if(this.currentPlayedSpotify?.item != null){
          this.progress = (seek / this.currentPlayedSpotify?.item.duration_ms) * 100 || 0;
        }
      }
      if(this.media.playlistid){
        this.currentPlaylist?.items.forEach((element, index) => {
          if(this.currentPlayedSpotify?.item.id === element.track?.id){
            this.playlistTrackNr = ++index;
            this.cover = element.track.album.images[1].url;
          }
        });
      }
      if(this.media.showid){
        this.currentShow?.items.forEach((element, index) => {
          if(this.currentPlayedLocal?.activeEpisode === element?.id){
            this.showTrackNr = this.currentEpisode.show.total_episodes - index;
            this.cover = element.images[1].url;
          }
        });
      }
      if(this.playing && !this.currentPlayedSpotify?.is_playing){
        this.goBackTimer++;
        if(this.goBackTimer > 10){
          this.navController.back();
        }
      }
      setTimeout(() => {
        if(this.updateProgression){
          this.updateProgress();
        }
      }, 1000)
    } else if (this.media.type === 'library' || this.media.type === 'rss'){
      let seek = this.currentPlayedLocal?.progressTime || 0;
      this.progress = seek || 0;
      if(this.media.type === 'library' && this.playing && !this.currentPlayedLocal?.playing && this.currentPlayedLocal?.currentTracknr === this.currentPlayedLocal?.totalTracks){
        this.goBackTimer++;
        if(this.goBackTimer > 10){
          this.navController.back();
        }
      }
      if(this.media.type === 'rss' && this.playing && !this.currentPlayedLocal?.playing){
        this.goBackTimer++;
        if(this.goBackTimer > 100){
          this.navController.back();
        }
      }
      setTimeout(() => {
        if(this.updateProgression){
          this.updateProgress();
        }
      }, 1000)
    }
  }

  ionViewWillEnter() {
    console.log(this.media);
    this.updateProgression = true;
    if (this.resumePlay){
      this.resumePlayback();
    } else{
      this.playerService.playMedia(this.media);
    }
    this.updateProgress();
    
    if(this.media.shuffle){
      setTimeout(() => {
        this.playerService.sendCmd(PlayerCmds.SHUFFLEON);
        setTimeout(() => {
          this.skipNext();
        }, 1000) 
      }, 5000)
    }
  }

  ionViewWillLeave() {
    if(this.media.type === 'spotify' || this.media.type === 'library' || this.media.type === 'rss'){
      this.saveResumeFiles();
    }
    this.resumePlay = false;
    this.updateProgression = false;
    if(this.media.shuffle || this.shufflechanged){
      this.playerService.sendCmd(PlayerCmds.SHUFFLEOFF);
    }
    this.playerService.sendCmd(PlayerCmds.STOP);
    if((this.media.type === 'spotify' &&  (this.media.category === 'music' || this.media.category === 'other'))) {
      if(this.shufflechanged % 2 === 1){
        this.mediaService.editRawMediaAtIndex(this.media.index, this.media);
      }
    }
    if(this.albumStop?.albumStop == "On"){
      this.playerService.sendCmd(PlayerCmds.ALBUMSTOP);
    } 
  }

  resumePlayback(){
    if(this.media.type === 'spotify' && !this.media.shuffle){
      this.playerService.resumeMedia(this.media);
    } else if (this.media.type === 'library'){
      this.playerService.playMedia(this.media);
      let j = 1;
      for(let i = 1; i < this.media.resume.local.currentTracknr; i++){
        setTimeout(() => {
          this.skipNext();
          j = i + 1;
          if(j === this.media.resume.local.currentTracknr){
            setTimeout(() => {
              this.playerService.seekPosition(this.media.resume.local.progressTime);
            }, 2000) 
          }
        }, 2000)
      }
      if (this.media.resume.local.currentTracknr === 1){
        setTimeout(() => {
          this.playerService.seekPosition(this.media.resume.local.progressTime);
        }, 2000)
      }
    } else if (this.media.type === 'rss'){
      this.playerService.playMedia(this.media);
      setTimeout(() => {
        this.playerService.seekPosition(this.media.resume.local.progressTime);
      }, 2000)
    }
  }

  saveResumeFiles(){
    console.log("Add media to resume");
    console.log(this.media);
    this.mediaService.current$.subscribe(spotify => {
      this.currentPlayedSpotify = spotify;
    });
    this.mediaService.local$.subscribe(local => {
      this.currentPlayedLocal = local;
    });
    this.mediaService.episode$.subscribe(episode => {
      this.currentEpisode = episode;
    });
    /* if(this.media.type === 'spotify' && this.media?.showid){
      this.media.resume.spotify.track_number = 1;
      this.media.resume.spotify.progress_ms = this.currentPlayedSpotify?.progress_ms  || 0;
      this.media.resume.spotify.duration_ms = this.currentEpisode?.duration_ms || 0;
    } else if(this.media.type === 'spotify'){
      if(this.media.playlistid){
        this.media.resume.spotify.track_number = this.playlistTrackNr  || 0;
      }else{
        this.media.resume.spotify.track_number = this.currentPlayedSpotify?.item.track_number  || 0;
      }
      this.media.resume.spotify.progress_ms = this.currentPlayedSpotify?.progress_ms  || 0;
      this.media.resume.spotify.duration_ms = this.currentPlayedSpotify?.item.duration_ms || 0;
    } else if (this.media.type === 'library'){
      this.media.resume.local.album = this.currentPlayedLocal?.album || "";
      this.media.resume.local.currentTracknr = this.currentPlayedLocal?.currentTracknr  || 0;
      this.media.resume.local.progressTime = this.currentPlayedLocal?.progressTime  || 0;
    } else if (this.media.type === 'rss'){
      this.media.resume.rss.progressTime = this.currentPlayedLocal?.progressTime  || 0;
    } */
    this.media.category = "resume";
    console.log("Save progress");
    console.log(this.media);
    this.mediaService.addRawMedia(this.media);
    this.playerService.sendCmd(PlayerCmds.INDEX);
  }

  volUp() {
    if(this.monitor?.monitor == "On"){
      this.playerService.sendCmd(PlayerCmds.VOLUMEUP);
    }
  }

  volDown() {
    if(this.monitor?.monitor == "On"){
      this.playerService.sendCmd(PlayerCmds.VOLUMEDOWN);
    }
  }

  skipPrev() {
    if(this.monitor?.monitor == "On"){
      if (this.playing) {
        this.playerService.sendCmd(PlayerCmds.PREVIOUS);
      } else {
        this.playing = true;
        this.playerService.sendCmd(PlayerCmds.PREVIOUS);
      }
    }
  }

  skipNext() {
    if(this.monitor?.monitor == "On"){
      if (this.playing) {
        this.playerService.sendCmd(PlayerCmds.NEXT);
      } else {
        this.playing = true;
        this.playerService.sendCmd(PlayerCmds.NEXT);
      }
    }
  }

  toggleshuffle(){
    if(this.monitor?.monitor == "On"){
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
  }

  playPause() {
    if(this.monitor?.monitor == "On"){
      if (this.playing) {
        //this.playing = false;
        this.playerService.sendCmd(PlayerCmds.PAUSE);
      } else {
        //this.playing = true;
        this.playerService.sendCmd(PlayerCmds.PLAY);
      }
      if(this.media.type === 'spotify' || this.media.type === 'library' || this.media.type === 'rss'){
        this.saveResumeFiles();
      }
    }
  }

  seekForward() {
    if(this.monitor?.monitor == "On"){
      this.playerService.sendCmd(PlayerCmds.SEEKFORWARD);
    }
  }

  seekBack() {
    if(this.monitor?.monitor == "On"){
      this.playerService.sendCmd(PlayerCmds.SEEKBACK);
    }
  }
}
