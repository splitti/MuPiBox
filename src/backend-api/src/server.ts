import { exec } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import cors from 'cors'
import express, { Request, Response } from 'express'
import jsonfile from 'jsonfile'
import { environment } from './environment'
import { Data } from './models/data.model'
import { Folder, FolderWithChildren } from './models/folder.model'
import { LogRequest, LogResponse } from './models/log.model'
import { Network } from './models/network.model'
import { ServerConfig } from './models/server.model'
import type { SpotifyValidationRequest, SpotifyValidationResponse } from './models/spotify-api.model'
import { SpotifyUrlData } from './models/spotify-url-data.model'
import { SpotifyApiService } from './services/spotify-api.service'
import { SpotifyMediaInfo } from './services/spotify-media-info.service'
import { addRssImageInformation, getRssMedia } from './sources/rss'
import {
  addSpotifyImageInformation,
  addSpotifyTitleInformation,
  getSpotifyMedia,
  validateSpotifyUrlData,
} from './sources/spotify'
import { cmdCall, readJsonFile } from './utils'

const serverName = 'mupibox-backend-api'

// Configuration files.
let configBasePath = './server/config'
if (!environment.production) {
  configBasePath = './config' // This uses the package.json path as pwd.
}

let config: ServerConfig | undefined
readJsonFile(`${configBasePath}/config.json`).then((configFile) => {
  config = configFile

  // Initialize Spotify API service once config is loaded
  if (config?.spotify) {
    try {
      spotifyApiService = new SpotifyApiService(config)
      console.info('Spotify API service initialized')
    } catch (error) {
      console.error('Failed to initialize Spotify API service:', error)
    }
  } else {
    console.warn('No Spotify configuration found, Spotify API service will not be available')
  }
})
const mupiboxConfigPath = '/etc/mupibox/mupiboxconfig.json'
const dataFile = `${configBasePath}/data.json`
const resumeFile = `${configBasePath}/resume.json`
const networkFile = `${configBasePath}/network.json`
const wlanFile = `${configBasePath}/wlan.json`
const monitorFile = `${configBasePath}/monitor.json`
const albumstopFile = `${configBasePath}/albumstop.json`
const mupihat = '/tmp/mupihat.json'
const dataLock = '/tmp/.data.lock'
const resumeLock = '/tmp/.resume.lock'

const nowDate = new Date()

// Initialize Spotify services
const spotifyMediaInfo = new SpotifyMediaInfo()
let spotifyApiService: SpotifyApiService | undefined

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

/**
 *
 * @param data - The data that should be sorted into folders. Note that the data entries
 * might be changed after calling this method (i.e., artist and artistcover might be
 * added).
 */
const getFoldersWithData = async (data: Data[]): Promise<FolderWithChildren[]> => {
  // For this, we might need to first set the `artist` field for entries that do
  // not have it set yet. Spotify shows, artists, albums and playlists are the only
  // data entries where we allow the user to not specify the folder name.
  // These adapt the original entries in `data`.
  await addSpotifyTitleInformation(data.filter((entry) => entry.artist === undefined))

  // Now sort them into folders.
  const toMapKey = (folder: Data): string => {
    return `${folder.artist}|{}|${folder.category}`
  }
  const folderMap = new Map<string, FolderWithChildren>()
  for (const entry of data) {
    const folderId = toMapKey(entry)
    const folder = folderMap.get(folderId)
    if (folder !== undefined) {
      folder?.children.push(entry)
      if (folder.img === undefined && entry.artistcover !== undefined) {
        folder.img = entry.artistcover
      }
    } else {
      folderMap.set(folderId, {
        name: entry.artist ?? 'No name',
        img: entry.artistcover,
        category: entry.category,
        children: [entry],
      })
    }
  }
  return [...folderMap.values()]
}

