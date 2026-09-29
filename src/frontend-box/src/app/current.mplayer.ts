export interface CurrentMPlayer {
  activePlaylist?: string
  totalPlaylist?: number
  activeEpisode?: string
  activeShow?: string
  totalShows?: number
  currentPlayer?: string
  playing?: boolean
  pause?: boolean
  album?: string
  currentTrackname?: string
  currentTracknr?: number
  totalTracks?: number
  progressTime?: number
  // playing time and length of the current track in seconds (0 = unknown, e.g. a radio stream)
  positionSeconds?: number
  durationSeconds?: number
  volume?: number
  // Radio streams and podcasts are buffered before they start: how far that is (0-100).
  loading?: boolean
  // cover of a radio station / podcast episode started by the parents' app (spotify-control.js ?cover=)
  cover?: string
  loadProgress?: number
  // Phase 19 Stufe B: wer hat den letzten Command an den Player geschickt?
  // Display-Frontend ('box', Default), Eltern-WebApp ('eltern'),
  // Telegram-Bot ('telegram'). Display nutzt das um bei externer Wiedergabe
  // automatisch zur Player-View zu navigieren.
  triggerSource?: string
  triggerAt?: number
  // Set when the parents' web app asks the display to show a newly chosen theme right away.
  themeReloadAt?: number
  // Set when the app changed a setting the display reads only when its page loads: the page is loaded again.
  pageReloadAt?: number
  // What plays: the Spotify context (e.g. spotify:album:<id>:0:0), the kind of media (spotify, local, nas, radio,
  // rss) and, for mplayer, its folder or path.
  activeSpotifyId?: string
  currentType?: string
  path?: string
  // The file that plays (nas:<NAS path> / local:<library path>): its embedded picture is shown (/api/track-cover).
  trackFile?: string
}
