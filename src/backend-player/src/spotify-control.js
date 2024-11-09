const express = require('express')
const http = require('node:http')
const bodyParser = require('body-parser')
const path = require('node:path')
const SpotifyWebApi = require('spotify-web-api-node')
const createPlayer = require('./mplayer-wrapper.js')
const googleTTS = require('google-tts-api')
const fs = require('node:fs')
const childProcess = require('node:child_process')

let configBasePath = './config'
//let networkConfigBasePath = '/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config'
if (process.env.NODE_ENV === 'development') {
  configBasePath = '../config'
  //networkConfigBasePath = '../../backend-api/config'
}

const muPiBoxConfig = require(`${configBasePath}/mupiboxconfig.json`)
//const network = require(`${networkConfigBasePath}/network.json`)
const config = require(`${configBasePath}/config.json`)

const log = require('console-log-level')({ level: config.server.logLevel })

/*set up express router and set headers for cross origin requests*/
const app = express()
const server = http.createServer(app)
const player = createPlayer()

app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
  next()
})

/*init spotify API */
const scopes = [
  'streaming',
  'user-read-currently-currentMeta.playing',
  'user-modify-playback-state',
  'user-read-playback-state',
]

const spotifyApi = new SpotifyWebApi({
  clientId: config.spotify.clientId,
  clientSecret: config.spotify.clientSecret,
  refreshToken: config.spotify.refreshToken,
})

/*sets and refreshes access token every hour */
spotifyApi.setAccessToken(config.spotify.accessToken)
refreshToken('0')
setInterval(refreshToken, 1000 * 60 * 60)

player.on('percent_pos', (val) => {
  //console.log('track progress is', val);
  currentMeta.progressTime = val
})
setInterval(() => {
  player.getProps(['percent_pos'])
}, 1000)

player.on('pause', (val) => {
  currentMeta.playing = !val
})
setInterval(() => {
  player.getProps(['pause'])
}, 1000)

player.on('metadata', (val) => {
  console.log('track metadata is', val)
  //currentMeta.currentTracknr = parseInt(val.Comment?.split(',').pop(), 10);
  currentMeta.currentTracknr = currentMeta.currentTracknr + 1
  log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Current Tracknr: ${currentMeta.currentTracknr}`)
  currentMeta.currentTrackname = val.Title
})
player.on('track-change', () => player.getProps(['metadata']))

//player.on('length', console.log)
//player.on('track-change', () => player.getProps(['length']))

player.on('filename', (val) => {
  console.log('track name is', val)
  if (!currentMeta.currentTrackname) {
    currentMeta.currentTrackname = val
      .split('.mp3')[0]
      .split('.flac')[0]
      .split('.wma')[0]
      .split('.wav')[0]
      .split('.m4a')[0]
  }
})
player.on('track-change', () => player.getProps(['filename']))

player.on('path', (val) => {
  console.log('track path is', val)
  currentMeta.album = val.split('/')[7]
})
player.on('track-change', () => player.getProps(['path']))

player.on('track-change', () => {
  if (
    muPiBoxConfig.telegram.active &&
    //network.onlinestate === 'online' &&
    muPiBoxConfig.telegram.token.length > 1 &&
    muPiBoxConfig.telegram.chatId.length > 1 &&
    (currentMeta.currentType === 'rss' || currentMeta.currentType === 'radio')
  )
    cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_Track_RSS_Radio.py')
  if (
    muPiBoxConfig.telegram.active &&
    //network.onlinestate === 'online' &&
    muPiBoxConfig.telegram.token.length > 1 &&
    muPiBoxConfig.telegram.chatId.length > 1 &&
    currentMeta.currentType === 'local'
  )
    cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_Track_Local.py')
})

setInterval(() => {
  const cmdVolume = "/usr/bin/amixer sget Master | grep 'Right:'"
  const exec = require('node:child_process').exec
  exec(cmdVolume, (e, stdout, stderr) => {
    if (e instanceof Error) {
      // TODO: Get this to run in development.
      if (process.env.NODE_ENV === 'development') {
        return
      }
      throw e
    }
    currentMeta.volume = Number.parseInt(stdout.split('[')[1].split('%')[0], 10)
  })
}, 1000)

/*store device to be played back*/
let activeDevice = ''
const nowDate = new Date()
const volumeStart = 99
let playerstate
let playlist
let spotifyRunning = false
let show
let date = ''
const valideMedia = {
  validateId: '',
  validateType: '',
  validate: false,
}
const counter = {
  countgetMyCurrentPlaybackState: 0,
  countgetMyCurrentPlaybackStateHTTP: 0,
  countfreshAccessToken: 0,
  countsetAccessToken: 0,
  counterror: 0,
  counterrorAccessToken: 0,
  counterrorInvalidID: 0,
  counterrorNoActivDevice: 0,
  countgetAlbum: 0,
  countgetArtist: 0,
  countgetEpisode: 0,
  countgetMyDevices: 0,
  countgetPlaylist: 0,
  countgetPlaylistTracks: 0,
  countgetShow: 0,
  countgetShowEpisodes: 0,
  countpause: 0,
  countplay: 0,
  countseek: 0,
  countsetShuffle: 0,
  countsetVolume: 0,
  countskipToNext: 0,
  countskipToPrevious: 0,
  counterrorToManyRequest: 0,
  counttransferMyPlayback: 0,
}
const currentMeta = {
  activePlaylist: '',
  activeSpotifyId: '',
  totalPlaylist: '',
  activeEpisode: '',
  activeShow: '',
  totalShows: '',
  currentPlayer: '',
  currentType: '',
  playing: false,
  pause: false,
  album: '',
  path: '',
  currentTrackname: '',
  currentTracknr: 0,
  totalTracks: '',
  progressTime: '',
  volume: 0,
}

function writeplayerstatePlay() {
  playerstate = 'play'
  fs.writeFile('/tmp/playerstate', playerstate, (err) => {
    if (err) {
      console.error(err)
      return
    }
    log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Write play to /tmp/playerstate`)
  })
}

