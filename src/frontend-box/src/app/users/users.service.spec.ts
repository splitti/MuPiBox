import type { Media } from '../media'
import { colorOf, mediaInLibrary } from './users.service'

const m = (x: Record<string, unknown>): Partial<Media> => x as Partial<Media>

describe('mediaInLibrary', () => {
  const list = [
    m({ type: 'spotify', id: 'album1', title: 'A' }),
    m({ type: 'spotify', artistid: 'art1', artist: 'Band' }),
    m({ type: 'spotify', playlistid: 'pl1' }),
    m({ type: 'spotify', query: 'Hörspiel', artist: 'Die Drei' }),
    m({ type: 'rss', id: 'https://feed.example/a.xml', title: 'Kinderpodcast' }),
    m({ type: 'tidal', id: '123' }),
    m({ type: 'tidal', id: 't-art', tidalKind: 'artist', artist: 'Sänger' }),
    m({ type: 'audible', id: 's1', audibleKind: 'series', artist: 'Autorin' }),
  ]

  it('finds an entry of the same kind with its id', () => {
    expect(mediaInLibrary(m({ type: 'spotify', id: 'album1' }), list)).toBeTrue()
    expect(mediaInLibrary(m({ type: 'spotify', playlistid: 'pl1' }), list)).toBeTrue()
    expect(mediaInLibrary(m({ type: 'rss', id: 'https://feed.example/a.xml' }), list)).toBeTrue()
    expect(mediaInLibrary(m({ type: 'tidal', id: '123' }), list)).toBeTrue()
  })

  it('finds a podcast episode by its channel - the NFC extension starts an episode, not the feed', () => {
    expect(mediaInLibrary(m({ type: 'rss', id: 'https://cdn.example/folge-12.mp3', artist: 'Kinderpodcast' }), list)).toBeTrue()
    expect(mediaInLibrary(m({ type: 'rss', id: 'https://cdn.example/x.mp3', artist: 'Anderer Podcast' }), list)).toBeFalse()
  })

  it('finds what is part of an entry: an album of an artist, of a search, a book of a series', () => {
    expect(mediaInLibrary(m({ type: 'spotify', id: 'other', artist: 'Band' }), list)).toBeTrue()
    expect(mediaInLibrary(m({ type: 'spotify', id: 'other', artistid: 'art1' }), list)).toBeTrue()
    expect(mediaInLibrary(m({ type: 'spotify', id: 'folge', artist: 'Die Drei' }), list)).toBeTrue()
    expect(mediaInLibrary(m({ type: 'tidal', id: 'alb', artist: 'sänger' }), list)).toBeTrue()
    expect(mediaInLibrary(m({ type: 'audible', id: 'book2', artist: 'Autorin' }), list)).toBeTrue()
  })

  it('lets own files and the NAS through - the display does not list them from data.json', () => {
    expect(mediaInLibrary(m({ type: 'library', libraryPath: 'Hörspiele/Max' }), [])).toBeTrue()
    expect(mediaInLibrary(m({ type: 'nas', nasPath: '/Musik/Kinder' }), [])).toBeTrue()
  })

  it('does not find what another library has', () => {
    expect(mediaInLibrary(m({ type: 'spotify', id: 'album2', artist: 'Other' }), list)).toBeFalse()
    expect(mediaInLibrary(m({ type: 'tidal', id: 'album1', artist: 'Other' }), list)).toBeFalse()
    expect(mediaInLibrary(m({ type: 'spotify' }), [m({ type: 'spotify', id: 'x' })])).toBeFalse()
    expect(mediaInLibrary(m({ type: 'radio', id: 'x' }), [])).toBeFalse()
  })
})

describe('colorOf', () => {
  it('takes #RRGGBB, anything else is grey', () => {
    expect(colorOf({ color: '#12abEF' })).toBe('#12abEF')
    expect(colorOf({ color: 'red' })).toBe('#808080')
    expect(colorOf(null)).toBe('#808080')
  })
})
