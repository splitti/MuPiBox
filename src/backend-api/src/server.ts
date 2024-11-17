import {
  AlbumGroup,
  RadioAlbumGroup,
  RssAlbumGroup,
  SpotifyQueryAlbumGroup,
  SpotifyUrlAlbumGroup,
  SpotifyUrlType,
} from './models/albumgroup.model'

import { ServerConfig } from './models/server.model'
import cors from 'cors'
import { environment } from './environment'
import express from 'express'
import fs from 'node:fs'
import jsonfile from 'jsonfile'
import ky from 'ky'
import path from 'node:path'
import { readJsonFile } from './utils'
import { spotifyApi } from './spotify'
import xmlparser from 'xml-js'

const serverName = 'mupibox-backend-api'

// Configuration files.
let configBasePath = './server/config'
if (!environment.production) {
  configBasePath = './config' // This uses the package.json path as pwd.
}

let config: ServerConfig | undefined = undefined
readJsonFile(`${configBasePath}/config.json`).then((configFile) => {
  config = configFile
})
const dataFile = `${configBasePath}/data.json`
const resumeFile = `${configBasePath}/resume.json`
const activedataFile = `${configBasePath}/active_data.json`
const activeresumeFile = `${configBasePath}/active_resume.json`
const networkFile = `${configBasePath}/network.json`
const wlanFile = `${configBasePath}/wlan.json`
const monitorFile = `${configBasePath}/monitor.json`
const albumstopFile = `${configBasePath}/albumstop.json`
const mupihat = '/tmp/mupihat.json'
const dataLock = '/tmp/.data.lock'
const resumeLock = '/tmp/.resume.lock'

const nowDate = new Date()

// We export the app so we can use it in testing.
export const app = express()
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: false }))

// We only want to serve the Angular app as static files in production so that we can start
// the Angular development server during development to be able to hot-reload and debug.
// We explicitely check for !== 'development' for now so we do not need to set this env in
// production.
if (environment.production) {
  // Static path to compiled Angular app
  app.use(express.static(path.join(__dirname, 'www')))
}

// Routes

const createRadioAlbumGroup = (item: any): RadioAlbumGroup => {
  return {
    sourceType: 'radio',
    name: item.artist,
    img: undefined,
    category: item.category,
    url: item.id,
  }
}

const createRssAlbumGroup = (item: any): RssAlbumGroup => {
  return {
    sourceType: 'rss',
    name: item.artist,
    img: undefined,
    category: item.category,
    url: item.id,
    sorting: item.sorting,
    // TODO: Range?
  }
}

const createSpotifyQueryAlbumGroup = (item: any): SpotifyQueryAlbumGroup => {
  return {
    sourceType: 'spotifyQuery',
    name: item.artist,
    img: undefined,
    category: item.category,
    query: item.query,
    sorting: item.sorting,
    // TODO: Range?
  }
}

const getSpotifyUrlType = (url: string): SpotifyUrlType => {
  if (url.includes('artist')) return 'artist'
  if (url.includes('album')) return 'album'
  if (url.includes('show')) return 'show'
  return 'playlist'
}

const createSpotifyUrlAlbumGroup = (item: any): SpotifyUrlAlbumGroup => {
  return {
    sourceType: 'spotifyUrl',
    name: item.artist,
    img: undefined,
    category: item.category,
    url: item.spotify_url,
    sorting: item.sorting,
    urlType: getSpotifyUrlType(item.spotify_url),
    shuffle: item.shuffle,
    // TODO: Range?
  }
}

app.get('/api/albumgroups', async (_req, res) => {
  try {
    const data = await readJsonFile(dataFile)
    const out: AlbumGroup[] = []

    for (const item of data) {
      if (item.type === 'radio') {
        out.push(createRadioAlbumGroup(item))
      } else if (item.type === 'rss') {
        out.push(createRssAlbumGroup(item))
      } else if (item.type === 'spotify') {
        if ('query' in item) {
          out.push(createSpotifyQueryAlbumGroup(item))
        } else if ('spotify_url' in item) {
          out.push(createSpotifyUrlAlbumGroup(item))
        }
      }
    }

    // Get the images for the spotify stuff.
    const promises = await Promise.allSettled(
      out
        .filter((items) => items.sourceType === 'spotifyUrl')
        .map((item) => {
          if (item.urlType === 'artist') {
            return spotifyApi?.getArtist(item.url)
          }
        }),
    )
    console.log(promises)

    // TODO: Local files.

    res.json(out)
  } catch (error) {
    console.error(`${nowDate.toLocaleString()}: [${serverName}] ${error}`)
    res.json([])
  }
})

app.get('/api/rssfeed', async (req, res) => {
  const rssUrl = req.query.url
  if (typeof rssUrl !== 'string') {
    res.status(500).send('Given url is not a string.')
    return
  }
  ky.get(rssUrl)
    .text()
    .then((response) => {
      res.send(xmlparser.xml2json(response, { compact: true, nativeType: true }))
    })
    .catch(() => {
      res.status(500).send('External url responded with error code.')
    })
})