function writeplayerstatePause() {
  playerstate = 'pause'
  fs.writeFile('/tmp/playerstate', playerstate, (err) => {
    if (err) {
      console.error(err)
      return
    }
    log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Write play to /tmp/playerstate`)
  })
}

function writeCounter() {
  if (date === '') {
    const now = new Date()
    date = `${now.getFullYear()}_${now.getMonth() + 1}_${now.getDate()}_${now.getHours()}_${now.getMinutes()}_${now.getSeconds()}`
  }
  const pathCounter = `/home/dietpi/.pm2/logs/${date}_counter`
  fs.writeFile(pathCounter, JSON.stringify(counter), (err) => {
    if (err) {
      console.error(err)
      return
    }
    //log.debug(nowDate.toLocaleString() + ": [Spotify Control] Write Counter to " + pathCounter);
  })
}

function refreshToken() {
  spotifyApi.refreshAccessToken().then(
    (data) => {
      log.debug(`${nowDate.toLocaleString()}: The access token has been refreshed!`)
      counter.countfreshAccessToken++
      if (config.server.logLevel === 'debug') {
        writeCounter()
      }
      spotifyApi.setAccessToken(data.body.access_token)
      counter.countsetAccessToken++
      if (config.server.logLevel === 'debug') {
        writeCounter()
      }
      if (currentMeta.activeSpotifyId.includes('spotify:') && !spotifyRunning) {
        playMe()
      }
    },
    (err) => {
      log.debug(`${nowDate.toLocaleString()}: Could not refresh access token`, err)
    },
  )
}

/*called in all error cases*/
/*token expired and no_device error are handled explicitly*/
function handleSpotifyError(err, from) {
  if (err.body.error?.status === 401) {
    log.debug(`${nowDate.toLocaleString()}: access token expired, refreshing...`)
    log.debug(`${nowDate.toLocaleString()}: Error from: ${from}`)
    counter.counterrorAccessToken++
    if (config.server.logLevel === 'debug') {
      writeCounter()
    }
    if (currentMeta.activeSpotifyId !== '0') {
      refreshToken()
    }
  } else if (err.body.error?.status === 400) {
    log.debug(`${nowDate.toLocaleString()}: invalid id`)
    log.debug(`${nowDate.toLocaleString()}: Error from: ${from}`)
    log.debug(`${nowDate.toLocaleString()}: ${err}`)
    counter.counterrorInvalidID++
    if (config.server.logLevel === 'debug') {
      writeCounter()
    }
    activeDevice = ''
    if (currentMeta.activeSpotifyId !== '0') {
      setActiveDevice()
    }
  } else if (err.body.error?.status === 429) {
    log.debug(`${nowDate.toLocaleString()}: To many requests on th spotify web api`)
    log.debug(`${nowDate.toLocaleString()}: Error from: ${from}`)
    log.debug(`${nowDate.toLocaleString()}: ${err}`)
    counter.counterrorToManyRequest++
    if (config.server.logLevel === 'debug') {
      writeCounter()
    }
    //setTimeout(function(){
    //
    //},2000)
  } else if (err.toString().includes('NO_ACTIVE_DEVICE')) {
    log.debug(`${nowDate.toLocaleString()}: no active device, setting the first one found to active`)
    log.debug(`${nowDate.toLocaleString()}: Error from: ${from}`)
    log.debug(`${nowDate.toLocaleString()}: playID: ${currentMeta.activeSpotifyId}`)
    counter.counterrorNoActivDevice++
    if (config.server.logLevel === 'debug') {
      writeCounter()
    }
    activeDevice = ''
    if (currentMeta.activeSpotifyId !== '0') {
      setActiveDevice()
    }
  } else if (err.toString().includes('Device not found')) {
    log.debug(`${nowDate.toLocaleString()}: Device not found: ${err}`)
    log.debug(`${nowDate.toLocaleString()}: ${err}`)
    log.debug(`${nowDate.toLocaleString()}: Error from: ${from}`)
    counter.counterror++
    if (config.server.logLevel === 'debug') {
      writeCounter()
    }
    spotifyApi.play({ device_id: currentMeta.activeSpotifyId }).then(
      () => {
        counter.countplay++
        if (config.server.logLevel === 'debug') {
          writeCounter()
        }
        log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Transfering playback play deviceID`)
        writeplayerstatePlay()
      },
      (err) => {
        log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Playback error${err}`)
        handleSpotifyError(err, 'transferPlayback')
      },
    )
  } else {
    log.debug(`${nowDate.toLocaleString()}: an error occured: ${err}`)
    log.debug(`${nowDate.toLocaleString()}: ${err}`)
    log.debug(`${nowDate.toLocaleString()}: Error from: ${from}`)
    counter.counterror++
    if (config.server.logLevel === 'debug') {
      writeCounter()
    }
  }
}

/*queries all devices and transfers playback to the first one discovered*/
function setActiveDevice() {
  /*find devices first and choose first one available*/
  spotifyApi
    .getMyDevices()
    .then(
      (data) => {
        counter.countgetMyDevices++
        if (config.server.logLevel === 'debug') {
          writeCounter()
        }
        const availableDevices = data.body.devices
        activeDevice = availableDevices[0]
      },
      (err) => {
        log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Transfering error: ${err}`)
        handleSpotifyError(err, 'getMyDevices')
      },
    )
    .then(() => {
      /*transfer to active device*/
      activeDevice = config.spotify.deviceId
      spotifyApi.transferMyPlayback([activeDevice]).then(
        () => {
          counter.counttransferMyPlayback++
          if (config.server.logLevel === 'debug') {
            writeCounter()
          }
          log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Transfering playback to ${activeDevice}`)
          if (currentMeta.activeSpotifyId.includes('spotify:')) {
            if (currentMeta.pause) {
              play()
            } else {
              playMe()
            }
          }
        },
        (err) => {
          handleSpotifyError(err, 'transferMyPlayback')
        },
      )
    })
}

function pause() {
  if (
    muPiBoxConfig.telegram.active &&
    //network.onlinestate === 'online' &&
    muPiBoxConfig.telegram.token.length > 1 &&
    muPiBoxConfig.telegram.chatId.length > 1
  )
    cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "Pause"')
  currentMeta.pause = true
  if (currentMeta.currentPlayer === 'spotify') {
    spotifyApi.pause().then(
      () => {
        counter.countpause++
        if (config.server.logLevel === 'debug') {
          writeCounter()
        }
        log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Playback paused`)
        writeplayerstatePause()
      },
      (err) => {
        handleSpotifyError(err, 'pause')
      },
    )
  } else if (currentMeta.currentPlayer === 'mplayer') {
    if (currentMeta.playing) {
      player.playPause()
      //currentMeta.playing = false;
      writeplayerstatePause()
    }
  }
}

