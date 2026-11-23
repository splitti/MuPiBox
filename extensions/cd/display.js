// The CD drive, display part: a "CD" tab after the categories while an audio CD is in the drive (a tap plays the disc from its
// first track in the player page), and the eject button of the Winamp window opens the drive's tray.

export function activate(api) {
  const FOLDER = '_audio_cd_'
  let state = { present: false, tracks: 0, id: 0 }

  // The disc as a local album (the player plays the folder `_audio_cd_` from its provider). Its place is never kept for "Fortsetzen".
  const cdMedia = () => ({
    type: 'library',
    category: 'audiobook',
    artist: state.artist || 'CD',
    title: state.album || 'Audio-CD',
    id: FOLDER,
    libraryPath: FOLDER,
    // (the disc's own picture when one was found; the disc's id in the address, so another disc is another picture)
    cover: state.cover ? `${api.apiUrl}/ext/cd/cover?v=${state.id}` : api.url('cover.svg'),
    noResume: true,
  })

  api.player.noResumeFolder(FOLDER)
  api.tabs.set({ id: 'cd', src: api.url('icon.svg'), visible: false, onSelect: () => api.player.open(cdMedia()) })

  api.every(3000, async () => {
    const next = await api.fetch('/ext/cd/state')
    // (a player that does not answer for a moment: no change)
    if (!next) return
    const changed = ['present', 'tracks', 'id', 'album', 'cover', 'drive'].some((key) => next[key] !== state[key])
    if (!changed) return
    state = next
    api.tabs.set({ id: 'cd', src: api.url('icon.svg'), visible: !!state.present, onSelect: () => api.player.open(cdMedia()) })
  })

  // The eject button: with a drive on the box the tray opens (and closes again, as on a real player); the player stops what plays
  // from the disc first. Without a drive the button opens the library as before.
  api.winamp.onEject(() => {
    if (!state.drive) return false
    void api.fetch('/ext/cd/eject')
    return true
  })
}
