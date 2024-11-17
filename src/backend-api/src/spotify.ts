import SpotifyWebApi from 'spotify-web-api-node'
import { environment } from './environment'
import { readJsonFile } from './utils'

let configBasePath = './server/config' // TODO: Fix for production.
if (!environment.production) {
  configBasePath = '../backend-player/config' // This uses the package.json path as pwd.
}

export let spotifyApi: SpotifyWebApi | undefined = undefined
readJsonFile(`${configBasePath}/config.json`).then((configFile) => {
  spotifyApi = new SpotifyWebApi({
    clientId: configFile?.spotify?.clientId,
    clientSecret: configFile?.spotify?.clientSecret,
  })

  spotifyApi
    .clientCredentialsGrant()
    .then((data) => {
      spotifyApi?.setAccessToken(data.body.access_token)
    })
    .catch((error) => {
      console.error(error)
    })
})

// spotifyApi.setAccessToken(config.spotify.accessToken)
// refreshToken()
// setInterval(refreshToken, 1000 * 60 * 60)

// const refreshToken = (): void => {
//   spotifyApi.refreshAccessToken().then(
//     (data) => {
//       log.debug(`${nowDate.toLocaleString()}: The access token has been refreshed!`)
//       counter.countfreshAccessToken++
//       if (config.server.logLevel === 'debug') {
//         writeCounter()
//       }
//       spotifyApi.setAccessToken(data.body.access_token)
//       counter.countsetAccessToken++
//       if (config.server.logLevel === 'debug') {
//         writeCounter()
//       }
//       if (currentMeta.activeSpotifyId.includes('spotify:') && !spotifyRunning) {
//         playMe()
//       }
//     },
//     (err) => {
//       log.debug(`${nowDate.toLocaleString()}: Could not refresh access token`, err)
//     },
//   )
// }
