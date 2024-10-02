import { Media } from "./media"

export type ExtraDataMedia = Pick<Media, 'artistcover' | 'shuffle' | 'aPartOfAll' | 'aPartOfAllMin' | 'aPartOfAllMax' | 'sorting'>

export namespace Utils {
    export const copyExtraMediaData = (source: ExtraDataMedia, target: Media): void => {
        const keys = ['artistcover', 'shuffle',  'aPartOfAll', 'aPartOfAllMin', 'aPartOfAllMax', 'sorting']
        keys.forEach(key => {
          if (source[key]) {
            target[key] = source[key]
          }
        })
      }
}
