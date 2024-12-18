import {
  BaseData,
  Data,
  SpotifyAlbumData,
  SpotifyArtistData,
  SpotifyData,
  SpotifyPlaylistData,
  SpotifyQueryData,
  SpotifyShowData,
} from '../models/data.model'
import { chunks, readJsonFile } from '../utils'

import SpotifyWebApi from 'spotify-web-api-node'
import { environment } from '../environment'
import { SpotifyAlbumMedia, SpotifyEpisodeMedia, SpotifyMedia, SpotifyPlaylistMedia } from 'src/models/media.model'

let configBasePath = './server/config' // TODO: Fix for production.
if (!environment.production) {
  configBasePath = '../backend-player/config' // This uses the package.json path as pwd.
}

/**
 * The Spotify API object. May be undefined if it is not intialized yet.
 */
export let spotifyApi: SpotifyWebApi | undefined = undefined

/**
 * Method to refresh the access token for Spotify.
 */
const refreshToken = (): void => {
  spotifyApi?.refreshAccessToken().then(
    (data) => {
      spotifyApi?.setAccessToken(data.body.access_token)
    },
    (error) => {
      console.error(`Could not refresh access token: ${error}`)
    },
  )
}

readJsonFile(`${configBasePath}/config.json`)
  .then((configFile) => {
    spotifyApi = new SpotifyWebApi({
      clientId: configFile?.spotify?.clientId,
      clientSecret: configFile?.spotify?.clientSecret,
      // refreshToken: configFile?.spotify?.refreshToken,
      // accessToken: configFile?.spotify?.accessToken,
    })
    // refreshToken()

    spotifyApi
      .clientCredentialsGrant()
      .then((data) => {
        spotifyApi?.setAccessToken(data.body.access_token)
      })
      .catch((error) => {
        console.error(error)
      })
  })
  .catch((error) => {
    console.error(`Could not read Spotify config file: ${error}`)
  })

// setInterval(refreshToken, 1000 * 60 * 60)

type getObjectType =
  | ((index: number, res: SpotifyApi.MultipleAlbumsResponse) => SpotifyApi.AlbumObjectFull)
  | ((index: number, res: SpotifyApi.MultipleShowsResponse) => SpotifyApi.ShowObjectSimplified)
  | ((index: number, res: SpotifyApi.MultipleArtistsResponse) => SpotifyApi.ArtistObjectFull)
  | ((index: number, res: SpotifyApi.PlaylistObjectFull) => SpotifyApi.PlaylistObjectFull)
  | ((index: number, res: SpotifyApi.AlbumSearchResponse) => SpotifyApi.AlbumObjectSimplified)

const fillDataEntry = async <T extends BaseData>(
  spotifyCall: (spotifyApi: SpotifyWebApi | undefined, data: T[]) => Promise<any> | undefined,
  chunkSize: number,
  getObject: getObjectType,
  data: T[],
): Promise<void> => {
  if (data.length <= 0) {
    return
  }

  // Separate in chunks since Spotify allows at most 20 or 50 ids in a single query.
  const chunkedEntries = [...chunks(data, chunkSize)]
  const results = await Promise.allSettled(
    chunkedEntries.map((chunkData) => {
      return spotifyCall(spotifyApi, chunkData)?.then((r) => {
        return {
          data: chunkData,
          response: r,
        }
      })
    }),
  )
  for (const res of results) {
    if (res !== undefined && res.status === 'fulfilled') {
      const cachedData = res.value?.data
      const responseData = res.value?.response
      if (cachedData !== undefined && responseData !== undefined) {
        for (let i = 0; i < cachedData.length; ++i) {
          const dataEntry = cachedData[i]
          // TODO: Ensure that i-th response entry has a value.
          const apiResponse = getObject(i, responseData.body)
          dataEntry.artist = apiResponse.name
          // Also write cover if we are here.
          if (dataEntry.artistcover === undefined && apiResponse.images.length > 0) {
            dataEntry.artistcover = apiResponse.images[0].url
          }
        }
      }
    }
    // TODO: What to do in this case if promise is not fulfilled?
  }
}

const fillAlbumDataEntry = (fillDataEntry<SpotifyAlbumData>).bind(
  undefined,
  (spotifyApi: SpotifyWebApi | undefined, data: SpotifyAlbumData[]) => {
    return spotifyApi?.getAlbums(data.map((entry) => entry.id))
  },
  20,
  (index: number, res: SpotifyApi.MultipleAlbumsResponse) => {
    return res.albums[index]
  },
)
const fillArtistDataEntry = (fillDataEntry<SpotifyArtistData>).bind(
  undefined,
  (spotifyApi: SpotifyWebApi | undefined, data: SpotifyArtistData[]) => {
    return spotifyApi?.getArtists(data.map((entry) => entry.artistid))
  },
  50,
  (index: number, res: SpotifyApi.MultipleArtistsResponse) => {
    return res.artists[index]
  },
)
const fillShowDataEntry = (fillDataEntry<SpotifyShowData>).bind(
  undefined,
  (spotifyApi: SpotifyWebApi | undefined, data: SpotifyShowData[]) => {
    return spotifyApi?.getShows(data.map((entry) => entry.showid))
  },
  50,
  (index: number, res: SpotifyApi.MultipleShowsResponse) => {
    return res.shows[index]
  },
)
//  TODO: Handle failing access.
const fillPlaylistDataEntry = (fillDataEntry<SpotifyPlaylistData>).bind(
  undefined,
  (spotifyApi: SpotifyWebApi | undefined, data: SpotifyPlaylistData[]) => {
    return spotifyApi?.getPlaylist(data.map((entry) => entry.playlistid)[0])
  },
  1, // Playlists can only be requested one at a time.
  (_index: number, res: SpotifyApi.PlaylistObjectFull) => {
    return res
  },
)

