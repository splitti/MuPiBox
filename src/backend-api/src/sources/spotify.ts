import {
  BaseData,
  SpotifyAlbumData,
  SpotifyArtistData,
  SpotifyPlaylistData,
  SpotifyShowData,
} from '../models/data.model'
import { chunks, readJsonFile } from '../utils'

import SpotifyWebApi from 'spotify-web-api-node'
import { environment } from '../environment'

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

export const fillAlbumDataEntry = (fillDataEntry<SpotifyAlbumData>).bind(
  undefined,
  (spotifyApi: SpotifyWebApi | undefined, data: SpotifyAlbumData[]) => {
    return spotifyApi?.getAlbums(data.map((entry) => entry.id))
  },
  20,
  (index: number, res: SpotifyApi.MultipleAlbumsResponse) => {
    return res.albums[index]
  },
)
export const fillArtistDataEntry = (fillDataEntry<SpotifyArtistData>).bind(
  undefined,
  (spotifyApi: SpotifyWebApi | undefined, data: SpotifyArtistData[]) => {
    return spotifyApi?.getArtists(data.map((entry) => entry.artistid))
  },
  50,
  (index: number, res: SpotifyApi.MultipleArtistsResponse) => {
    return res.artists[index]
  },
)
export const fillShowDataEntry = (fillDataEntry<SpotifyShowData>).bind(
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
export const fillPlaylistDataEntry = (fillDataEntry<SpotifyPlaylistData>).bind(
  undefined,
  (spotifyApi: SpotifyWebApi | undefined, data: SpotifyPlaylistData[]) => {
    return spotifyApi?.getPlaylist(data.map((entry) => entry.playlistid)[0])
  },
  1, // Playlists can only be requested one at a time.
  (_index: number, res: SpotifyApi.PlaylistObjectFull) => {
    return res
  },
)
