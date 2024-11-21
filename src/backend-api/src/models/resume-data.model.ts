import { Data, SpotifyData } from './data.model'

import { CategoryType } from './folder.model'

export interface ResumeSpotifyData extends SpotifyData {
  resumespotifytrack_number?: number
  resumespotifyprogress_ms?: number
  resumespotifyduration_ms?: number
  resumelocalalbum?: CategoryType
  resumelocalcurrentTracknr?: number
  resumelocalprogressTime?: number
  resumerssprogressTime?: number
}

export interface ResumeSpotifyData extends SpotifyData {
  resumespotifytrack_number?: number
  resumespotifyprogress_ms?: number
  resumespotifyduration_ms?: number
  resumelocalalbum?: CategoryType
  resumelocalcurrentTracknr?: number
  resumelocalprogressTime?: number
  resumerssprogressTime?: number
}
