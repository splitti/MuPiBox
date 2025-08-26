export interface LogEntry {
  timestamp: string
  level: 'debug' | 'log' | 'warn' | 'error'
  source: string
  message: string
  args?: any[]
  userAgent?: string
  url?: string
}

export interface LogRequest {
  entries: LogEntry[]
}

export interface LogResponse {
  success: boolean
  message?: string
  entriesReceived: number
}