const fillSearchQueryDataEntry = (fillDataEntry<SpotifyQueryData>).bind(
  undefined,
  (spotifyApi: SpotifyWebApi | undefined, data: SpotifyQueryData[]) => {
    return spotifyApi?.searchAlbums(data.map((entry) => entry.query)[0])
  },
  1, // Search queries are one at a time.
  (index: number, res: SpotifyApi.AlbumSearchResponse) => {
    return res.albums.items[index]
  },
)

/**
 * TODO
 * @param data
 * @returns
 */
const isSpotifyShowData = (data: Data): data is SpotifyShowData => {
  return data.type === 'spotify' && 'showid' in data
}

/**
 * TODO
 * @param data
 * @returns
 */
const isSpotifyArtistData = (data: Data): data is SpotifyArtistData => {
  return data.type === 'spotify' && 'artistid' in data
}

/**
 * Adds title information (and cover image if not yet set)
 * to the spotify-based data in the given {@link data}.
 * Does not check query-based data entries since they require a title
 * when created.
 *
 * @param data - The data that is modified with the title information.
 */
export const addSpotifyTitleInformation = async (data: Data[]): Promise<void> => {
  await Promise.allSettled([
    fillShowDataEntry(data.filter((entry) => isSpotifyShowData(entry))),
    fillArtistDataEntry(data.filter((entry) => isSpotifyArtistData(entry))),
    fillAlbumDataEntry(data.filter((entry) => 'id' in entry && entry.type === 'spotify')),
    fillPlaylistDataEntry(data.filter((entry) => 'playlistid' in entry)),
  ])
}

/**
 * Adds cover image information (and title if not yet set)
 * to the spotify-based data in the given {@link data}.
 *
 * @param data - The data that is modified with the cover image information.
 */
export const addSpotifyImageInformation = async (data: Data[]): Promise<void> => {
  await Promise.allSettled([
    fillShowDataEntry(data.filter((entry) => isSpotifyShowData(entry))),
    fillArtistDataEntry(data.filter((entry) => isSpotifyArtistData(entry))),
    fillAlbumDataEntry(data.filter((entry) => 'id' in entry && entry.type === 'spotify')),
    fillPlaylistDataEntry(data.filter((entry) => 'playlistid' in entry)),
    fillSearchQueryDataEntry(data.filter<SpotifyQueryData>((entry): entry is SpotifyQueryData => 'query' in entry)),
  ])
}

const getSpotifyArtistAlbums = async (data: SpotifyArtistData): Promise<SpotifyAlbumMedia[] | undefined> => {
  if (spotifyApi === undefined) {
    return undefined
  }

  const chunkSize = 50

  const mapSpotifyAlbumToMedia = (album: SpotifyApi.AlbumObjectSimplified): SpotifyAlbumMedia => {
    return {
      type: 'spotifyAlbum',
      name: album.name,
      category: data.category,
      folderName: data.artist ?? '',
      img: album.images.length > 0 ? album.images[0].url : '',
      // TODO: Shuffle?
      allowShuffle: false,
      shuffle: false,
      id: album.id,
      releaseDate: album.release_date,
    }
  }

  const firstAlbums = await spotifyApi.getArtistAlbums(data.artistid, { limit: chunkSize, offset: 0 })
  if (firstAlbums.statusCode !== 200) {
    return undefined
  }
  const out = firstAlbums.body.items.map(mapSpotifyAlbumToMedia)
  // Request the rest of the albums if there are more than 50.
  const numChunks = Math.ceil(firstAlbums.body.total / chunkSize)
  if (firstAlbums.body.total > chunkSize) {
    const results = await Promise.allSettled(
      Array.from({ length: numChunks }, (_, i) => chunkSize + i * chunkSize).map((offset) => {
        return spotifyApi?.getArtistAlbums(data.artistid, { limit: chunkSize, offset: offset })
      }),
    )
    out.push(
      ...results
        .filter((promise) => promise.status === 'fulfilled')
        .flatMap((promise) => promise.value)
        .flatMap((res) => res?.body.items.map(mapSpotifyAlbumToMedia))
        .filter((album) => album !== undefined),
    )
  }
  return out
}

/**
 * TODO
 *
 * @param data T
 * @returns
 */
export const getSpotifyMedia = async (data: SpotifyData): Promise<SpotifyMedia[] | undefined> => {
  if (spotifyApi === undefined) {
    return undefined
  }
  if (isSpotifyArtistData(data)) {
    return getSpotifyArtistAlbums(data)
  }
  return undefined
}