// Routes
app.get('/api/folders', async (_req, res) => {
  try {
    let data: Data[] = await readJsonFile(dataFile)
    const network: Network = await readJsonFile(networkFile)
    // If we are not online, we filter all sources that require an online connection out.
    if (network.onlinestate !== 'online') {
      data = data.filter((entry) => entry.type === 'library')
    }

    // First, we sort all data.json entries into folders.
    const folderList = await getFoldersWithData(data)

    // Finally, we need to check if we have an image url for each folder.
    // If not, we check if we can request it.
    const folderWithoutImage = folderList.filter((folder) => folder.img === undefined)
    const childrenWithFolders = folderWithoutImage.map((folder) => {
      return { data: folder.children[0], folder: folder }
    })
    await Promise.allSettled([
      addSpotifyImageInformation(childrenWithFolders.map((entry) => entry.data)),
      addRssImageInformation(childrenWithFolders.map((entry) => entry.data)),
    ])
    // Write the image to the folder.
    for (const entry of childrenWithFolders) {
      entry.folder.img = entry.data.artistcover
    }

    // Last, convert to the data format we want, sort and return.
    const out: Folder[] = folderList
      .map((folder) => {
        return {
          name: folder.name,
          category: folder.category,
          img: folder.img,
        }
      })
      .sort((a: Folder, b: Folder) => {
        return a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: 'base',
        })
      })
    res.json(out)
  } catch (error) {
    console.error(`${nowDate.toLocaleString()}: [${serverName}] ${error}`)
    res.json([])
  }
})

app.get('/api/media/:category/:folder', async (req, res) => {
  try {
    const data: Data[] = await readJsonFile(dataFile)
    const categoryData = data.filter((entry) => entry.category === req.params.category)

    const folders = await getFoldersWithData(categoryData)

    const dataEntries = folders
      .filter((folder) => folder.name === req.params.folder)
      .flatMap((folder) => folder.children)

    // TODO: Slice and sort media.
    const results = dataEntries.map((entry) => {
      if (entry.type === 'rss') {
        return getRssMedia(entry)
      }
      if (entry.type === 'spotify') {
        return getSpotifyMedia(entry)
      }
      if (entry.type === 'radio') {
        // We replace https with https for now since mplayer is way slower
        // with https streams. We should fix this in the future.
        const streamUrl = entry.id.replace('https://', 'http://')
        return Promise.resolve({
          type: 'radio',
          url: streamUrl,
          name: entry.title,
          category: entry.category,
          folderName: entry.artist,
          img: entry.cover,
          allowShuffle: false,
          shuffle: false,
        })
      }
      if (entry.type === 'library') {
        return Promise.resolve({
          type: 'local',
          name: entry.title,
          category: entry.category,
          folderName: entry.artist,
          img: entry.cover,
          allowShuffle: false,
          shuffle: false,
        })
      }
      return undefined
    })
    const out = (await Promise.allSettled(results))
      .filter((promise) => promise.status === 'fulfilled')
      .flatMap((promise) => promise.value)

    //       const sliceMedia = (media: Media[], offsetByOne = false): Media[] => {
    //         if (artist.coverMedia?.aPartOfAll) {
    //           const min = Math.max(0, (artist.coverMedia?.aPartOfAllMin ?? 0) - (offsetByOne ? 1 : 0))
    //           const max =
    //             (artist.coverMedia?.aPartOfAllMax ?? Number.parseInt(artist.albumCount)) - (offsetByOne ? 1 : 0)
    //           return media.slice(min, max + 1)
    //         }
    //         return media
    //       }

    //       const isShow =
    //         (artist.coverMedia.showid && artist.coverMedia.showid.length > 0) ||
    //         (artist.coverMedia.type === 'rss' && artist.coverMedia.id.length > 0)

    //   const sorting = coverMedia.sorting ?? defaultSorting
    //   switch (sorting) {
    //     case MediaSorting.AlphabeticalDescending:
    //       return media.sort((a, b) =>
    //         b.title.localeCompare(a.title, undefined, {
    //           numeric: true,
    //           sensitivity: 'base',
    //         }),
    //       )
    //     case MediaSorting.ReleaseDateAscending:
    //       return media.sort((a, b) => new Date(a.release_date).getTime() - new Date(b.release_date).getTime())
    //     case MediaSorting.ReleaseDateDescending:
    //       return media.sort((a, b) => new Date(b.release_date).getTime() - new Date(a.release_date).getTime())
    //     default: // MediaList.Alphabetical.Ascending
    //       return media.sort((a, b) =>
    //         a.title.localeCompare(b.title, undefined, {
    //           numeric: true,
    //           sensitivity: 'base',
    //         }),
    //       )
    //   }
    // }

    //         map((media) => {
    //           return sliceMedia(
    //             this.sortMedia(
    //               artist.coverMedia,
    //               media,
    //               isShow ? MediaSorting.ReleaseDateDescending : MediaSorting.AlphabeticalAscending,
    //             ),
    //             !isShow,
    //           )
    //         }),

    res.json(out)
  } catch (error) {
    console.error(`${nowDate.toLocaleString()}: [${serverName}] ${error}`)
    res.json([])
  }
})

