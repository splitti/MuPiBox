import { Component, OnInit, ViewEncapsulation, AfterViewInit, ViewChild } from '@angular/core';
import { NavController, IonSelect, IonInput, IonSegment, AlertController } from '@ionic/angular';
import { MediaService } from '../media.service';
import { Media } from '../media';
import Keyboard from 'simple-keyboard';
import { NgForm } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PlayerCmds, PlayerService } from '../player.service';
import { Observable } from 'rxjs';
import { Validate } from '../validate';

@Component({
  selector: 'app-add',
  encapsulation: ViewEncapsulation.None,
  templateUrl: './add.page.html',
  styleUrls: [
    './add.page.scss',
    '../../../node_modules/simple-keyboard/build/css/index.css'
  ]
})
export class AddPage implements OnInit, AfterViewInit {
  //@ViewChild('segment', { static: false }) segment: IonSegment;
  //@ViewChild('select', { static: false }) select: IonSelect;
  //@ViewChild('searchTypeSelect', { static: false }) searchTypeSelect: IonSelect;

  //@ViewChild('audiobook_segment', { static: false }) audiobookSegment: IonSelect;
  //@ViewChild('music_segment', { static: false }) musicSegment: IonSelect;
  //@ViewChild('playlist_segment', { static: false }) playlistSegment: IonSelect;
  //@ViewChild('radio_segment', { static: false }) radioSegment: IonSelect;

/*   @ViewChild('spotify_artist', { static: false }) spotifyArtist: IonInput;
  @ViewChild('spotify_id', { static: false }) spotifyID: IonInput;
  @ViewChild('spotify_showid', { static: false }) spotifyShowID: IonInput;
  @ViewChild('spotify_artistid', { static: false }) spotifyArtistID: IonInput;
  @ViewChild('spotify_title', { static: false }) spotifyTitle: IonInput;
  @ViewChild('spotify_query', { static: false }) spotifyQuery: IonInput;
  @ViewChild('radio_title', { static: false }) radioTitle: IonInput;
  @ViewChild('radio_id', { static: false }) radioID: IonInput;
  @ViewChild('radio_cover', { static: false }) radioCover: IonInput; */

  source = 'spotify';
  category = 'audiobook';
  searchType = 'media_id';
  keyboard: Keyboard;
  selectedInputElem: any;
  valid = false;
  editMedia: Media; 
  edit = false;
  shuffle = false;
  firstInput = true;
  validateState: Validate;

  categoryIcons = {
    audiobook: 'book-outline',
    music: 'musical-notes-outline',
    playlist: 'document-text-outline',
    radio: 'radio-outline'
  };

  public readonly validate$: Observable<Validate>;

  constructor(
    private mediaService: MediaService,
    private navController: NavController,
    private route: ActivatedRoute,
    private router: Router,
    private playerService: PlayerService,
    public alertController: AlertController,
  ) {
    this.validate$ = this.mediaService.validate$;
    this.route.queryParams.subscribe(params => {
      if (this.router.getCurrentNavigation().extras.state) {
        this.editMedia = this.router.getCurrentNavigation().extras.state.media;
        this.edit = true;
      }
    });
  }

  ngOnInit() {
    if(this.edit){
      this.source = this.editMedia.type;
      this.category = this.editMedia.category;
      this.shuffle = this.editMedia.shuffle;
      if(this.source === 'spotify' && this.editMedia?.query) {
        this.searchType = 'query';
      }else if(this.source === 'spotify' && this.editMedia?.artistid) {
        this.searchType = 'artist_id';
      }else if(this.source === 'spotify' && this.editMedia?.id) {
        this.searchType = 'media_id';
      }else if(this.source === 'spotify' && this.editMedia?.showid) {
        this.searchType = 'show_id';
      }
    }
    this.mediaService.validate$.subscribe(validate => {
      this.validateState = validate;
    });
  }