app.get('/api/data', (req, res) => {
  if (fs.existsSync(activedataFile)) {
    jsonfile.readFile(activedataFile, (error, data) => {
      if (error) {
        console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error /api/data read active_data.json`)
        console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] ${error}`)
        res.json([])
      } else {
        res.json(data)
      }
    })
  }
})

app.get('/api/resume', (req, res) => {
  if (fs.existsSync(resumeFile)) {
    tryReadFile(resumeFile)
      .then((data) => {
        res.json(data)
      })
      .catch((error) => {
        console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error /api/resume read resume.json`)
        console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] ${error}`)
        res.status(500).send('Internal Server Error')
      })
  } else {
    res.status(404).send(`File Not Found: ${resumeFile}`)
  }
})

app.get('/api/mupihat', (req, res) => {
  if (fs.existsSync(mupihat)) {
    jsonfile.readFile(mupihat, (error, data) => {
      if (error) {
        console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error /api/mupihat read mupihat.json`)
        console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] ${error}`)
        res.json([])
      } else {
        res.json(data)
      }
    })
  }
})

app.get('/api/activeresume', (req, res) => {
  if (fs.existsSync(activeresumeFile)) {
    jsonfile.readFile(activeresumeFile, (error, data) => {
      if (error) {
        console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error /api/activeresume read active_resume.json`)
        console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] ${error}`)
        res.json([])
      } else {
        res.json(data)
      }
    })
  }
})

app.get('/api/network', (req, res) => {
  if (fs.existsSync(networkFile)) {
    tryReadFile(networkFile)
      .then((data) => {
        res.json(data)
      })
      .catch((error) => {
        console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error /api/network read network.json`)
        console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] ${error}`)
        res.status(500).send('Internal Server Error')
      })
  } else {
    res.status(404).send(`File Not Found: ${networkFile}`)
  }
})

app.get('/api/monitor', (req, res) => {
  if (fs.existsSync(monitorFile)) {
    jsonfile.readFile(monitorFile, (error, data) => {
      if (error) {
        console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error /api/monitor read monitor.json`)
        console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] ${error}`)
        res.json([])
      } else {
        res.json(data)
      }
    })
  }
})

app.get('/api/albumstop', (req, res) => {
  if (fs.existsSync(albumstopFile)) {
    jsonfile.readFile(albumstopFile, (error, data) => {
      if (error) {
        console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error /api/albumstop read albumstop.json`)
        console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] ${error}`)
        res.json({})
      } else {
        res.json(data)
      }
    })
  } else {
    res.json({})
  }
})

app.get('/api/wlan', (req, res) => {
  if (fs.existsSync(wlanFile)) {
    jsonfile.readFile(wlanFile, (error, data) => {
      if (error) {
        console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error /api/wlan read wlan.json`)
        console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] ${error}`)
        res.json([])
      } else {
        res.json(data)
      }
    })
  }
})

app.post('/api/addwlan', (req, res) => {
  jsonfile.readFile(wlanFile, (error, data) => {
    let out = data

    if (error) out = []
    out.push(req.body)

    jsonfile.writeFile(wlanFile, out, { spaces: 4 }, (error) => {
      if (error) throw error
      res.status(200).send('ok')
    })
  })
})

app.post('/api/add', (req, res) => {
  try {
    if (fs.existsSync(dataLock)) {
      console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] /api/add data.json is locked`)
      res.status(200).send('locked')
    } else {
      fs.openSync(dataLock, 'w')
      jsonfile.readFile(dataFile, (error, data) => {
        if (error) {
          console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error /api/add read data.json`)
          console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] ${error}`)
          res.status(200).send('error')
        } else {
          data.push(req.body)

          jsonfile.writeFile(dataFile, data, { spaces: 4 }, (error) => {
            if (error) throw error
            res.status(200).send('ok')
          })
        }
      })
      fs.unlink(dataLock, (err) => {
        if (err) throw err
        console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] /api/add - data.json unlocked, locked file deleted!`)
      })
    }
  } catch (err) {
    console.error(err)
  }
})

