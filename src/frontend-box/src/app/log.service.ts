import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { of } from 'rxjs'
import { catchError } from 'rxjs/operators'
import { environment } from 'src/environments/environment'

interface LogEntry {
  timestamp: string
  level: 'debug' | 'log' | 'warn' | 'error'
  source: string
  message: string
  args?: any[]
  userAgent?: string
  url?: string
}

interface LogRequest {
  entries: LogEntry[]
}

interface LogResponse {
  success: boolean
  message?: string
  entriesReceived: number
}

@Injectable({
  providedIn: 'root',
})
export class LogService {
  private enableHttpLogging = true
  private logBuffer: LogEntry[] = []
  private bufferSize = 10 // Send logs in batches of 10
  private bufferTimeout = 5000 // Send logs every 5 seconds
  private bufferTimer: any = null

  constructor(private http: HttpClient) {}

  log(message: any, ...args: any[]): void {
    console.log(message, ...args)

    // Optionally send to backend
    if (this.enableHttpLogging) {
      this.bufferLogEntry('log', message, args)
    }
  }

  warn(message: any, ...args: any[]): void {
    console.warn(message, ...args)

    // Optionally send to backend
    if (this.enableHttpLogging) {
      this.bufferLogEntry('warn', message, args)
    }
  }

  error(message: any, ...args: any[]): void {
    console.error(message, ...args)

    // Optionally send to backend
    if (this.enableHttpLogging) {
      this.bufferLogEntry('error', message, args)
    }
  }

  debug(message: any, ...args: any[]): void {
    console.debug(message, ...args)

    // Optionally send to backend
    if (this.enableHttpLogging) {
      this.bufferLogEntry('debug', message, args)
    }
  }

  configure(options: { enableHttpLogging?: boolean; bufferSize?: number; bufferTimeout?: number }): void {
    if (options.enableHttpLogging !== undefined) this.enableHttpLogging = options.enableHttpLogging
    if (options.bufferSize !== undefined) this.bufferSize = options.bufferSize
    if (options.bufferTimeout !== undefined) {
      this.bufferTimeout = options.bufferTimeout
      this.resetBufferTimer()
    }
  }

  private bufferLogEntry(level: 'debug' | 'log' | 'warn' | 'error', message: any, args: any[]): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      source: 'Frontend',
      message: typeof message === 'string' ? message : JSON.stringify(message),
      args: args.length > 0 ? args : undefined,
      userAgent: navigator.userAgent,
      url: window.location.href,
    }

    this.logBuffer.push(logEntry)

    if (this.logBuffer.length >= this.bufferSize) {
      this.sendBufferedLogs()
    } else {
      this.resetBufferTimer()
    }
  }

  private sendBufferedLogs(): void {
    if (this.logBuffer.length === 0) return

    const logsToSend = [...this.logBuffer]
    this.logBuffer = []

    if (this.bufferTimer) {
      clearTimeout(this.bufferTimer)
      this.bufferTimer = null
    }

    const logRequest: LogRequest = { entries: logsToSend }

    this.http
      .post<LogResponse>(`${environment.backend.apiUrl}/logs`, logRequest)
      .pipe(
        catchError((_error) => {
          return of({ success: false, message: 'HTTP error', entriesReceived: 0 })
        }),
      )
      .subscribe({
        next: (response) => {
          if (!response.success) {
            console.warn('Backend log processing failed:', response.message)
          }
        },
        error: (error) => {
          console.warn('Error in log HTTP request:', error)
        },
      })
  }

  private resetBufferTimer(): void {
    if (this.bufferTimer) {
      clearTimeout(this.bufferTimer)
    }

    this.bufferTimer = setTimeout(() => {
      this.sendBufferedLogs()
    }, this.bufferTimeout)
  }

  flushLogs(): void {
    if (this.enableHttpLogging && this.logBuffer.length > 0) {
      this.sendBufferedLogs()
    }
  }

  cleanup(): void {
    if (this.bufferTimer) {
      clearTimeout(this.bufferTimer)
      this.bufferTimer = null
    }

    this.flushLogs()
  }
}