function stop() {
  if (
    muPiBoxConfig.telegram.active &&
    //network.onlinestate === 'online' &&
    muPiBoxConfig.telegram.token.length > 1 &&
    muPiBoxConfig.telegram.chatId.length > 1
  )
    cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "Stop"')
  if (currentMeta.currentPlayer === 'spotify') {
    spotifyApi.pause().then(
      () => {
        counter.countpause++
        if (config.server.logLevel === 'debug') {
          writeCounter()
        }
        log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Playback stopped`)
        writeplayerstatePause()
      },
      (err) => {
        handleSpotifyError(err, 'stop')
      },
    )
    currentMeta.totalShows = ''
    currentMeta.activeEpisode = ''
    currentMeta.activeShow = ''
    currentMeta.currentPlayer = ''
    currentMeta.activeSpotifyId = ''
    currentMeta.pause = false
    spotifyRunning = false
  } else if (currentMeta.currentPlayer === 'mplayer') {
    player.stop()
    //currentMeta.playing = false;
    writeplayerstatePause()
    currentMeta.currentTrackname = ''
    currentMeta.progressTime = ''
    currentMeta.album = ''
    currentMeta.path = ''
    currentMeta.currentTracknr = ''
    currentMeta.totalTracks = ''
    currentMeta.currentPlayer = ''
    currentMeta.pause = false
    spotifyRunning = false
    log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Playback stopped`)
  }
}

function play() {
  if (currentMeta.currentPlayer === 'spotify') {
    spotifyApi.play().then(
      () => {
        counter.countplay++
        if (config.server.logLevel === 'debug') {
          writeCounter()
        }
        log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Playback started`)
        currentMeta.pause = false
        writeplayerstatePlay()
      },
      (err) => {
        handleSpotifyError(err, 'play')
      },
    )
    if (
      muPiBoxConfig.telegram.active &&
      //network.onlinestate === 'online' &&
      muPiBoxConfig.telegram.token.length > 1 &&
      muPiBoxConfig.telegram.chatId.length > 1
    )
      cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "Continue playing"')
    //if (muPiBoxConfig.telegram.active && muPiBoxConfig.telegram.token.length > 1 && muPiBoxConfig.telegram.chatId.length > 1) cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_Track_Spotify.py');
  } else if (currentMeta.currentPlayer === 'mplayer') {
    if (!currentMeta.playing) {
      player.playPause()
      currentMeta.pause = false
      //currentMeta.playing = true;
      writeplayerstatePlay()
      if (
        muPiBoxConfig.telegram.active &&
        //network.onlinestate === 'online' &&
        muPiBoxConfig.telegram.token.length > 1 &&
        muPiBoxConfig.telegram.chatId.length > 1
      )
        cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "Continue playing"')
      // if (muPiBoxConfig.telegram.active && muPiBoxConfig.telegram.token.length > 1 && muPiBoxConfig.telegram.chatId.length > 1 && (currentMeta.currentType === 'rss' || currentMeta.currentType === 'radio')) cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_Track_Local.py');
      // if (muPiBoxConfig.telegram.active && muPiBoxConfig.telegram.token.length > 1 && muPiBoxConfig.telegram.chatId.length > 1 && currentMeta.currentType === 'local') cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_Track_RSS_Radio.py');
    }
  }
}

function next() {
  if (currentMeta.currentPlayer === 'spotify') {
    spotifyApi.skipToNext().then(
      () => {
        counter.countskipToNext++
        if (config.server.logLevel === 'debug') {
          writeCounter()
        }
        log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Skip to next`)
      },
      (err) => {
        handleSpotifyError(err, 'next')
      },
    )
  } else if (currentMeta.currentPlayer === 'mplayer') {
    //currentMeta.currentTracknr = currentMeta.currentTracknr + 1;
    //log.debug(nowDate.toLocaleString() + ': [Spotify Control] Current Tracknr: ' + currentMeta.currentTracknr);
    player.next()
  }
}