  ngAfterViewInit() {
    //this.radioSegment.disabled = true;

    this.keyboard = new Keyboard({
      onChange: input => {
        this.selectedInputElem.value = input;

        console.log(this.selectedInputElem);
        console.log(this.selectedInputElem.value);

        this.validate();
      },
      onKeyPress: button => {
        this.handleLayoutChange(button);
      },
      theme: 'hg-theme-default hg-theme-ios',
      layout: {
        default: [
          'q w e r t z u i o p ü',
          'a s d f g h j k l ö ä',
          '{shift} y x c v b n m {shift}',
          '{alt} , {space} . {bksp}'
        ],
        shift: [
          'Q W E R T Z U I O P Ü',
          'A S D F G H J K L Ö Ä',
          '{shiftactivated} Y X C V B N M {shift}',
          '{alt} , {space} . {bksp}'
        ],
        alt: [
          '1 2 3 4 5 6 7 8 9 0 =',
          `% @ # $ § & * ° ^ / \\ ' "`,
          '_ ~ - + ; : { } [ ] ( )',
          '{default} ! {space} ? {bksp}'
        ]
      },
      display: {
        '{alt}': '123',
        '{smileys}': '\uD83D\uDE03',
        '{shift}': '⇧',
        '{shiftactivated}': '⇧',
        '{enter}': '⮐ ',
        '{bksp}': '⌫',
        '{altright}': '123',
        '{downkeyboard}': '🞃',
        '{space}': ' ',
        '{default}': 'ABC',
        '{back}': '⇦'
      }
    });

    this.selectedInputElem = document.querySelector('ion-input:first-child');

    this.validate();
    //this.categoryChanged();
  }

  ionViewWillLeave() {
    this.edit = false;
  }

  cancelButtonPressed() {
    this.navController.back();
  }

  /* categoryButtonPressed(event: any) {
    this.select.open(event);
  } */

  /* categoryChanged() {
    if (this.category === 'radio' && this.source !== 'radio') {
      this.source = 'radio';
    } else if (this.category !== 'radio' && this.source === 'radio') {
      this.source = 'spotify';
    }
    this.keyboard.clearInput('spotify_artist');
    this.keyboard.clearInput('spotify_title');
    this.keyboard.clearInput('spotify_id');
    this.keyboard.clearInput('spotify_showid');
    this.keyboard.clearInput('spotify_artistid');
    this.keyboard.clearInput('spotify_query');

    this.keyboard.clearInput('radio_title');
    this.keyboard.clearInput('radio_id');
    this.keyboard.clearInput('radio_cover');
    this.validate();
  } */

  searchTypeChanged() {
    this.keyboard.clearInput('spotify_artist');
    this.keyboard.clearInput('spotify_title');
    this.keyboard.clearInput('spotify_id');
    this.keyboard.clearInput('spotify_showid');
    this.keyboard.clearInput('spotify_artistid');
    this.keyboard.clearInput('spotify_query');

    this.keyboard.clearInput('radio_title');
    this.keyboard.clearInput('radio_id');
    this.keyboard.clearInput('radio_cover');
    this.validate();
  }

  focusChanged(event: any) {
    this.selectedInputElem = event.target;

    this.keyboard.setOptions({
      inputName: event.target.name
    });

    if(this.edit){
      switch (event.target.name) {
        case 'spotify_artist':
          this.keyboard.setInput(this.editMedia.artist, event.target.name);
          break;
        case 'spotify_title':
          this.keyboard.setInput(this.editMedia.title, event.target.name);
          break;
        case 'spotify_id':
          this.keyboard.setInput(this.editMedia.id, event.target.name);
          break;
        case 'spotify_showid':
          this.keyboard.setInput(this.editMedia.showid, event.target.name);
          break;
        case 'spotify_artistid':
          this.keyboard.setInput(this.editMedia.artistid, event.target.name);
          break;
        case 'spotify_query':
          this.keyboard.setInput(this.editMedia.query, event.target.name);
          break;
        case 'radio_title':
          this.keyboard.setInput(this.editMedia.title, event.target.name);
          break;
        case 'radio_id':
          this.keyboard.setInput(this.editMedia.id, event.target.name);
          break;
        case 'radio_cover':
          this.selectedInputElem.value = this.editMedia.cover;
          break;
      }
    }
  }

