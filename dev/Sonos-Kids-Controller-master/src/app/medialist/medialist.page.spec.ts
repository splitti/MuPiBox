import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { MedialistPage } from './medialist.page';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientModule } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from "@angular/common/http/testing"

describe('MedialistPage', () => {
  let component: MedialistPage;
  let fixture: ComponentFixture<MedialistPage>;
  let httpClient: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [ MedialistPage ],
      imports: [IonicModule.forRoot(), RouterTestingModule, HttpClientModule, HttpClientTestingModule]
    }).compileComponents();

    httpClient = TestBed.inject(HttpTestingController)

    fixture = TestBed.createComponent(MedialistPage);
    component = fixture.componentInstance;
    // TODO: Artist may be undefined when strictly following TS types, this should be corrected in
    // medialist.page.ts
    component.artist = {
      name: "Baw Batrol",
      albumCount: "1",
      cover: "",
      coverMedia: {
        type: "",
        category: ""
      }
    }
    fixture.detectChanges();
  });

  it('should create', () => {
    httpClient.expectOne("http://localhost:8200/api/sonos")
    expect(component).toBeTruthy();
  });
});