/**
 * TODO
 */
app.get('/api/data', async (_req, res) => {
  try {
    const data: Data[] = await readJsonFile(dataFile)
    res.json(data)
  } catch (error) {
    console.error(`${nowDate.toLocaleString()}: [${serverName}] ${error}`)
    res.json([])
  }
})

/**
 * TODO
 */
app.get('/api/data/:index', async (req, res) => {
  try {
    const index = Number.parseInt(req.params.index, 10)
    const data: Data[] = await readJsonFile(dataFile)
    if (index >= 0 && index < data.length) {
      res.json(data[index])
    } else {
      res.status(404).json({ error: 'Data not found' })
    }
  } catch (error) {
    console.error(`${nowDate.toLocaleString()}: [${serverName}] ${error}`)
    res.status(404).json({ error: 'Data not found' })
  }
})

/**
 * TODO
 */
app.post('/api/data', async (req, res) => {
  try {
    // There might be a data lock. If so, we retry 5 times to reduce errors for the user.
    // In the future, we want to get rid of this lock if possible.
    for (let i = 0; i < 5; ++i) {
      if (!fs.existsSync(dataLock)) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    // The lock is still there :(
    if (fs.existsSync(dataLock)) {
      console.log(`${nowDate.toLocaleString()}: [${serverName}] /api/data data.json is locked`)
      res.status(503).send('Data file is locked. Try again later.')
      return
    }

    fs.openSync(dataLock, 'w')
    const data: Data[] = await readJsonFile(dataFile)
    data.push(req.body)
    jsonfile.writeFile(dataFile, data, { spaces: 4 }, (error) => {
      if (error) throw error
      res.status(201).send(req.body)
    })
    fs.unlink(dataLock, (err) => {
      if (err) throw err
      console.log(`${nowDate.toLocaleString()}: [${serverName}] /api/data - data.json unlocked, locked file deleted!`)
    })
  } catch (error) {
    console.error(`${nowDate.toLocaleString()}: [${serverName}] ${error}`)
    res.status(500).send('Could not add entry to the data file.')
  }
})

/**
 * TODO
 */
app.post('/api/validate-spotify', async (req: Request, res: Response) => {
  const spotifyUrlData: SpotifyUrlData = req.body
  if (!spotifyUrlData || !spotifyUrlData.type || !spotifyUrlData.id) {
    res.status(400).json({ error: 'Invalid Spotify URL.' })
    return
  }

  const isValid = await validateSpotifyUrlData(spotifyUrlData)
  if (isValid) {
    res.status(200).json({ message: 'Spotify URL is valid.' })
  } else {
    res.status(400).json({ error: 'Invalid Spotify URL.' })
  }
})

app.post('/api/reboot', async (_req, res) => {
  cmdCall('sudo su - -c "/usr/local/bin/mupibox/./restart.sh &"')
    .then(() => res.status(200).send('Rebooting...'))
    .catch((error) => {
      console.log(`${nowDate.toLocaleString()}: [${serverName}] Error /api/reboot`)
      res.status(500).send('Internal Server Error')
    })
})

app.post('api/shutdown', (_req, res) => {
  cmdCall('sudo su - -c "/usr/local/bin/mupibox/./shutdown.sh &"')
    .then(() => res.status(200).send('Shutting down...'))
    .catch((error) => {
      console.log(`${nowDate.toLocaleString()}: [${serverName}] Error /api/shutdown`)
      res.status(500).send('Internal Server Error')
    })
})

app.get('/api/resume', (_req, res) => {
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

app.delete('/api/resume', async (_req, res) => {
  try {
    await jsonfile.writeFile(resumeFile, [], { spaces: 4 })
    res.status(200).send('All resume data deleted.')
  } catch (error) {
    console.error(`${nowDate.toLocaleString()}: [${serverName}] ${error}`)
    res.status(500).send('Could not delete all resume data.')
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
        res.json({ monitor: 'On' })
      } else {
        res.json(data)
      }
    })
  } else {
    res.json({ monitor: 'On' })
  }
})

