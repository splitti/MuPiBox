// TODO

// import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'

// import { RssFeedService } from './rssfeed.service'
// import { TestBed } from '@angular/core/testing'

// describe('RssFeedService', () => {
//   let service: RssFeedService

//   beforeEach(() => {
//     TestBed.configureTestingModule({
//       imports: [],
//       providers: [provideHttpClient(withInterceptorsFromDi())],
//     })
//     service = TestBed.inject(RssFeedService)
//   })

//   it('should be created', () => {
//     expect(service).toBeTruthy()
//   })

//   it('handleCData should handle text and cdata input', () => {
//     expect((service as any).handleCData(undefined)).toEqual('No title')
//     expect((service as any).handleCData(1)).toEqual('No title')
//     expect((service as any).handleCData({ _text: 'test' })).toEqual('test')
//     expect((service as any).handleCData({ _cdata: 'bla' })).toEqual('bla')
//   })
// })
