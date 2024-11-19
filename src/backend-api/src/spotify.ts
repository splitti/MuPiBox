import SpotifyWebApi from 'spotify-web-api-node'
import { environment } from './environment'
import { readJsonFile } from './utils'

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
