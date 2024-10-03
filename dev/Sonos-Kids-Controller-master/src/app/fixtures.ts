// This file contains dummy data that should only be used in
// test files (*.spec.ts).

import { Artist } from "./artist"
import { Media } from "./media"

export const createFixture = <T>(data: T): ((additional_data?: Partial<T>) => T) => {
    return (additional_data) => { return { ...data, ...additional_data } }
}

export const createMedia = createFixture<Media>({
    type: "",
    category: ""
})

export const createArtist = createFixture<Artist>({
    name: "Baw Batrol",
    albumCount: "1",
    cover: "",
    coverMedia: createMedia()
})
