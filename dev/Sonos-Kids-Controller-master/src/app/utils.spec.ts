import { createMedia } from './fixtures'
import { MediaSorting } from './media'
import { Utils } from './utils'

describe('Utils', () => {
  it('should copy data if provided', () => {
    const target = createMedia({
      artistcover: 'a',
      shuffle: false,
      aPartOfAll: true,
      aPartOfAllMin: -1,
      aPartOfAllMax: 10,
      sorting: MediaSorting.AlphabeticalAscending,
    })
    const source = {
      artistcover: 'b',
      shuffle: true,
      aPartOfAll: false,
      aPartOfAllMin: 2,
      aPartOfAllMax: 3,
      sorting: MediaSorting.ReleaseDateAscending,
    }
    Utils.copyExtraMediaData(source, target)
    expect(target.artistcover).toEqual('b')
    expect(target.shuffle).toEqual(true)
    expect(target.aPartOfAll).toEqual(false)
    expect(target.aPartOfAllMin).toEqual(2)
    expect(target.aPartOfAllMax).toEqual(3)
    expect(target.sorting).toEqual(MediaSorting.ReleaseDateAscending)
  })
  it('should not copy data if undefined or null', () => {
    const target = createMedia({
      artistcover: 'a',
      shuffle: false,
      aPartOfAll: true,
      aPartOfAllMin: -1,
      aPartOfAllMax: 10,
      sorting: MediaSorting.AlphabeticalAscending,
    })
    const source = {
      artistcover: 'b',
      shuffle: null,
      aPartOfAll: undefined,
      aPartOfAllMin: null,
      aPartOfAllMax: undefined,
      sorting: MediaSorting.ReleaseDateAscending,
    }
    Utils.copyExtraMediaData(source, target)
    expect(target.artistcover).toEqual('b')
    expect(target.shuffle).toEqual(false)
    expect(target.aPartOfAll).toEqual(true)
    expect(target.aPartOfAllMin).toEqual(-1)
    expect(target.aPartOfAllMax).toEqual(10)
    expect(target.sorting).toEqual(MediaSorting.ReleaseDateAscending)
  })
})