app.get('/api/albumstop', (_req, res) => {
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

app.get('/api/wlan', (_req, res) => {
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

// TODO: CHeck if this is used.
app.get('/api/spotify/config', (_req, res) => {
  if (config?.spotify === undefined) {
    res.status(500).send('Could load spotify config.')
    return
  }
  res.status(200).send({
    ...config.spotify,
    deviceName: config['node-sonos-http-api'].server,
  })
})

app.get('/api/spotify/playlist/:playlistId', async (req, res) => {
  const playlistId = req.params.playlistId

  if (!playlistId) {
    res.status(400).json({ error: 'Playlist ID is required' })
    return
  }

  try {
    console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] Fetching Spotify playlist: ${playlistId}`)

    const playlistData = await spotifyMediaInfo.fetchPlaylistData(playlistId)
    res.status(200).json(playlistData)

    console.log(
      `${nowDate.toLocaleString()}: [MuPiBox-Server] Successfully fetched playlist: ${playlistData.playlist.name}`,
    )
  } catch (error) {
    console.error(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error fetching playlist ${playlistId}:`, error)
    res.status(500).json({
      error: 'Failed to fetch playlist data',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Search albums
app.get('/api/spotify/search/albums', async (req, res) => {
  if (!spotifyApiService) {
    res.status(503).json({ error: 'Spotify API service not available' })
    return
  }

  const query = req.query.query as string
  const limit = Number.parseInt(req.query.limit as string, 10) || 50
  const offset = Number.parseInt(req.query.offset as string, 10) || 0

  if (!query) {
    res.status(400).json({ error: 'Query parameter is required' })
    return
  }

  try {
    const results = await spotifyApiService.searchAlbums(query, limit, offset)
    res.status(200).json(results)
  } catch (error) {
    console.error(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error searching albums:`, error)
    res.status(500).json({
      error: 'Failed to search albums',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Get artist albums
app.get('/api/spotify/artist/:artistId/albums', async (req, res) => {
  if (!spotifyApiService) {
    res.status(503).json({ error: 'Spotify API service not available' })
    return
  }

  const artistId = req.params.artistId
  const albumTypes = (req.query.album_type as string) || 'album,single,compilation'
  const limit = Number.parseInt(req.query.limit as string, 10) || 50
  const offset = Number.parseInt(req.query.offset as string, 10) || 0

  if (!artistId) {
    res.status(400).json({ error: 'Artist ID is required' })
    return
  }

  try {
    const results = await spotifyApiService.getArtistAlbums(artistId, albumTypes, limit, offset)
    res.status(200).json(results)
  } catch (error) {
    console.error(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error getting artist albums:`, error)
    res.status(500).json({
      error: 'Failed to get artist albums',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Get show episodes
app.get('/api/spotify/show/:showId/episodes', async (req, res) => {
  if (!spotifyApiService) {
    res.status(503).json({ error: 'Spotify API service not available' })
    return
  }

  const showId = req.params.showId
  const limit = Number.parseInt(req.query.limit as string, 10) || 50
  const offset = Number.parseInt(req.query.offset as string, 10) || 0

  if (!showId) {
    res.status(400).json({ error: 'Show ID is required' })
    return
  }

  try {
    const results = await spotifyApiService.getShowEpisodes(showId, limit, offset)
    res.status(200).json(results)
  } catch (error) {
    console.error(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error getting show episodes:`, error)
    res.status(500).json({
      error: 'Failed to get show episodes',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Get album details
app.get('/api/spotify/album/:albumId', async (req, res) => {
  if (!spotifyApiService) {
    res.status(503).json({ error: 'Spotify API service not available' })
    return
  }

  const albumId = req.params.albumId

  if (!albumId) {
    res.status(400).json({ error: 'Album ID is required' })
    return
  }

  try {
    const album = await spotifyApiService.getAlbum(albumId)
    res.status(200).json(album)
  } catch (error) {
    console.error(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error getting album:`, error)
    res.status(500).json({
      error: 'Failed to get album',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Get playlist details (using API service, not scraper)
app.get('/api/spotify/playlist-api/:playlistId', async (req, res) => {
  if (!spotifyApiService) {
    res.status(503).json({ error: 'Spotify API service not available' })
    return
  }

  const playlistId = req.params.playlistId

  if (!playlistId) {
    res.status(400).json({ error: 'Playlist ID is required' })
    return
  }

  try {
    const playlist = await spotifyApiService.getPlaylist(playlistId)
    res.status(200).json(playlist)
  } catch (error) {
    console.error(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error getting playlist:`, error)
    res.status(500).json({
      error: 'Failed to get playlist',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Get playlist tracks
app.get('/api/spotify/playlist/:playlistId/tracks', async (req, res) => {
  if (!spotifyApiService) {
    res.status(503).json({ error: 'Spotify API service not available' })
    return
  }

  const playlistId = req.params.playlistId
  const limit = Number.parseInt(req.query.limit as string, 10) || 50
  const offset = Number.parseInt(req.query.offset as string, 10) || 0

  if (!playlistId) {
    res.status(400).json({ error: 'Playlist ID is required' })
    return
  }

  try {
    const tracks = await spotifyApiService.getPlaylistTracks(playlistId, limit, offset)
    res.status(200).json(tracks)
  } catch (error) {
    console.error(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error getting playlist tracks:`, error)
    res.status(500).json({
      error: 'Failed to get playlist tracks',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Get show details
app.get('/api/spotify/show/:showId', async (req, res) => {
  if (!spotifyApiService) {
    res.status(503).json({ error: 'Spotify API service not available' })
    return
  }

  const showId = req.params.showId

  if (!showId) {
    res.status(400).json({ error: 'Show ID is required' })
    return
  }

  try {
    const show = await spotifyApiService.getShow(showId)
    res.status(200).json(show)
  } catch (error) {
    console.error(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error getting show:`, error)
    res.status(500).json({
      error: 'Failed to get show',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Get audiobook details
app.get('/api/spotify/audiobook/:audiobookId', async (req, res) => {
  if (!spotifyApiService) {
    res.status(503).json({ error: 'Spotify API service not available' })
    return
  }

  const audiobookId = req.params.audiobookId

  if (!audiobookId) {
    res.status(400).json({ error: 'Audiobook ID is required' })
    return
  }

  try {
    const audiobook = await spotifyApiService.getAudiobook(audiobookId)
    res.status(200).json(audiobook)
  } catch (error) {
    console.error(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error getting audiobook:`, error)
    res.status(500).json({
      error: 'Failed to get audiobook',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Get episode details
app.get('/api/spotify/episode/:episodeId', async (req, res) => {
  if (!spotifyApiService) {
    res.status(503).json({ error: 'Spotify API service not available' })
    return
  }

  const episodeId = req.params.episodeId

  if (!episodeId) {
    res.status(400).json({ error: 'Episode ID is required' })
    return
  }

  try {
    const episode = await spotifyApiService.getEpisode(episodeId)
    res.status(200).json(episode)
  } catch (error) {
    console.error(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error getting episode:`, error)
    res.status(500).json({
      error: 'Failed to get episode',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Get artist details
app.get('/api/spotify/artist/:artistId', async (req, res) => {
  if (!spotifyApiService) {
    res.status(503).json({ error: 'Spotify API service not available' })
    return
  }

  const artistId = req.params.artistId

  if (!artistId) {
    res.status(400).json({ error: 'Artist ID is required' })
    return
  }

  try {
    const artist = await spotifyApiService.getArtist(artistId)
    res.status(200).json(artist)
  } catch (error) {
    console.error(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error getting artist:`, error)
    res.status(500).json({
      error: 'Failed to get artist',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Validate Spotify resource
app.post('/api/spotify/validate', async (req, res) => {
  if (!spotifyApiService) {
    res.status(503).json({ error: 'Spotify API service not available' })
    return
  }

  const { id, type } = req.body as SpotifyValidationRequest

  if (!id || !type) {
    res.status(400).json({ error: 'ID and type are required' })
    return
  }

  try {
    // First try the Spotify API validation
    const valid = await spotifyApiService.validateSpotifyResource(id, type)

    if (valid) {
      const response: SpotifyValidationResponse = { valid: true, id, type }
      res.status(200).json(response)
      return
    }

    // If API validation failed and it's a playlist, try fallback
    if (type === 'playlist') {
      console.log(
        `${nowDate.toLocaleString()}: [MuPiBox-Server] Spotify API validation failed for playlist ${id}, trying fallback...`,
      )

      try {
        const playlistData = await spotifyMediaInfo.fetchPlaylistData(id)
        if (playlistData.playlist?.name) {
          console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] Scraper validation successful for playlist ${id}`)
          const response: SpotifyValidationResponse = { valid: true, id, type }
          res.status(200).json(response)
          return
        }
      } catch (scraperError) {
        console.log(
          `${nowDate.toLocaleString()}: [MuPiBox-Server] Scraper validation also failed for playlist ${id}:`,
          scraperError instanceof Error ? scraperError.message : String(scraperError),
        )
      }
    }

    // All validation methods failed
    const response: SpotifyValidationResponse = { valid: false, id, type }
    res.status(200).json(response)
  } catch (error) {
    console.error(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error validating Spotify resource:`, error)
    res.status(500).json({
      error: 'Failed to validate resource',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.get('/api/sonos', (_req, res) => {
  if (config === undefined) {
    res.status(500).send('Could not load server config.')
    return
  }
  // Send server address and port of the node-sonos-http-api instance to the client
  res.status(200).send(config['node-sonos-http-api'])
})

app.get('/api/config', (_req, res) => {
  fs.readFile(mupiboxConfigPath, 'utf8', (err, data) => {
    if (err) {
      console.error(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error reading mupibox config: ${err.message}`)
      res.status(500).send('Error reading mupibox configuration')
      return
    }

    try {
      const mupiboxConfig = JSON.parse(data)
      res.json(mupiboxConfig)
    } catch (parseError) {
      const errorMessage = parseError instanceof Error ? parseError.message : String(parseError)
      console.error(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error parsing mupibox config: ${errorMessage}`)
      res.status(500).send('Error parsing mupibox configuration')
    }
  })
})

app.post('/api/logs', (req, res) => {
  try {
    const logRequest = req.body as LogRequest

    if (!logRequest.entries || !Array.isArray(logRequest.entries)) {
      res.status(400).json({
        success: false,
        message: 'Invalid log request format. Expected entries array.',
        entriesReceived: 0,
      } as LogResponse)
      return
    }

    // Process each log entry
    for (const entry of logRequest.entries) {
      const timestamp = entry.timestamp || new Date().toISOString()
      const source = entry.source || 'Frontend'
      const level = entry.level || 'log'

      // Format the message similar to existing server logs
      const sourceWithUrl = entry.url ? `${source}|${entry.url}` : source
      const logMessage = `${timestamp}: [MuPiBox-${sourceWithUrl}] ${entry.message}`

      // Output to appropriate console method
      switch (level) {
        case 'error':
          console.error(logMessage, ...(entry.args || []))
          break
        case 'warn':
          console.warn(logMessage, ...(entry.args || []))
          break
        case 'debug':
          console.debug(logMessage, ...(entry.args || []))
          break
        default:
          console.log(logMessage, ...(entry.args || []))
          break
      }
    }

    res.status(200).json({
      success: true,
      message: 'Logs received successfully',
      entriesReceived: logRequest.entries.length,
    } as LogResponse)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error processing logs: ${errorMessage}`)

    res.status(500).json({
      success: false,
      message: 'Error processing logs',
      entriesReceived: 0,
    } as LogResponse)
  }
})

app.post('/api/screen/off', (_req, res) => {
  exec('DISPLAY=:0 xset dpms force off', (error, _stdout, stderr) => {
    if (error) {
      console.error(`${nowDate.toLocaleString()}: [MuPiBox-Server] Error turning off screen: ${error.message}`)
      res.status(500).send('error')
      return
    }
    if (stderr) {
      console.error(`${nowDate.toLocaleString()}: [MuPiBox-Server] Stderr turning off screen: ${stderr}`)
      res.status(500).send('error')
      return
    }
    console.log(`${nowDate.toLocaleString()}: [MuPiBox-Server] Screen turned off`)
    res.status(200).send('ok')
  })
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

// Catch-all handler: send back Angular's index.html file for any non-API routes
// This must be placed after all API routes but before starting the server
if (environment.production) {
  app.get(/.*/, (_req, res) => {
    res.sendFile('index.html', { root: path.join(__dirname, 'www') })
  })
}

if (!environment.test) {
  app.listen(8200)
  console.log(`${nowDate.toLocaleString()}: [${serverName}] Server started at http://localhost:8200`)
}
