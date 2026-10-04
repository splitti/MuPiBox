export interface MupiboxConfig {
  mupibox: {
    host: string
    port: number
    ttsLanguage: string
    theme: string
    listviewTimer?: number
    // "Zurück im Player" (design round 2): the back button minimises (default) or stops
    playerBack?: 'minimize' | 'stop'
    settingsAccessTimer?: number
    // Display categories hidden in the kiosk (Admin > Control system > Hide display categorys)
    hiddenCategories?: string[]
    // Hides the horizontal scrollbar of the cover lists (Admin > Mupi-conf > Theme)
    hideScrollbar?: boolean
    // Coverflow theme only: shows the album/folder name under each cover (Admin > Mupi-conf > Theme)
    coverflowShowNames?: boolean
    // Add other mupibox properties if needed
  }
  timeout: {
    idlePiShutdown: string
    idleDisplayOff: string
    pressDelay: string
  }
  // Add other top-level config properties if needed
}
