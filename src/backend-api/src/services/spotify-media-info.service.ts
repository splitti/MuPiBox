import fs from 'node:fs'
import path from 'node:path'
import puppeteer, { Browser, Page } from 'puppeteer'
import {
  SpotifyPlaylistData,
  SpotifyPlaylistMetadata,
  SpotifyTrack,
  PathfinderResponse,
  SpotifyArtist,
  SpotifyAlbum
} from '../models/spotify.model'

export class SpotifyMediaInfo {
  private browser: Browser | null = null
  private page: Page | null = null
  private cacheDir = path.join(process.cwd(), 'cache', 'spotify')
  private cacheExpiry = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-features=VizDisplayCompositor',
          '--disable-images',
          '--disable-javascript-harmony-shipping',
          '--disable-extensions-http-throttling'
        ]
      })
    }
    return this.browser
  }

  private async getPage(): Promise<Page> {
    if (!this.page) {
      const browser = await this.getBrowser()
      this.page = await browser.newPage()
      
      // Set user agent and viewport once
      await this.page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      )
      await this.page.setViewport({ width: 1366, height: 768 })
    }
    return this.page
  }

  private async closeBrowser(): Promise<void> {
    if (this.page) {
      await this.page.close()
      this.page = null
    }
    if (this.browser) {
      await this.browser.close()
      this.browser = null
    }
  }

  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true })
    }
  }

  private getCacheFilePath(playlistId: string): string {
    return path.join(this.cacheDir, `${playlistId}.json`)
  }

  private async getFromCache(playlistId: string): Promise<SpotifyPlaylistData | null> {
    try {
      const cacheFile = this.getCacheFilePath(playlistId)
      
      if (!fs.existsSync(cacheFile)) {
        return null
      }

      const stats = fs.statSync(cacheFile)
      const isExpired = Date.now() - stats.mtime.getTime() > this.cacheExpiry

      if (isExpired) {
        console.log(`Cache expired for playlist ${playlistId}`)
        fs.unlinkSync(cacheFile) // Clean up expired cache
        return null
      }

      const cachedData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
      console.log(`✅ Cache hit for playlist ${playlistId}`)
      return cachedData
    } catch (error) {
      console.error(`Error reading cache for ${playlistId}:`, error)
      return null
    }
  }

  private async saveToCache(playlistId: string, data: SpotifyPlaylistData): Promise<void> {
    try {
      this.ensureCacheDir()
      const cacheFile = this.getCacheFilePath(playlistId)
      
      fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2))
      console.log(`💾 Cached playlist data for ${playlistId}`)
    } catch (error) {
      console.error(`Error saving cache for ${playlistId}:`, error)
    }
  }

  public async fetchPlaylistData(playlistId: string): Promise<SpotifyPlaylistData> {
    // Check cache first
    const cachedData = await this.getFromCache(playlistId)
    if (cachedData) {
      return cachedData
    }

    console.log(`🔍 Cache miss for playlist ${playlistId}, fetching from Spotify...`)
    
    const page = await this.getPage()

    try {
      // Clear any existing listeners and state
      page.removeAllListeners('response')

      // Set up response interception for pathfinder API
      let pathfinderData: PathfinderResponse | null = null

      // Track all Spotify API calls for debugging
      page.on('response', async (response) => {
        const url = response.url()
        
        // Log all Spotify API calls
        if (url.includes('open.spotify.com') || url.includes('spotify.com/api') || url.includes('api-partner.spotify.com')) {
          console.log(`Spotify API call: ${url}`)
        }
        
        if (url.includes('api-partner.spotify.com/pathfinder') && url.includes('query')) {
          try {
            console.log(`🎯 Found pathfinder response: ${url}`)
            const responseData = await response.json()
            console.log('Response data keys:', Object.keys(responseData))
            
            if (responseData.data?.playlistV2) {
              // Only capture if we don't already have data, or if this data has more content
              const hasContent = responseData.data.playlistV2.name && responseData.data.playlistV2.name !== 'undefined'
              if (!pathfinderData || hasContent) {
                pathfinderData = responseData as PathfinderResponse
                console.log('✅ Successfully captured pathfinder data for playlist:', responseData.data.playlistV2.name)
                
                // If we have a named playlist, we can stop looking
                if (hasContent) {
                  console.log('🎯 Found complete playlist data, using this response')
                  // We can break early since we have the data we need
                }
              }
            } else if (responseData.data) {
              console.log('📊 Response data structure:', Object.keys(responseData.data))
              // Only log a sample if it's not color data
              if (!responseData.data.extractedColors) {
                console.log('Sample response:', JSON.stringify(responseData, null, 2).substring(0, 1000))
              }
            } else {
              console.log('❌ No data property in response')
            }
          } catch (error) {
            console.error('Error parsing pathfinder response:', error)
          }
        }
      })

      // Navigate to the Spotify playlist URL
      const spotifyUrl = `https://open.spotify.com/playlist/${playlistId}`
      console.log(`Navigating to: ${spotifyUrl}`)
      
      await page.goto(spotifyUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      })

      // Wait for the playlist to load and pathfinder data to be captured
      console.log('Waiting for playlist page to load...')
      
      try {
        await page.waitForSelector('[data-testid="playlist-page"]', { timeout: 10000 })
        console.log('Playlist page loaded')
      } catch (error) {
        console.log('Playlist page selector not found, trying alternative approach')
        // Wait for title instead
        await page.waitForSelector('title', { timeout: 5000 })
      }
      
      console.log('Waiting for network requests to complete...')
      // Wait for pathfinder data with shorter timeout
      await new Promise(resolve => setTimeout(resolve, 3000))
      console.log('Network wait completed')

      if (!pathfinderData) {
        throw new Error('Could not capture pathfinder data from Spotify')
      }

      // Transform the pathfinder response to our format
      const playlistData = this.transformPathfinderData(pathfinderData)
      
      // Save to cache for next time
      await this.saveToCache(playlistId, playlistData)
      
      return playlistData

    } catch (error) {
      console.error('Error fetching playlist data:', error)
      throw error
    } finally {
      // Keep page open for reuse - just clear listeners
      page.removeAllListeners('response')
    }
  }

  private transformPathfinderData(pathfinderData: PathfinderResponse): SpotifyPlaylistData {
    const playlistData = pathfinderData.data.playlistV2

    // Transform playlist metadata
    const playlist: SpotifyPlaylistMetadata = {
        name: playlistData.name || 'Unknown Playlist',
        description: playlistData.description || '',
        uri: playlistData.uri || '',
        external_urls: {
          spotify: `https://open.spotify.com/playlist/${this.extractIdFromUri(playlistData.uri)}`
        },
        images: playlistData.images?.items?.length > 0 
          ? playlistData.images.items[0].sources.map(source => ({
              url: source.url,
              width: source.width,
              height: source.height
            }))
          : [],
        owner: {
          display_name: playlistData.owner?.data?.name || 'Unknown',
          uri: playlistData.owner?.data?.uri || '',
          external_urls: {
            spotify: `https://open.spotify.com/user/${this.extractIdFromUri(playlistData.owner?.data?.uri)}`
          }
        },
        public: true,
        tracks: {
          total: playlistData.content?.totalCount || 0
        }
      }

    // Transform tracks
    const tracks: SpotifyTrack[] = (playlistData.content?.items || []).map(item => {
        const trackData = item?.itemV2?.data

        if (!trackData) {
          console.warn('Invalid track data:', item)
          return null
        }

        const artists: SpotifyArtist[] = (trackData.artists?.items || []).map(artistItem => ({
          name: artistItem?.profile?.name || 'Unknown Artist',
          uri: artistItem?.uri || '',
          external_urls: {
            spotify: `https://open.spotify.com/artist/${this.extractIdFromUri(artistItem?.uri)}`
          }
        }))

        const album: SpotifyAlbum = {
          name: trackData.albumOfTrack?.name || 'Unknown Album',
          uri: trackData.albumOfTrack?.uri || '',
          external_urls: {
            spotify: `https://open.spotify.com/album/${this.extractIdFromUri(trackData.albumOfTrack?.uri)}`
          },
          images: (trackData.albumOfTrack?.coverArt?.sources || []).map(source => ({
            url: source.url,
            width: source.width,
            height: source.height
          }))
        }

        return {
          name: trackData.name || 'Unknown Track',
          uri: trackData.uri || '',
          duration_ms: trackData.duration?.totalMilliseconds || 0,
          artists,
          album,
          external_urls: {
            spotify: `https://open.spotify.com/track/${this.extractIdFromUri(trackData.uri)}`
          }
        }
      }).filter(track => track !== null) as SpotifyTrack[]

    return {
      playlist,
      tracks
    }
  }

  private extractIdFromUri(uri: string | undefined): string {
    if (!uri || typeof uri !== 'string') {
      console.warn('Invalid URI provided to extractIdFromUri:', uri)
      return ''
    }
    return uri.split(':').pop() || ''
  }

  public async dispose(): Promise<void> {
    await this.closeBrowser()
  }
}