function previous() {
  if (currentMeta.currentPlayer === 'spotify') {
    spotifyApi.skipToPrevious().then(
      () => {
        counter.countskipToPrevious++
        if (config.server.logLevel === 'debug') {
          writeCounter()
        }
        log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Skip to previous`)
      },
      (err) => {
        handleSpotifyError(err, 'previous')
      },
    )
  } else if (currentMeta.currentPlayer === 'mplayer') {
    if (currentMeta.currentTracknr > 1) {
      currentMeta.currentTracknr = currentMeta.currentTracknr - 2
    }
    log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Current Tracknr: ${currentMeta.currentTracknr}`)
    player.previous()
  }
}

function shuffleon() {
  spotifyApi.setShuffle(true).then(
    () => {
      counter.countsetShuffle++
      if (config.server.logLevel === 'debug') {
        writeCounter()
      }
      log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Toggle Shuffle`)
    },
    (err) => {
      handleSpotifyError(err, 'shuffleon')
    },
  )
}

function shuffleoff() {
  spotifyApi.setShuffle(false).then(
    () => {
      counter.countsetShuffle++
      if (config.server.logLevel === 'debug') {
        writeCounter()
      }
      log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Toggle Shuffle`)
    },
    (err) => {
      handleSpotifyError(err, 'shuffleoff')
    },
  )
}

function playMe(/*activePlaylist*/) {
  log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Spotify play ${currentMeta.activeSpotifyId}`)
  resumeOffset = currentMeta.activeSpotifyId.split(':')[3]
  log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Spotify resume ${resumeOffset}`)
  if (resumeOffset > 0) resumeOffset--
  log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Spotify offset ${resumeOffset}`)
  resumeProgess = currentMeta.activeSpotifyId.split(':')[4]
  tmp = currentMeta.activeSpotifyId.split(':')
  activePlaylistId = `${tmp[0]}:${tmp[1]}:${tmp[2]}`
  if (activePlaylistId.split(':')[1] === 'episode') {
    spotifyApi.play({ uris: [activePlaylistId], offset: { position: resumeOffset }, position_ms: resumeProgess }).then(
      (data) => {
        counter.countplay++
        if (config.server.logLevel === 'debug') {
          writeCounter()
        }
        log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Playback started`)
        writeplayerstatePlay()
        spotifyRunning = true
        if (
          muPiBoxConfig.telegram.active &&
          //network.onlinestate === 'online' &&
          muPiBoxConfig.telegram.token.length > 1 &&
          muPiBoxConfig.telegram.chatId.length > 1
        )
          cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "Start playing spotify"')
        //if (muPiBoxConfig.telegram.active && muPiBoxConfig.telegram.token.length > 1 && muPiBoxConfig.telegram.chatId.length > 1) cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_Track_Spotify.py');
      },
      (err) => {
        log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Playback error${err}`)
        handleSpotifyError(err, 'playMe')
      },
    )
    // spotifyApi.setVolume(volumeStart).then(function () {
    //   log.debug(nowDate.toLocaleString() + ': [Spotify Control] Setting volume to '+ 99);
    //   counter.countsetVolume++;
    //   if (config.server.logLevel === 'debug'){writeCounter();}
    //   }, function(err) {
    //   handleSpotifyError(err,"setVolume");
    // });
  } else {
    spotifyApi
      .play({ context_uri: activePlaylistId, offset: { position: resumeOffset }, position_ms: resumeProgess })
      .then(
        (data) => {
          log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Playback started`)
          counter.countplay++
          if (config.server.logLevel === 'debug') {
            writeCounter()
          }
          writeplayerstatePlay()
          spotifyRunning = true
          if (
            muPiBoxConfig.telegram.active &&
            //network.onlinestate === 'online' &&
            muPiBoxConfig.telegram.token.length > 1 &&
            muPiBoxConfig.telegram.chatId.length > 1
          )
            cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "Start playing spotify"')
          //if (muPiBoxConfig.telegram.active && muPiBoxConfig.telegram.token.length > 1 && muPiBoxConfig.telegram.chatId.length > 1) cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_Track_Spotify.py');
        },
        (err) => {
          log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Playback error${err}`)
          handleSpotifyError(err, 'playMe')
        },
      )
    // spotifyApi.setVolume(volumeStart).then(function () {
    //   counter.countsetVolume++;
    //   if (config.server.logLevel === 'debug'){writeCounter();}
    //   log.debug(nowDate.toLocaleString() + ': [Spotify Control] Setting volume to '+ 99);
    //   }, function(err) {
    //   handleSpotifyError(err,"setVolume");
    // });
  }
}

function playList(playedList) {
  //let playedTitel = playedList.split('album:').pop();
  playedTitelmod = decodeURI(playedList).replace(/:/g, '/')
  //playedTitelmod = playedTitel.replace(/%20/g," ");
  log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Starting currentMeta.playing:${playedTitelmod}`)
  //currentMeta.playing = true;
  writeplayerstatePlay()
  player.playList(`/home/dietpi/MuPiBox/media/${playedTitelmod}/playlist.m3u`)
  player.setVolume(volumeStart)
  log.debug(`${nowDate.toLocaleString()}: /home/dietpi/MuPiBox/media/${playedTitelmod}/playlist.m3u`)
  currentMeta.currentTracknr = 0
  currentMeta.path = playedTitelmod

  if (
    muPiBoxConfig.telegram.active &&
    //network.onlinestate === 'online' &&
    muPiBoxConfig.telegram.token.length > 1 &&
    muPiBoxConfig.telegram.chatId.length > 1
  )
    cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "Start playing local"')
  //if (muPiBoxConfig.telegram.active && muPiBoxConfig.telegram.token.length > 1 && muPiBoxConfig.telegram.chatId.length > 1) cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_Track_Local.py');

  setTimeout(() => {
    const cmdtotalTracks = `find "/home/dietpi/MuPiBox/media/${decodeURIComponent(currentMeta.path)}" -type f -name "*.mp3" -or -name "*.flac" -or -name "*.m4a" -or -name "*.wma" -or -name "*.wav"| wc -l`
    console.log(cmdtotalTracks)
    const exec = require('node:child_process').exec
    exec(cmdtotalTracks, (e, stdout, stderr) => {
      if (e instanceof Error) {
        console.error(e)
        throw e
      }
      currentMeta.totalTracks = Number.parseInt(stdout.split(/\r?\n/)[0], 10)
      console.log('stdout', stdout)
      console.log('stderr', stderr)
    })
  }, 500)
}

