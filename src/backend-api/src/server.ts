import fs from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import cors from 'cors'
import express from 'express'
import jsonfile from 'jsonfile'
import request from 'request'
import SpotifyWebApi from 'spotify-web-api-node'
import xmlparser from 'xml-js'
import { ServerConfig } from './models/server.model'

// Configuration files.
let configBasePath = './server/config'
if (process.env.NODE_ENV === 'development') {
  configBasePath = './config' // This uses the package.json path as pwd.
}

async function readJsonFile(path: string) {
  const file = await readFile(path, 'utf8')
  return JSON.parse(file)
}

let config: ServerConfig | undefined = undefined
let spotifyApi: SpotifyWebApi | undefined = undefined
readJsonFile(`${configBasePath}/config.json`).then((configFile) => {
  config = configFile
  spotifyApi = new SpotifyWebApi({
    clientId: config?.spotify?.clientId,
    clientSecret: config?.spotify?.clientSecret,
  })
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

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: false }))

// We only want to serve the Angular app as static files in production so that we can start
// the Angular development server during development to be able to hot-reload and debug.
// We explicitely check for !== 'development' for now so we do not need to set this env in
// production.
if (process.env.NODE_ENV !== 'development') {
  // Static path to compiled Angular app
  app.use(express.static(path.join(__dirname, 'www')))
}

// Routes
app.get('/api/rssfeed', async (req, res) => {
  const rssUrl = req.query.url
  if (typeof rssUrl === 'string') {
    request.get(rssUrl, (_error, response, _body) => {
      res.send(xmlparser.xml2json(response.body, { compact: true, nativeType: true }))
    })
  } else {
    res.status(500).send('Given url is not a string.')
  }
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
        res.json([])
      } else {
        res.json(data)
      }
    })
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
          data.push(req.body)

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
          data.splice(req.body.index, 1, req.body.data)

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
  // Retrieve an access token from Spotify
  spotifyApi.clientCredentialsGrant().then(
    (data) => {
      res.status(200).send(data.body.access_token)
    },
    (err) => {
      console.log(
        `${nowDate.toLocaleString()}: [MuPiBox-Server] Something went wrong when retrieving a new Spotify access token`,
        err.message,
      )

      res.status(500).send(err.message)
    },
  )
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

app.listen(8200)
console.log(`${nowDate.toLocaleString()}: [mupibox-backend-api] Server started at http://localhost:8200`)
