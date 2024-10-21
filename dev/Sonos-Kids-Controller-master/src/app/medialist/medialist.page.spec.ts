import { ComponentFixture, TestBed } from '@angular/core/testing'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { createArtist, createMedia } from 'src/app/fixtures'
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'

import { MediaSorting } from '../media'
import { MedialistPage } from './medialist.page'
import { RouterTestingModule } from '@angular/router/testing'
import { of } from 'rxjs'

describe('MedialistPage', () => {
  let component: MedialistPage
  let fixture: ComponentFixture<MedialistPage>
  let httpClient: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [IonicModule.forRoot(), RouterTestingModule, MedialistPage],
      providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
    }).compileComponents()

    httpClient = TestBed.inject(HttpTestingController)

    fixture = TestBed.createComponent(MedialistPage)
    component = fixture.componentInstance
    ;(component as any).artist = createArtist()
    fixture.detectChanges()
  })

  it('should create', () => {
    httpClient.expectOne('http://localhost:8200/api/sonos')
    expect(component).toBeTruthy()
  })

  describe('show media', () => {
    it('should not slice at all if not wanted', () => {
      httpClient.expectOne('http://localhost:8200/api/sonos')
      component.artist = createArtist({ coverMedia: createMedia({ showid: 'a', aPartOfAll: undefined }) })
      const mediaList = [createMedia({})]
      const spy = spyOn((component as any).mediaService, 'getMediaFromArtist').and.returnValue(of(mediaList))
      ;(component as any).fetchMedia()
      // Ensure the correct method was called.
      expect(spy).toHaveBeenCalledOnceWith(component.artist)
      expect(component.media).toEqual(mediaList)
    })

    it('shouldmsort by release date desc. by default', () => {
      httpClient.expectOne('http://localhost:8200/api/sonos')
      component.artist = createArtist({ coverMedia: createMedia({ showid: 'a', aPartOfAll: undefined }) })
      const mediaList = [
        createMedia({ title: 'a', release_date: '2020' }),
        createMedia({ title: 'b', release_date: '2009' }),
        createMedia({ title: 'c', release_date: '2011' }),
      ]
      const spy = spyOn((component as any).mediaService, 'getMediaFromArtist').and.returnValue(of(mediaList))
      ;(component as any).fetchMedia()
      // Ensure the correct method was called.
      expect(spy).toHaveBeenCalledOnceWith(component.artist)
      expect(component.media).toEqual([
        createMedia({ title: 'a', release_date: '2020' }),
        createMedia({ title: 'c', release_date: '2011' }),
        createMedia({ title: 'b', release_date: '2009' }),
      ])
    })

    it('should sort by release date asc.', () => {
      httpClient.expectOne('http://localhost:8200/api/sonos')
      component.artist = createArtist({
        coverMedia: createMedia({ showid: 'a', aPartOfAll: undefined, sorting: MediaSorting.ReleaseDateAscending }),
      })
      const mediaList = [
        createMedia({ title: 'a', release_date: '2020' }),
        createMedia({ title: 'b', release_date: '2009' }),
        createMedia({ title: 'c', release_date: '2011' }),
      ]
      const spy = spyOn((component as any).mediaService, 'getMediaFromArtist').and.returnValue(of(mediaList))
      ;(component as any).fetchMedia()
      // Ensure the correct method was called.
      expect(spy).toHaveBeenCalledOnceWith(component.artist)
      expect(component.media).toEqual([
        createMedia({ title: 'b', release_date: '2009' }),
        createMedia({ title: 'c', release_date: '2011' }),
        createMedia({ title: 'a', release_date: '2020' }),
      ])
    })

    it('should slice if wanted and sort by release date desc. by default', () => {
      httpClient.expectOne('http://localhost:8200/api/sonos')
      component.artist = createArtist({
        coverMedia: createMedia({ showid: 'a', aPartOfAll: true, aPartOfAllMin: 1, aPartOfAllMax: 2 }),
      })
      const mediaList = [
        createMedia({ title: 'a', release_date: '2020' }),
        createMedia({ title: 'b', release_date: '2009' }),
        createMedia({ title: 'c', release_date: '2011' }),
      ]
      const spy = spyOn((component as any).mediaService, 'getMediaFromArtist').and.returnValue(of(mediaList))
      ;(component as any).fetchMedia()
      // Ensure the correct method was called.
      expect(spy).toHaveBeenCalledOnceWith(component.artist)
      expect(component.media).toEqual([
        createMedia({ title: 'c', release_date: '2011' }),
        createMedia({ title: 'b', release_date: '2009' }),
      ])
    })

    it('should slice if wanted and sort as wanted', () => {
      httpClient.expectOne('http://localhost:8200/api/sonos')
      component.artist = createArtist({
        coverMedia: createMedia({
          showid: 'a',
          aPartOfAll: true,
          aPartOfAllMin: 1,
          aPartOfAllMax: 2,
          sorting: MediaSorting.AlphabeticalDescending,
        }),
      })
      const mediaList = [
        createMedia({ title: 'a', release_date: '2010' }),
        createMedia({ title: 'b', release_date: '2011' }),
        createMedia({ title: 'c', release_date: '2009' }),
      ]
      const spy = spyOn((component as any).mediaService, 'getMediaFromArtist').and.returnValue(of(mediaList))
      ;(component as any).fetchMedia()
      // Ensure the correct method was called.
      expect(spy).toHaveBeenCalledOnceWith(component.artist)
      expect(component.media).toEqual([
        createMedia({ title: 'b', release_date: '2011' }),
        createMedia({ title: 'a', release_date: '2010' }),
      ])
    })
  })

  describe('should correctly slice artist media', () => {
    it('should not slice at all if not wanted', () => {
      httpClient.expectOne('http://localhost:8200/api/sonos')
      component.artist = createArtist({ coverMedia: createMedia({ aPartOfAll: undefined }) })
      const mediaList = [createMedia({})]
      const spy = spyOn((component as any).mediaService, 'getMediaFromArtist').and.returnValue(of(mediaList))
      ;(component as any).fetchMedia()
      // Ensure the correct method was called.
      expect(spy).toHaveBeenCalledOnceWith(component.artist)
      expect(component.media).toEqual(mediaList)
    })

    it('should slice if wanted and sort alphabetical by default', () => {
      httpClient.expectOne('http://localhost:8200/api/sonos')
      component.artist = createArtist({
        coverMedia: createMedia({ aPartOfAll: true, aPartOfAllMin: 1, aPartOfAllMax: 2 }),
      })
      const mediaList = [createMedia({ title: 'b' }), createMedia({ title: 'a' }), createMedia({ title: 'c' })]
      const spy = spyOn((component as any).mediaService, 'getMediaFromArtist').and.returnValue(of(mediaList))
      ;(component as any).fetchMedia()
      // Ensure the correct method was called.
      expect(spy).toHaveBeenCalledOnceWith(component.artist)
      expect(component.media).toEqual([createMedia({ title: 'a' }), createMedia({ title: 'b' })])
    })
  })
})
