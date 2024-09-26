import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from "@angular/common/http/testing"
import { createArtist, createMedia } from 'src/app/fixtures'

import { HttpClientModule } from '@angular/common/http';
import { IonicModule } from '@ionic/angular';
import { MedialistPage } from './medialist.page';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';

describe('MedialistPage', () => {
  let component: MedialistPage
  let fixture: ComponentFixture<MedialistPage>
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
    component.artist = createArtist()
    // Somehow we must prevent a slider update since either the slider object or its update method is
    // broken in this karma/jasmine environment.
    spyOn<any>(component, 'updateSlider')
    fixture.detectChanges();
  })

  it('should create', () => {
    httpClient.expectOne("http://localhost:8200/api/sonos")
    expect(component).toBeTruthy();
  })

  describe('should correctly slice show media', () => {
    fit('should not slice at all if not wanted', () => {
      component.artist = createArtist({coverMedia: createMedia({showid: 'a', aPartOfAll: undefined})})
      const mediaList = [createMedia({})]
      spyOn((component as any).mediaService, 'getMediaFromShow').and.returnValue(of(mediaList));
      (component as any).fetchMedia()
      expect(component.media).toEqual(mediaList)
    })
  })

  describe('should correctly slice artist media', () => {
    it('should not slice at all', () => {
      component.artist = createArtist({coverMedia: createMedia({showid: 'a', aPartOfAll: undefined})})
    })
  })
})