  inputChanged(event: any) {
    this.keyboard.setInput(event.target.value, event.target.name);
    this.validate();
  }

  handleLayoutChange(button) {
    const currentLayout = this.keyboard.options.layoutName;
    let layout: string;

    switch (button) {
      case '{shift}':
      case '{shiftactivated}':
      case '{default}':
        layout = currentLayout === 'default' ? 'shift' : 'default';
        break;
      case '{alt}':
      case '{altright}':
        layout = currentLayout === 'alt' ? 'default' : 'alt';
        break;
      case '{smileys}':
        layout = currentLayout === 'smileys' ? 'default' : 'smileys';
        break;
      default:
        break;
    }

    if (layout) {
      this.keyboard.setOptions({
        layoutName: layout
      });
    }
  }

  segmentChanged(event: any) {
    this.category = event.detail.value;
    if (event.detail.value === 'radio'){
      this.source = 'radio';
    }else{
      this.source = 'spotify';
    }
    window.setTimeout(() => { // wait for new elements to be visible before altering them
      this.keyboard.clearInput('spotify_artist');
      this.keyboard.clearInput('spotify_title');
      this.keyboard.clearInput('spotify_id');
      this.keyboard.clearInput('spotify_showid');
      this.keyboard.clearInput('spotify_artistid');
      this.keyboard.clearInput('spotify_query');

      this.keyboard.clearInput('radio_title');
      this.keyboard.clearInput('radio_id');
      this.keyboard.clearInput('radio_cover');
      this.validate();
    }, 10);
  }

  submit(form: NgForm) {
    const media: Media = {
      type: this.source,
      category: this.category,
      shuffle: this.shuffle,
    };

    if (this.source === 'spotify') {
      if (form.form.value.spotify_artist?.length) { media.artist = form.form.value.spotify_artist; }
      if (form.form.value.spotify_title?.length) { media.title = form.form.value.spotify_title; }
      if (form.form.value.spotify_query?.length) { media.query = form.form.value.spotify_query; }
      if (form.form.value.spotify_id?.length) {
        media.id = form.form.value.spotify_id;
        if(media.category === 'playlist'){
          this.playerService.validateId(media.id, "spotify_playlistid");
        }else{
          this.playerService.validateId(media.id, "spotify_id");
        }
      }
      if (form.form.value.spotify_showid?.length) {
        media.showid = form.form.value.spotify_showid;
        this.playerService.validateId(media.showid, "spotify_showid");
      }
      if (form.form.value.spotify_artistid?.length) {
        media.artistid = form.form.value.spotify_artistid;
        this.playerService.validateId(media.artistid, "spotify_artistid");
      }
    } else if (this.source === 'radio') {
      if (form.form.value.radio_title?.length) { media.title = form.form.value.radio_title; }
      if (form.form.value.radio_cover?.length) { media.cover = form.form.value.radio_cover; }
      if (form.form.value.radio_id?.length) { media.id = form.form.value.radio_id; }
    }

    setTimeout(() => {
      this.save(media, form);
    }, 2500)
  }

