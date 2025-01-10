import {
  BaseData,
  Data,
  SpotifyAlbumData,
  SpotifyArtistData,
  SpotifyBaseData,
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
  (index: number, res: SpotifyApi.MultipleAlbumsResponse) => res.albums[index],
)
const fillArtistDataEntry = (fillDataEntry<SpotifyArtistData>).bind(
  undefined,
  (spotifyApi: SpotifyWebApi | undefined, data: SpotifyArtistData[]) => {
    return spotifyApi?.getArtists(data.map((entry) => entry.artistid))
  },
  50,
  (index: number, res: SpotifyApi.MultipleArtistsResponse) => res.artists[index],
)
const fillShowDataEntry = (fillDataEntry<SpotifyShowData>).bind(
  undefined,
  (spotifyApi: SpotifyWebApi | undefined, data: SpotifyShowData[]) => {
    return spotifyApi?.getShows(data.map((entry) => entry.showid))
  },
  50,
  (index: number, res: SpotifyApi.MultipleShowsResponse) => res.shows[index],
)
//  TODO: Handle failing access.
const fillPlaylistDataEntry = (fillDataEntry<SpotifyPlaylistData>).bind(
  undefined,
  (spotifyApi: SpotifyWebApi | undefined, data: SpotifyPlaylistData[]) => {
    return spotifyApi?.getPlaylist(data.map((entry) => entry.playlistid)[0])
  },
  1, // Playlists can only be requested one at a time.
  (_index: number, res: SpotifyApi.PlaylistObjectFull) => res,
)

const fillSearchQueryDataEntry = (fillDataEntry<SpotifyQueryData>).bind(
  undefined,
  (spotifyApi: SpotifyWebApi | undefined, data: SpotifyQueryData[]) => {
    return spotifyApi?.searchAlbums(data.map((entry) => entry.query)[0])
  },
  1, // Search queries are one at a time.
  (index: number, res: SpotifyApi.AlbumSearchResponse) => res.albums.items[index],
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
 * TODO
 * @param data
 * @returns
 */
const isSpotifyPlaylistData = (data: Data): data is SpotifyPlaylistData => {
  return data.type === 'spotify' && 'playlistid' in data
}

/**
 * TODO
 * @param data
 * @returns
 */
const isSpotifyAlbumData = (data: Data): data is SpotifyAlbumData => {
  return data.type === 'spotify' && 'id' in data
}

/**
 * TODO
 * @param data
 * @returns
 */
const isSpotifyQueryData = (data: Data): data is SpotifyQueryData => {
  return data.type === 'spotify' && 'query' in data
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
    fillShowDataEntry(data.filter(isSpotifyShowData)),
    fillArtistDataEntry(data.filter(isSpotifyArtistData)),
    fillAlbumDataEntry(data.filter(isSpotifyAlbumData)),
    fillPlaylistDataEntry(data.filter(isSpotifyPlaylistData)),
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
    fillShowDataEntry(data.filter(isSpotifyShowData)),
    fillArtistDataEntry(data.filter(isSpotifyArtistData)),
    fillAlbumDataEntry(data.filter(isSpotifyAlbumData)),
    fillPlaylistDataEntry(data.filter(isSpotifyPlaylistData)),
    fillSearchQueryDataEntry(data.filter(isSpotifyQueryData)),
  ])
}

interface Response<T> {
  body: T
  headers: Record<string, string>
  statusCode: number
}

type mapResponseType =
  | ((data: SpotifyAlbumData, res: SpotifyApi.ArtistsAlbumsResponse) => SpotifyAlbumMedia[])
  | ((data: SpotifyArtistData, res: SpotifyApi.ArtistsAlbumsResponse) => SpotifyAlbumMedia[])
  | ((data: SpotifyPlaylistData, res: SpotifyApi.PlaylistObjectFull) => SpotifyPlaylistMedia[])
  | ((data: SpotifyQueryData, res: SpotifyApi.AlbumSearchResponse) => SpotifyAlbumMedia[])
  | ((data: SpotifyShowData, res: SpotifyApi.AlbumSearchResponse) => SpotifyAlbumMedia[])

//   | ((index: number, res: SpotifyApi.MultipleShowsResponse) => SpotifyApi.ShowObjectSimplified)
//   | ((index: number, res: SpotifyApi.MultipleArtistsResponse) => SpotifyApi.ArtistObjectFull)
//   | ((index: number, res: SpotifyApi.PlaylistObjectFull) => SpotifyApi.PlaylistObjectFull)
//   | ((index: number, res: SpotifyApi.AlbumSearchResponse) => SpotifyApi.AlbumObjectSimplified)

