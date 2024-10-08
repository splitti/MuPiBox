import type { Media } from './media'

export type ExtraDataMedia = Pick<
  Media,
  'artistcover' | 'shuffle' | 'aPartOfAll' | 'aPartOfAllMin' | 'aPartOfAllMax' | 'sorting'
>

export namespace Utils {
  /**
   * Copies the properties of {@link ExtraDataMedia} from {@link source} to {@link target}.
   *
   * @param source - The source of the properties that will be copied.
   * @param target - The target to which the values of the properties will be copied.
   */
  export const copyExtraMediaData = (source: ExtraDataMedia, target: Media): void => {
    const keys = ['artistcover', 'shuffle', 'aPartOfAll', 'aPartOfAllMin', 'aPartOfAllMax', 'sorting']
    for (const key of keys) {
      if (source[key] != null) {
        target[key] = source[key]
      }
    }
  }
}