  async save(media: Media, form: NgForm){
    this.mediaService.validate$.subscribe(validate => {
      this.validateState = validate;
    });

    if(!this.validateState?.validate && this.source === 'spotify' && (media.query?.length == 0)){
      const alert = await this.alertController.create({
        cssClass: 'alert',
        header: 'Warning',
        message: 'The id is not valide or you have no internet connection!',
        buttons: [
          {
            text: 'Okay'
          }
        ]
      });
  
      await alert.present();
    }else{
      if(this.edit){
        this.mediaService.editRawMediaAtIndex(this.editMedia.index, media);
      }else{
        this.mediaService.addRawMedia(media);
      }

      form.reset();

      this.keyboard.clearInput('spotify_artist');
      this.keyboard.clearInput('spotify_title');
      this.keyboard.clearInput('spotify_id');
      this.keyboard.clearInput('spotify_showid');
      this.keyboard.clearInput('spotify_artistid');
      this.keyboard.clearInput('spotify_query');
  
      this.keyboard.clearInput('radio_title');
      this.keyboard.clearInput('radio_id');
      this.keyboard.clearInput('radio_cover');
  
      this.validate();

      this.playerService.sendCmd(PlayerCmds.CLEARVALIDATE);

      setTimeout(() => {
        this.navController.back();
      }, 2000)
    }
  }

  validate() {
    //if (this.spotifySegment) { this.spotifySegment.disabled = false; }
    //if (this.radioSegment) { this.radioSegment.disabled = false; }

    /* if (this.spotifyArtist) { this.spotifyArtist.disabled = false; }
    if (this.spotifyQuery) { this.spotifyQuery.disabled = false; }
    if (this.spotifyShowID) { this.spotifyShowID.disabled = false; } */

    /* if (this.searchTypeSelect) {
      if (this.category === 'playlist') {
        this.searchTypeSelect.disabled = true;
        this.searchType = 'media_id';
      } else {
        this.searchTypeSelect.disabled = false;
      }
    } */

    /* switch (this.category) {
      case 'audiobook':
      case 'music':
        //if (this.radioSegment) { this.radioSegment.disabled = true; }
        //break;
      case 'playlist':
        //if (this.radioSegment) { this.radioSegment.disabled = true; }
        //if (this.spotifyArtist) { this.spotifyArtist.disabled = true; }
        //if (this.spotifyQuery) { this.spotifyQuery.disabled = true; }
        //if (this.searchTypeSelect) { this.searchTypeSelect.disabled = true; }
        //if (this.spotifyShowID) { this.spotifyShowID.disabled = true; }
        break;
      case 'radio':
        //if (this.spotifySegment) { this.spotifySegment.disabled = true; }
    } */

    if (this.source === 'spotify') {
      const artist = this.keyboard.getInput('spotify_artist');
      const title = this.keyboard.getInput('spotify_title');
      const id = this.keyboard.getInput('spotify_id');
      const artistid = this.keyboard.getInput('spotify_artistid');
      const query = this.keyboard.getInput('spotify_query');
      const show = this.keyboard.getInput('spotify_showid');

      this.valid = (
        (this.category === 'audiobook' || this.category === 'music') && (
          (title?.length > 0 && artist?.length > 0 && !(query?.length > 0) && !(id?.length > 0) && !(artistid?.length > 0))
          ||
          (query?.length > 0 && !(title?.length > 0) && !(id?.length > 0) && !(artistid?.length > 0))
          ||
          (id?.length > 0 && !(query?.length > 0))
          ||
          (artistid?.length > 0 && !(query?.length > 0))
          ||
          (show?.length > 0 && !(query?.length > 0))
          ||
          (this.edit && (artist?.length > 0))
          ||
          (this.edit && (this.shuffle !== this.editMedia?.shuffle))
        )
        ||
        (this.category === 'playlist') && (
          (id?.length > 0)
          ||
          (this.edit && (this.shuffle !== this.editMedia?.shuffle))
          ||
          (this.edit && (title?.length > 0))
        )
      );
    } else if (this.source === 'radio') {
      const artist = this.keyboard.getInput('radio_artist');
      const title = this.keyboard.getInput('radio_title');
      const id = this.keyboard.getInput('radio_id');
      const cover = this.keyboard.getInput('radio_cover');

      this.valid = (
        (title?.length > 0 && id?.length > 0)
        ||
        (this.edit && ((title?.length > 0) || (id?.length > 0) || (artist?.length > 0) || (cover?.length > 0)))
      );
    }
  }
}
