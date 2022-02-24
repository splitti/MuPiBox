import { Component, OnInit, ViewEncapsulation, AfterViewInit, ViewChild } from '@angular/core';
import { NavController, IonSelect, IonInput, IonSegment } from '@ionic/angular';
import { WlanService } from '../wlan.service';
import { WLAN } from '../wlan';
import Keyboard from 'simple-keyboard';
import { NgForm } from '@angular/forms';
import muPiBoxNetwork from '../../assets/json/network.json';

@Component({
  selector: 'app-admin',
  encapsulation: ViewEncapsulation.None,
  templateUrl: './admin.page.html',
  styleUrls: [
    './admin.page.scss',
    '../../../node_modules/simple-keyboard/build/css/index.css'
  ]
})
export class AdminPage implements OnInit, AfterViewInit {
  @ViewChild('segment', { static: false }) segment: IonSegment;
  @ViewChild('select', { static: false }) select: IonSelect;

  @ViewChild('network_segment', { static: false }) networkSegment: IonSelect;
  @ViewChild('wlan_segment', { static: false }) wlanSegment: IonSelect;


  @ViewChild('network_ip', { static: false }) networkIp: IonInput;
  @ViewChild('network_host', { static: false }) networkHost: IonInput;
  @ViewChild('wlan_ssid', { static: false }) wlanSsid: IonInput;
  @ViewChild('wlan_pw', { static: false }) wlanPw: IonInput;
  
  public ip = muPiBoxNetwork.ip;
  public host = muPiBoxNetwork.hostname;

  source = 'wlan';
  category = 'WLAN';
  keyboard: Keyboard;
  selectedInputElem: any;
  valid = false;



  constructor(
    private wlanService: WlanService,
    private navController: NavController
  ) { }

  ngOnInit() {
  }

  ngAfterViewInit() {
    this.keyboard = new Keyboard({
      onChange: input => {
        this.selectedInputElem.value = input;
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
          '{alt} {space} . {bksp}'
        ],
        shift: [
          'Q W E R T Z U I O P Ü',
          'A S D F G H J K L Ö Ä',
          '{shiftactivated} Y X C V B N M {shift}',
          '{alt} {space} . {bksp}'
        ],
        alt: [
          '1 2 3 4 5 6 7 8 9 0 =',
          `% @ # $ & * / ( ) ' "`,
          '{shift} , - + ; : ! ? {shift}',
          '{default} {space} . {bksp}'
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
  }

  cancelButtonPressed() {
    this.navController.back();
  }

  focusChanged(event: any) {
    this.selectedInputElem = event.target;

    this.keyboard.setOptions({
      inputName: event.target.name
    });
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
    this.source = event.detail.value;
    window.setTimeout(() => { // wait for new elements to be visible before altering them
      this.validate();
    }, 10);
  }

  submit(form: NgForm) {
    const wlan: WLAN = {
      category: this.category
    };

    if (this.source === 'network') {
      //if (form.form.value.network_host?.length) { wlan.host = form.form.value.spotify_artist; }
      //if (form.form.value.network_ip?.length) { wlan.title = form.form.value.spotify_title; }
    } else if (this.source === 'wlan') {
      if (form.form.value.wlan_ssid?.length) { wlan.ssid = form.form.value.wlan_ssid; }
      if (form.form.value.wlan_pw?.length) { wlan.pw = form.form.value.wlan_pw; }
    }

    this.wlanService.addRawMedia(wlan);

    form.reset();

    this.keyboard.clearInput('network_ip');
    this.keyboard.clearInput('network_host');
    this.keyboard.clearInput('wlan_ssid');
    this.keyboard.clearInput('wlan_pw');

    this.validate();

    this.navController.back();
  }

  validate() {
    if (this.source === 'network') {
      const artist = this.keyboard.getInput('network_ip');
      const title = this.keyboard.getInput('network_host');

      this.valid = (
        title?.length > 0 && artist?.length > 0
      );
    } else if (this.source === 'wlan') {
      const artist = this.keyboard.getInput('wlan_ssid');
      const title = this.keyboard.getInput('wlan_pw');

      this.valid = (
        title?.length > 0 && artist?.length > 0
      );
    }
  }
}
