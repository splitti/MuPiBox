export interface ServerConfig {
  'node-sonos-http-api': {
    server: string
    ip: string
    port: string
    rooms: string[]
    tts?: {
      enabled?: boolean
      language?: string
      volume?: string
    }
    hat_active: boolean
  }
  spotify?: {
    clientId: string
    clientSecret: string
  }
}

export type ServerHttpApiConfig = ServerConfig['node-sonos-http-api']