const getSpotifyMediaGeneric = async <T extends SpotifyBaseData>(
  spotifyCall: (
    spotifyApi: SpotifyWebApi | undefined,
    data: T,
    chunkSize: number,
    offset: number,
  ) => Promise<Response<any>> | undefined,
  chunkSize: number,
  mapResponse: (data: T, res: any) => SpotifyMedia[],
  data: T,
): Promise<SpotifyMedia[] | undefined> => {
  if (spotifyApi === undefined) {
    return undefined
  }

  const firstResults = await spotifyCall(spotifyApi, data, chunkSize, 0)?.catch((_error) => {
    return undefined
  })
  if (firstResults === undefined) {
    return undefined
  }
  const out = mapResponse(data, firstResults.body)
  // Request the rest of the albums if there are more than 50.
  const numChunks = Math.ceil(firstResults.body.total / chunkSize)
  if (firstResults.body.total > chunkSize) {
    const results = await Promise.allSettled(
      Array.from({ length: numChunks }, (_, i) => chunkSize + i * chunkSize).map((offset) =>
        spotifyCall(spotifyApi, data, chunkSize, offset),
      ),
    )
    out.push(
      ...results
        .filter((promise) => promise.status === 'fulfilled')
        .flatMap((promise) => promise.value)
        .flatMap((res) => mapResponse(data, res?.body))
        .filter((album) => album !== undefined),
    )
  }
  return out
}

const getSpotifyArtistAlbums = (getSpotifyMediaGeneric<SpotifyArtistData>).bind(
  undefined,
  (spotifyApi: SpotifyWebApi | undefined, data: SpotifyArtistData, chunkSize: number, offset: number) =>
    spotifyApi?.getArtistAlbums(data.artistid, {
      limit: chunkSize,
      offset: offset,
      include_groups: 'album,single,compilation',
    }),
  50,
  (data: SpotifyArtistData, res: SpotifyApi.ArtistsAlbumsResponse) =>
    res.items.map((album) => {
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
    }),
)

const getSpotifyQueryAlbums = (getSpotifyMediaGeneric<SpotifyQueryData>).bind(
  undefined,
  (spotifyApi: SpotifyWebApi | undefined, data: SpotifyQueryData, chunkSize: number, offset: number) =>
    spotifyApi?.searchAlbums(data.query, {
      limit: chunkSize,
      offset: offset,
    }),
  50,
  (data: SpotifyQueryData, res: SpotifyApi.AlbumSearchResponse) =>
    res.albums.items.map((album) => {
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
    }),
)

const getSpotifyShowEpisodes = (getSpotifyMediaGeneric<SpotifyShowData>).bind(
  undefined,
  (spotifyApi: SpotifyWebApi | undefined, data: SpotifyShowData, chunkSize: number, offset: number) =>
    spotifyApi?.getShowEpisodes(data.showid, {
      limit: chunkSize,
      offset: offset,
    }),
  50,
  (data: SpotifyShowData, res: SpotifyApi.ShowEpisodesResponse) =>
    res.items.map((episode) => {
      return {
        type: 'spotifyEpisode',
        name: episode.name,
        category: data.category,
        folderName: data.artist ?? '',
        img: episode.images.length > 0 ? episode.images[0].url : '',
        // TODO: Shuffle?
        allowShuffle: false,
        shuffle: false,
        id: episode.id,
        releaseDate: episode.release_date,
      }
    }),
)

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
  if (isSpotifyShowData(data)) {
    return getSpotifyShowEpisodes(data)
  }
  if (isSpotifyQueryData(data)) {
    return getSpotifyQueryAlbums(data)
  }
  if (isSpotifyAlbumData(data)) {
    return [
      {
        type: 'spotifyAlbum',
        name: data.title ?? data.artist ?? 'no title',
        category: data.category,
        folderName: data.artist ?? '',
        img: data.cover ?? data.artistcover ?? '',
        // TODO: Shuffle?
        allowShuffle: false,
        shuffle: false,
        id: data.id,
      },
    ]
  }
  if (isSpotifyPlaylistData(data)) {
    return [
      {
        type: 'spotifyPlaylist',
        name: data.title ?? data.artist ?? 'no title',
        category: data.category,
        folderName: data.artist ?? '',
        img: data.cover ?? data.artistcover ?? '',
        // TODO: Shuffle?
        allowShuffle: false,
        shuffle: false,
        id: data.playlistid,
      },
    ]
  }

  // TODO: Sorting and interval.
  return []
}