function playFile(playedFile) {
  const playedTitel = `${playedFile}.mp3`
  log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Starting currentMeta.playing:${playedTitel}`)
  //currentMeta.playing = true;
  writeplayerstatePlay()
  player.play(`/home/dietpi/MuPiBox/tts_files/${playedTitel}`)
  player.setVolume(volumeStart)
  log.debug(`${nowDate.toLocaleString()}: /home/dietpi/MuPiBox/tts_files/${playedTitel}`)
}

function playURL(playedURL) {
  log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Starting currentMeta.playing:${playedURL}`)
  //currentMeta.playing = true;
  writeplayerstatePlay()
  player.play(playedURL)
  player.setVolume(volumeStart)
  log.debug(`${nowDate.toLocaleString()}: ${playedURL}`)
  if (
    muPiBoxConfig.telegram.active &&
    //network.onlinestate === 'online' &&
    muPiBoxConfig.telegram.token.length > 1 &&
    muPiBoxConfig.telegram.chatId.length > 1
  )
    cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "Start playing stream"')
  //if (muPiBoxConfig.telegram.active && muPiBoxConfig.telegram.token.length > 1 && muPiBoxConfig.telegram.chatId.length > 1) cmdCall('/usr/bin/python3 /usr/local/bin/mupibox/telegram_Track_RSS_Radio.py');
}

