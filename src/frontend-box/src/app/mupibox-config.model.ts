export interface MupiboxConfig {
  mupibox: {
    host: string
    port: number
    ttsLanguage: string
    theme: string
    listviewTimer?: number
    settingsAccessTimer?: number
    // Display categories hidden in the kiosk (Admin > Control system > Hide display categorys)
    hiddenCategories?: string[]
    // Add other mupibox properties if needed
  }
  timeout: {
    idlePiShutdown: string
    idleDisplayOff: string
    pressDelay: string
  }
  // Add other top-level config properties if needed
}
