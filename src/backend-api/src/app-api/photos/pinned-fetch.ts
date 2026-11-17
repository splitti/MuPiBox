// A request to a photo service in the home network over https with its own, self-signed certificate (Synology's DSM, a
// Nextcloud): trusted by the fingerprint the parents confirmed in the app - the connection is made, its certificate
// compared, and only then is anything (a login, a password) sent over it. Without a fingerprint: fetch(), which trusts what
// the system's authorities vouch for; a certificate it refuses is shown to be confirmed (CertificateError).

import https from 'node:https'
import net from 'node:net'
import { Readable } from 'node:stream'
import tls from 'node:tls'
import { RemoteAway } from './remote'

export interface CertificateInfo {
  fingerprint: string
  subject: string
  issuer: string
  validTo: string
}

/** The certificate is not trusted: self-signed and not confirmed yet, or not the one confirmed (renewed meanwhile) */
export class CertificateError extends RemoteAway {
  constructor(
    readonly certificate: CertificateInfo | undefined,
    label = 'the service',
  ) {
    super(`${label}: certificate not trusted`)
  }
}

const info = (cert: tls.PeerCertificate | undefined): CertificateInfo | undefined =>
  cert?.fingerprint256
    ? { fingerprint: cert.fingerprint256, subject: String(cert.subject?.CN ?? cert.subject?.O ?? ''), issuer: String(cert.issuer?.CN ?? cert.issuer?.O ?? ''), validTo: String(cert.valid_to ?? '') }
    : undefined

/** What a server presents on https without trusting it - and whether the system's authorities vouch for it (no confirming then) */
export function peekCertificate(url: string, timeoutMs = 8000): Promise<{ certificate?: CertificateInfo; trusted: boolean } | undefined> {
  const u = new URL(url)
  if (u.protocol !== 'https:') return Promise.resolve(undefined)
  return new Promise((resolve) => {
    const host = u.hostname.replace(/^\[|\]$/g, '')
    const socket = tls.connect({ host, port: Number(u.port || 443), servername: net.isIP(host) ? undefined : host, rejectUnauthorized: false, timeout: timeoutMs })
    const done = (v: { certificate?: CertificateInfo; trusted: boolean } | undefined) => {
      socket.destroy()
      resolve(v)
    }
    socket.once('secureConnect', () => done({ certificate: info(socket.getPeerCertificate()), trusted: socket.authorized }))
    socket.once('timeout', () => done(undefined))
    socket.once('error', () => done(undefined))
  })
}

export interface ServiceRequest {
  method: string
  headers: Record<string, string>
  body?: string
  signal: AbortSignal
}

// a request over a connection whose certificate is the confirmed one (fetch() refuses a self-signed one)
function pinned(url: URL, fingerprint: string, init: ServiceRequest, label: string): Promise<Response> {
  const host = url.hostname.replace(/^\[|\]$/g, '')
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    const s = tls.connect({ host, port: Number(url.port || 443), servername: net.isIP(host) ? undefined : host, rejectUnauthorized: false })
    const onAbort = () => {
      s.destroy()
      reject(init.signal.reason ?? new Error('aborted'))
    }
    if (init.signal.aborted) return onAbort()
    init.signal.addEventListener('abort', onAbort, { once: true })
    s.once('secureConnect', () => {
      init.signal.removeEventListener('abort', onAbort)
      const cert = s.getPeerCertificate()
      if (!cert?.fingerprint256 || cert.fingerprint256.toUpperCase() !== fingerprint.toUpperCase()) {
        s.destroy()
        reject(new CertificateError(info(cert), label))
        return
      }
      resolve(s)
    })
    s.once('error', (error) => {
      init.signal.removeEventListener('abort', onAbort)
      reject(error)
    })
  }).then(
    (socket) =>
      new Promise<Response>((resolve, reject) => {
        const req = https.request(
          { method: init.method, hostname: host, port: Number(url.port || 443), path: `${url.pathname}${url.search}`, headers: init.headers, createConnection: () => socket, signal: init.signal },
          (res) => {
            const headers = new Headers()
            for (const [name, value] of Object.entries(res.headers)) {
              if (Array.isArray(value)) for (const v of value) headers.append(name, v)
              else if (value !== undefined) headers.set(name, String(value))
            }
            const status = res.statusCode ?? 502
            // (no body with 204/205/304 or for HEAD; a status outside 200-599 is refused by Response - a failed request instead)
            const noBody = status === 204 || status === 205 || status === 304 || init.method === 'HEAD'
            try {
              if (status < 200 || status > 599) throw new Error(`unexpected status ${status}`)
              if (noBody) res.resume()
              // (counted in bytes, at most 64 KB ahead: a stream read slowly - an audiobook paused in mpv - must not pile
              // up in memory while the server goes on sending)
              const body = noBody ? null : (Readable.toWeb(res, { strategy: new ByteLengthQueuingStrategy({ highWaterMark: 64 * 1024 }) }) as unknown as ReadableStream)
              resolve(new Response(body, { status, statusText: res.statusMessage, headers }))
            } catch (err) {
              res.destroy()
              reject(err)
            }
          },
        )
        req.once('error', (error) => {
          socket.destroy()
          reject(error)
        })
        req.end(init.body)
      }),
  )
}

/**
 * A request to the service: over the confirmed certificate when there is one (https), else fetch(). stop: the caller's own
 * abort - passed on as it is; anything else that fails is the service away (RemoteAway), a certificate the system does not
 * trust one to be confirmed (CertificateError). No redirects: the address stays the one given (and the login with it).
 */
export async function serviceFetch(url: URL, fingerprint: string | undefined, init: ServiceRequest, label: string, stop?: AbortSignal): Promise<Response> {
  try {
    return url.protocol === 'https:' && fingerprint ? await pinned(url, fingerprint, init, label) : await fetch(url, { ...init, redirect: 'manual' })
  } catch (err) {
    if (stop?.aborted) throw err
    if (err instanceof CertificateError) throw err
    // (https without a confirmed fingerprint, and the system does not trust the certificate: to be confirmed)
    const code = String((err as { cause?: { code?: unknown } })?.cause?.code ?? '')
    if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_TLS/i.test(code)) throw new CertificateError((await peekCertificate(url.toString()))?.certificate, label)
    throw new RemoteAway(`${label}: ${(err as Error).message}`)
  }
}