app.post('/api/addresume', (req, res) => {
  try {
    if (fs.existsSync(resumeLock)) {
      console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] /api/addresume resume.json is locked`)
      res.status(200).send('locked')
    } else {
      fs.openSync(resumeLock, 'w')
      jsonfile.readFile(resumeFile, (error, data) => {
        if (error) {
          console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error /api/add read resume.json`)
          console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] ${error}`)
          res.status(200).send('error')
        } else {
          // Index des vorhandenen Eintrags mit derselben "id" finden
          const index = data.findIndex((item: { id: any }) => item.id === req.body.id)

          if (index !== -1) {
            // Wenn der Eintrag vorhanden ist, ersetze ihn
            data[index] = req.body
            console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] Entry with id ${req.body.id} replaced.`)
          } else {
            // Wenn der Eintrag nicht vorhanden ist, füge ihn hinzu
            data.push(req.body)
            console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] New entry with id ${req.body.id} added.`)
          }

          jsonfile.writeFile(resumeFile, data, { spaces: 4 }, (error) => {
            if (error) throw error
            res.status(200).send('ok')
          })
        }
      })
      fs.unlink(resumeLock, (err) => {
        if (err) throw err
        console.log(
          `${nowDate.toLocaleString()}: [MuPiBox-Server] /api/addresume - resume.json unlocked, locked file deleted!`,
        )
      })
    }
  } catch (err) {
    console.error(err)
  }
})

app.post('/api/delete', (req, res) => {
  try {
    if (fs.existsSync(dataLock)) {
      console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] /api/delete data.json is locked`)
      res.status(200).send('locked')
    } else {
      fs.openSync(dataLock, 'w')
      jsonfile.readFile(dataFile, (error, data) => {
        if (error) {
          console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error /api/delete read data.json`)
          console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] ${error}`)
          res.status(200).send('error')
        } else {
          data.splice(req.body.index, 1)

          jsonfile.writeFile(dataFile, data, { spaces: 4 }, (error) => {
            if (error) throw error
            res.status(200).send('ok')
          })
        }
      })
      fs.unlink(dataLock, (err) => {
        if (err) throw err
        console.log(
          `${nowDate.toLocaleString()}: [MuPiBox-Server] /api/delete - data.json unlocked, locked file deleted!`,
        )
      })
    }
  } catch (err) {
    console.error(err)
  }
})

app.post('/api/edit', (req, res) => {
  try {
    if (fs.existsSync(dataLock)) {
      console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] /api/edit data.json is locked`)
      res.status(200).send('locked')
    } else {
      fs.openSync(dataLock, 'w')
      jsonfile.readFile(dataFile, (error, data) => {
        if (error) {
          console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error /api/edit read data.json`)
          console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] ${error}`)
          res.status(200).send('error')
        } else {
          data.splice(req.body.index, 1, req.body.data)

          jsonfile.writeFile(dataFile, data, { spaces: 4 }, (error) => {
            if (error) throw error
            res.status(200).send('ok')
          })
        }
      })
      fs.unlink(dataLock, (err) => {
        if (err) throw err
        console.log(
          `${nowDate.toLocaleString()}: [MuPiBox-Server] /api/edit - data.json unlocked, locked file deleted!`,
        )
      })
    }
  } catch (err) {
    console.error(err)
  }
})

app.post('/api/editresume', (req, res) => {
  try {
    if (fs.existsSync(resumeLock)) {
      console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] /api/editresume resume.json is locked`)
      res.status(200).send('locked')
    } else {
      fs.openSync(resumeLock, 'w')
      jsonfile.readFile(resumeFile, (error, data) => {
        if (error) {
          console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error /api/editresume read resume.json`)
          console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] ${error}`)
          res.status(200).send('error')
        } else {
          // Prüfe, ob die ID bereits im Array existiert
          const existingIndex = data.findIndex((item: { id: any }) => item.id === req.body.data.id)

          if (existingIndex !== -1) {
            // Ersetze den vorhandenen Eintrag mit derselben ID
            data[existingIndex] = req.body.data
            console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] Entry with id ${req.body.data.id} replaced.`)
          } else {
            // Bestimme den zu verwendenden Index basierend auf der Array-Länge
            const indexToReplace = Math.min(req.body.index, data.length - 1)

            // Ersetze den Eintrag am berechneten Index oder füge hinzu
            data.splice(indexToReplace, 1, req.body.data)
            console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] Entry at index ${indexToReplace} replaced.`)
          }

          // Speichere die geänderten Daten zurück in die Datei
          jsonfile.writeFile(resumeFile, data, { spaces: 4 }, (error) => {
            if (error) throw error
            res.status(200).send('ok')
          })
        }
      })
      fs.unlink(resumeLock, (err) => {
        if (err) throw err
        console.log(
          `${nowDate.toLocaleString()}: [MuPiBox-Server] /api/editresume - resume.json unlocked, locked file deleted!`,
        )
      })
    }
  } catch (err) {
    console.error(err)
  }
})

app.get('/api/token', (req, res) => {
  if (spotifyApi === undefined) {
    res.status(500).send('Could not intialize Spotify API.')
    return
  }
  if (spotifyApi.getAccessToken() === undefined) {
    res.status(500).send('Spotify access token not set yet.')
    return
  }
  res.status(200).send(spotifyApi.getAccessToken())
})

app.get('/api/sonos', (req, res) => {
  if (config === undefined) {
    res.status(500).send('Could not load server config.')
    return
  }
  // Send server address and port of the node-sonos-http-api instance to the client
  res.status(200).send(config['node-sonos-http-api'])
})

const tryReadFile = (filePath: string, retries = 3, delayMs = 1000) => {
  return new Promise((resolve, reject) => {
    const attempt = (remainingRetries: number) => {
      jsonfile.readFile(filePath, (error, data) => {
        if (error) {
          if (remainingRetries > 0) {
            console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error reading ${filePath}, retrying...`)
            setTimeout(() => attempt(remainingRetries - 1), delayMs)
          } else {
            reject(error)
          }
        } else {
          resolve(data)
        }
      })
    }
    attempt(retries)
  })
}

if (!environment.test) {
  app.listen(8200)
  console.log(`${nowDate.toLocaleString()}: [${serverName}] Server started at http://localhost:8200`)
}