/*seek 30 secends back or forward*/
function seek(progress) {
  let currentProgress = 0
  let targetProgress = 0
  log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Setting progress to ${progress}`)
  if (currentMeta.currentPlayer === 'spotify') {
    if (progress > 1) {
      spotifyApi.seek(progress).then(
        () => {
          counter.countseek++
          if (config.server.logLevel === 'debug') {
            writeCounter()
          }
          log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Progress is ${progress}`)
        },
        (err) => {
          handleSpotifyError(err, 'seek')
        },
      )
    } else {
      spotifyApi
        .getMyCurrentPlaybackState()
        .then((data) => {
          counter.countgetMyCurrentPlaybackState++
          if (config.server.logLevel === 'debug') {
            writeCounter()
          }
          currentProgress = data.body.progress_ms
          log.debug(
            `${nowDate.toLocaleString()}: [Spotify Control]Current progress for active device is ${currentProgress}`,
          )
          if (progress) targetProgress = currentProgress + 30000
          else targetProgress = currentProgress - 30000
        })
        .then(
          () => {
            spotifyApi.seek(targetProgress).then(
              () => {
                counter.countseek++
                if (config.server.logLevel === 'debug') {
                  writeCounter()
                }
                log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Setting progress to ${targetProgress}`)
              },
              (err) => {
                handleSpotifyError(err, 'seek')
              },
            )
          },
          (err) => {
            handleSpotifyError(err, 'seek')
          },
        )
    }
  } else if (currentMeta.currentPlayer === 'mplayer') {
    if (progress > 1) {
      player.seekPercent(progress)
    } else {
      if (progress) player.seek(+30)
      else player.seek(-30)
    }
  }
}

function deleteLocal(deleteFile) {
  const deleteFilePath = decodeURI(deleteFile).replace(/:/g, '/')
  const deleteCMD = `rm -r "/home/dietpi/MuPiBox/media/${decodeURIComponent(deleteFilePath)}"`
  //cmdCall(deleteCMD);
  log.debug(`${nowDate.toLocaleString()}: rm -r "/home/dietpi/MuPiBox/media/${decodeURIComponent(deleteFilePath)}"`)
  const exec = require('node:child_process').exec
  exec(deleteCMD, (e, stdout, stderr) => {
    if (e instanceof Error) {
      console.error(e)
      throw e
    }
    console.log('stdout', stdout)
    console.log('stderr', stderr)
  })
}

function cmdCall(cmd) {
  log.debug(`${nowDate.toLocaleString()}: [Spotify Control]Cmd  ${cmd}`)
  return new Promise((resolve, reject) => {
    childProcess.exec(cmd, (error, standardOutput, standardError) => {
      if (error) {
        log.debug(`${nowDate.toLocaleString()}: [Spotify Control]error ${error}`)
        reject()
        return
      }
      if (standardError) {
        log.debug(`${nowDate.toLocaleString()}: [Spotify Control]StandardError ${standardError}`)
        reject(standardError)
        return
      }
      log.debug(`${nowDate.toLocaleString()}: [Spotify Control]StandardOutput ${standardOutput}`)
      resolve(standardOutput)
    })
  })
}

/*gets available devices, searches for the active one and returns its volume*/
async function setVolume(volume) {
  const volumeUp = '/usr/bin/amixer sset Master 5%+'
  const volumeDown = '/usr/bin/amixer sset Master 5%-'
  const volumeMax = `/usr/bin/amixer sset Master ${muPiBoxConfig.mupibox.maxVolume}%`
  const cmdVolume = "/usr/bin/amixer sget Master | grep 'Right:'"

  const exec = require('node:child_process').exec
  exec(cmdVolume, (e, stdout, stderr) => {
    if (e instanceof Error) {
      console.error(nowDate.toLocaleString() + e)
      throw e
    }
    currentMeta.volume = Number.parseInt(stdout.split('[')[1].split('%')[0], 10)
    //console.log('stdout', stdout);
    //console.log('stderr', stderr);
  })

  if (volume) {
    if (currentMeta.volume < muPiBoxConfig.mupibox.maxVolume) {
      await cmdCall(volumeUp)
      currentMeta.volume = Number.parseInt(currentMeta.volume, 10) + 5
    } else {
      currentMeta.volume = muPiBoxConfig.mupibox.maxVolume
      await cmdCall(volumeMax)
    }
  } else {
    await cmdCall(volumeDown)
    if (currentMeta.volume > 0) {
      currentMeta.volume = Number.parseInt(currentMeta.volume, 10) - 5
    } else {
      currentMeta.volume = 0
    }
  }
}

async function transferPlayback(id) {
  await spotifyApi.transferMyPlayback([id], { play: false }).then(
    () => {
      counter.counttransferMyPlayback++
      if (config.server.logLevel === 'debug') {
        writeCounter()
      }
      log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Transfering playback to ${id}`)
    },
    (err) => {
      log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Transfering playback error.`)
      handleSpotifyError(err, id, 'transferPlayback')
    },
  )
}

function downloadTTS(name) {
  const namedl = name
  log.debug(`${nowDate.toLocaleString()}: [Spotify Control] TTS Name: ${namedl} in ${config.ttsLanguage}`)
  googleTTS
    .getAudioBase64(namedl, { lang: config.ttsLanguage, slow: false })
    .then((base64) => {
      console.log({ base64 })
      const buffer = Buffer.from(base64, 'base64')
      const filename = `/home/dietpi/MuPiBox/tts_files/${namedl}.mp3`
      log.debug(`${nowDate.toLocaleString()}: [Spotify Control] TTS Filename: ${filename}`)
      fs.writeFileSync(filename, buffer, { encoding: 'base64' })
      playFile(namedl)
    })
    .catch(console.error)
}

function validateSpotify() {
  if (valideMedia.validateType === 'id') {
    spotifyApi.getAlbum(valideMedia.validateId).then(
      (data) => {
        counter.countgetAlbum++
        if (config.server.logLevel === 'debug') {
          writeCounter()
        }
        if (data.body.id !== undefined) {
          log.debug(`${nowDate.toLocaleString()}: [Spotify Control]ValidationId ${valideMedia.validateId}`)
          log.debug(`${nowDate.toLocaleString()}: [Spotify Control]ValidationCompareId ${data.body.id}`)
          valideMedia.validate = true
        }
      },
      (err) => {
        handleSpotifyError(err, 'validateId')
        valideMedia.validate = false
      },
    )
  }
  if (valideMedia.validateType === 'showid') {
    spotifyApi.getShow(valideMedia.validateId).then(
      (data) => {
        counter.countgetShow++
        if (config.server.logLevel === 'debug') {
          writeCounter()
        }
        if (data.body.id !== undefined) {
          valideMedia.validate = true
        }
      },
      (err) => {
        handleSpotifyError(err, 'validateShow')
        valideMedia.validate = false
      },
    )
  }
  if (valideMedia.validateType === 'artistid') {
    spotifyApi.getArtist(valideMedia.validateId).then(
      (data) => {
        counter.countgetArtist++
        if (config.server.logLevel === 'debug') {
          writeCounter()
        }
        if (data.body.id !== undefined) {
          valideMedia.validate = true
        }
      },
      (err) => {
        handleSpotifyError(err, 'validateArtist')
        valideMedia.validate = false
      },
    )
  }
  if (valideMedia.validateType === 'playlistid') {
    spotifyApi.getPlaylist(valideMedia.validateId).then(
      (data) => {
        counter.countgetPlaylist++
        if (config.server.logLevel === 'debug') {
          writeCounter()
        }
        if (data.body.id !== undefined) {
          valideMedia.validate = true
        }
      },
      (err) => {
        handleSpotifyError(err, 'validatePlaylist')
        valideMedia.validate = false
      },
    )
  }
}

function clearValidate() {
  valideMedia.validate = false
  valideMedia.validateId = ''
  valideMedia.validateType = ''
}

async function useSpotify(command) {
  currentMeta.currentPlayer = 'spotify'
  currentMeta.currentType = 'spotify'
  const dir = command.dir
  const newdevice = dir.split('/')[1]
  /*await getActiveDevice();*/
  /*setActiveDevice();*/
  log.debug(`${nowDate.toLocaleString()}: [Spotify Control] device is ${activeDevice} and new is ${newdevice}`)
  /*active device has changed, transfer playback*/
  if (newdevice !== activeDevice) {
    log.debug(`${nowDate.toLocaleString()}: [Spotify Control] device changed from ${activeDevice} to ${newdevice}`)
    log.debug(`${nowDate.toLocaleString()}: [Spotify Control] device is ${activeDevice}`)
    await transferPlayback(newdevice)
    activeDevice = newdevice
    log.debug(`${nowDate.toLocaleString()}: [Spotify Control] device is ${activeDevice}`)
  } else {
    log.debug(`${nowDate.toLocaleString()}: [Spotify Control] still same device, won't change: ${activeDevice}`)
  }
  if (command.name.split(':')[1] === 'playlist') {
    currentMeta.activePlaylist = command.name.split(':')[2]
    let offset = 0
    let playlisttemp
    currentMeta.totalPlaylist = 1
    while (offset < currentMeta.totalPlaylist) {
      await spotifyApi.getPlaylistTracks(currentMeta.activePlaylist, { limit: 50, offset: offset }).then(
        (data) => {
          counter.countgetPlaylistTracks++
          if (config.server.logLevel === 'debug') {
            writeCounter()
          }
          if (offset > 0) {
            playlisttemp.items = playlisttemp.items.concat(data.body.items)
          } else {
            playlisttemp = data.body
          }
          currentMeta.totalPlaylist = data.body.total
        },
        (err) => {
          handleSpotifyError(err, 'getPlaylist')
        },
      )
      offset = offset + 50
    }
    playlist = playlisttemp
  } else if (command.name.split(':')[1] === 'episode') {
    currentMeta.activeEpisode = command.name.split(':')[2]
    let offset = 0
    let showtemp
    await spotifyApi.getEpisode(currentMeta.activeEpisode).then(
      (data) => {
        counter.countgetEpisode++
        if (config.server.logLevel === 'debug') {
          writeCounter()
        }
        currentMeta.activeShow = data.body.show.id
        currentMeta.totalShows = data.body.show.total_episodes
      },
      (err) => {
        handleSpotifyError(err, 'getEpisode')
      },
    )
    while (offset < currentMeta.totalShows) {
      await spotifyApi.getShowEpisodes(currentMeta.activeShow, { limit: 50, offset: offset }).then(
        (data) => {
          counter.countgetShowEpisodes++
          if (config.server.logLevel === 'debug') {
            writeCounter()
          }
          if (offset > 0) {
            showtemp.items = showtemp.items.concat(data.body.items)
          } else {
            showtemp = data.body
          }
        },
        (err) => {
          handleSpotifyError(err, 'getShowEpisodes')
        },
      )
      offset = offset + 50
    }
    show = showtemp
  }
  currentMeta.activeSpotifyId = command.name
  playMe()
}

/*endpoint to return all spotify connect devices on the network*/
/*only used if sonos-kids-player is modified*/
app.get('/getDevices', (req, res) => {
  spotifyApi.getMyDevices().then(
    (data) => {
      counter.countgetMyDevices++
      if (config.server.logLevel === 'debug') {
        writeCounter()
      }
      const availableDevices = data.body.devices
      log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Getting available devices...`)
      res.send(availableDevices)
    },
    (err) => {
      handleSpotifyError(err, 'getMyDevicesHTTP')
    },
  )
})

/*endpoint transfer a playback to a specific device*/
/*only used if sonos-kids-player is modified*/
app.get('/setDevice', (req, res) => {
  transferPlayback(req.query.id)
})

/*endpoint to return all state information*/
/*only used if sonos-kids-player is modified*/
app.get('/state', (req, res) => {
  if (currentMeta.currentPlayer === 'spotify') {
    spotifyApi.getMyCurrentPlaybackState().then(
      (data) => {
        counter.countgetMyCurrentPlaybackStateHTTP++
        if (config.server.logLevel === 'debug') {
          writeCounter()
        }
        let state = data.body
        if (Object.keys(state).length === 0) {
          state = {
            item: {
              album: {
                name: '',
                total_tracks: '',
              },
              name: '',
              track_number: '',
            },
            currently_playing_type: '',
          }
        }
        res.send(state)
      },
      (err) => {
        handleSpotifyError(err, 'stateHTTP')
      },
    )
  } else {
    const state = {
      item: {
        album: {
          name: '',
          total_tracks: '',
        },
        name: '',
        track_number: '',
      },
      currently_playing_type: '',
    }
    res.send(state)
  }
})

/*endpoint to return playlist information*/
/*only used if sonos-kids-player is modified*/
app.get('/playlistTracks', (req, res) => {
  res.send(playlist)
})

/*endpoint to return playlist information*/
/*only used if sonos-kids-player is modified*/
app.get('/episode', (req, res) => {
  if (currentMeta.activeEpisode.length > 1) {
    spotifyApi.getEpisode(currentMeta.activeEpisode).then(
      (data) => {
        counter.countgetEpisode++
        if (config.server.logLevel === 'debug') {
          writeCounter()
        }
        let state = data.body
        if (Object.keys(state).length === 0) {
          //console.log("state is empty!");
          state = {
            total: '',
          }
        } else {
          //console.log("state is not empty !");
        }
        //log.debug(nowDate.toLocaleString() + ": [Spotify Control] Getting available state...");
        res.send(state)
      },
      (err) => {
        handleSpotifyError(err, 'episodeHTTP')
      },
    )
  } else {
    res.send({ status: 'paused', error: 'none' })
  }
})

/*endpoint to return playlist information*/
/*only used if sonos-kids-player is modified*/
app.get('/validate', (req, res) => {
  res.send(valideMedia)
})

/*endpoint to return playlist information*/
/*only used if sonos-kids-player is modified*/
app.get('/show', (req, res) => {
  res.send(show)
})

/*endpoint to return all local metainformation*/
/*only used if sonos-kids-player is modified*/
app.get('/local', (req, res) => {
  res.send(currentMeta)
})

/*sonos-kids-controller sends commands via http get and uses path names for encoding*/
/*commands are as defined in sonos-kids-controller and mapped spotify calls*/
app.use((req, res) => {
  const command = path.parse(req.url)
  log.debug(`${nowDate.toLocaleString()}: [Spotify Control]name: ${command.name}`)
  log.debug(`${nowDate.toLocaleString()}: [Spotify Control]dir: ${command.dir}`)
  /*this is the first command to be received. It always includes the device id encoded in between two /*/
  /*check this if we need to transfer the playback to a new device*/
  if (command.name.includes('spotify:')) {
    useSpotify(command)
  }

  if (command.dir.includes('library')) {
    currentMeta.currentPlayer = 'mplayer'
    currentMeta.currentType = 'local'
    playList(command.name)
  }

  if (command.dir.includes('radio')) {
    currentMeta.currentPlayer = 'mplayer'
    currentMeta.currentType = 'radio'
    const dir = command.dir
    let radioURL = dir.split('radio/').pop()
    radioURL = decodeURIComponent(radioURL)
    playURL(radioURL)
  }

  if (command.dir.includes('rss')) {
    currentMeta.currentPlayer = 'mplayer'
    currentMeta.currentType = 'rss'
    const dir = command.dir
    let rssURL = dir.split('rss/').pop()
    rssURL = decodeURIComponent(rssURL)
    playURL(rssURL)
  }

  if (command.dir.includes('validate')) {
    valideMedia.validateType = command.name.split(':')[0]
    valideMedia.validateId = command.name.split(':')[1]
    validateSpotify()
  }

  if (command.dir.includes('say/')) {
    const dir = command.dir
    let nameTTS = dir.split('say/').pop()
    nameTTS = decodeURIComponent(nameTTS)
    nameTTS = nameTTS.replace(/\//g, ' ')
    log.debug(`${nowDate.toLocaleString()}: [Spotify Control] Say: ${nameTTS}`)
    const filename = `/home/dietpi/MuPiBox/tts_files/${nameTTS}.mp3`
    try {
      if (fs.existsSync(filename)) {
        console.log('The file exists.')
        playFile(nameTTS)
      } else {
        console.log('The file does not exist.')
        downloadTTS(nameTTS)
      }
    } catch (err) {
      console.error(err)
    }
  }

  if (command.dir.includes('deletelocal')) {
    deleteLocal(command.name)
  } else if (command.name === 'pause') pause()
  else if (command.name === 'play') play()
  else if (command.name === 'stop') stop()
  else if (command.name === 'next') next()
  else if (command.name === 'previous') previous()
  else if (command.name === '+5') setVolume(1)
  else if (command.name === '-5') setVolume(0)
  else if (command.name === 'shuffleon') shuffleon()
  else if (command.name === 'shuffleoff') shuffleoff()
  else if (command.name === 'clearval') clearValidate()
  else if (command.name === 'shutoff') cmdCall('sudo su - -c "/usr/local/bin/mupibox/./shutdown.sh &"')
  else if (command.name === 'clearresume') cmdCall('sudo bash /usr/local/bin/mupibox/clearresume.sh')
  else if (command.name === 'maxresume') cmdCall('sudo bash /usr/local/bin/mupibox/remove_max_resume.sh')
  else if (command.name === 'networkrestart') cmdCall('sudo service ifup@wlan0 stop && sudo service ifup@wlan0 start')
  else if (command.name === 'reboot') cmdCall('sudo su - -c "/usr/local/bin/mupibox/./restart.sh &"')
  else if (command.name === 'index') cmdCall('sudo bash /usr/local/bin/mupibox/add_index.sh')
  else if (command.name === 'seek+30') seek(1)
  else if (command.name === 'seek-30') seek(0)
  else if (command.name.includes('seekpos:')) {
    const pos = command.name.split(':')[1]
    seek(pos)
  } else if (command.name === 'albumstop') cmdCall('bash /usr/local/bin/mupibox/albumstop.sh')
  else if (command.name === 'enablewifi')
    cmdCall(
      "sudo sed -i -e 's/dtoverlay=disable-wifi//g' /boot/config.txt && sudo head -n -1 /boot/config.txt > /tmp/config.txt && sudo mv /tmp/config.txt /boot/config.txt && sudo su - -c '/usr/local/bin/mupibox/restart.sh &'",
    )

  /*   else if (command.name.includes("jumpto:")){
    let offsetTrackNr = command.name.split(':')[1];
    jumpTo(offsetTrackNr);
  } */

  const resp = { status: 'ok', error: 'none' }
  res.send(resp)
})

server.listen(config.server.port)
console.log(
  `${nowDate.toLocaleString()}: [mupibox-backend-player] Server started at http://localhost:${config.server.port}`,
)
