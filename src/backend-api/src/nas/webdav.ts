// The WebDAV provider: a NAS reached over HTTP(S) WebDAV (Synology, QNAP, TrueNAS, Nextcloud ...). Everything that is
// WebDAV - URLs, Basic login, PROPFIND and its XML, the confirmed certificate of an https NAS - lives here.

import https from 'node:https'
import net from 'node:net'
import { Readable } from 'node:stream'
import tls from 'node:tls'
import {
  NasApiError,
  type NasFileEntry,
  nasIsSystemEntry,
  type NasProvider,
  type NasReadOptions,
  NasSessionExpiredError,
  type NasWriteResult,
} from './provider'

export interface NasCertificateInfo {
  fingerprint: string
  subject: string
  issuer: string
  validTo: string
}

// The certificate of an https NAS is not trusted (self-signed, as Synology's own), or not the one confirmed.
export class NasCertificateError extends Error {
  constructor(readonly certificate: NasCertificateInfo | undefined) {
    super('NAS certificate not trusted')
  }
}

// What the NAS presents on https, without trusting it: shown in the app to be confirmed.
export function nasPeekCertificate(base: string, timeoutMs = 8000): Promise<NasCertificateInfo | undefined> {
  const url = new URL(base)
  if (url.protocol !== 'https:') return Promise.resolve(undefined)
  return new Promise((resolve) => {
    const socket = tls.connect({
      host: url.hostname,
      port: Number(url.port || 443),
      servername: net.isIP(url.hostname) ? undefined : url.hostname,
      rejectUnauthorized: false,
      timeout: timeoutMs,
    })
    const done = (info: NasCertificateInfo | undefined) => {
      socket.destroy()
      resolve(info)
    }
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate()
      done(
        cert?.fingerprint256
          ? {
              fingerprint: cert.fingerprint256,
              subject: String(cert.subject?.CN ?? cert.subject?.O ?? ''),
              issuer: String(cert.issuer?.CN ?? cert.issuer?.O ?? ''),
              validTo: String(cert.valid_to ?? ''),
            }
          : undefined,
      )
    })
    socket.once('timeout', () => done(undefined))
    socket.once('error', () => done(undefined))
  })
}

// Every request to the NAS goes through here. With a confirmed certificate (https with Synology's own, self-signed
// one - fetch() refuses it) the TLS connection is made first, its certificate compared with the confirmed
// fingerprint, and only then is the request - with the login - sent over it. Anything else goes through fetch().
async function nasFetch(
  fingerprint: string | undefined,
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string | Buffer; signal?: AbortSignal } = {},
): Promise<Response> {
  const target = new URL(url)
  if (!fingerprint || target.protocol !== 'https:') {
    return await fetch(url, { ...init, body: init.body as RequestInit['body'] })
  }
  const socket = await new Promise<tls.TLSSocket>((resolve, reject) => {
    const s = tls.connect({
      host: target.hostname,
      port: Number(target.port || 443),
      servername: net.isIP(target.hostname) ? undefined : target.hostname,
      rejectUnauthorized: false, // checked by the fingerprint below
    })
    const onAbort = () => {
      s.destroy()
      reject(init.signal?.reason ?? new Error('aborted'))
    }
    if (init.signal?.aborted) return onAbort()
    init.signal?.addEventListener('abort', onAbort, { once: true })
    s.once('secureConnect', () => {
      init.signal?.removeEventListener('abort', onAbort)
      const cert = s.getPeerCertificate()
      if (!cert?.fingerprint256 || cert.fingerprint256.toUpperCase() !== fingerprint.toUpperCase()) {
        s.destroy()
        reject(
          new NasCertificateError(
            cert?.fingerprint256
              ? {
                  fingerprint: cert.fingerprint256,
                  subject: String(cert.subject?.CN ?? ''),
                  issuer: String(cert.issuer?.CN ?? ''),
                  validTo: String(cert.valid_to ?? ''),
                }
              : undefined,
          ),
        )
        return
      }
      resolve(s)
    })
    s.once('error', (error) => {
      init.signal?.removeEventListener('abort', onAbort)
      reject(error)
    })
  })
  return await new Promise<Response>((resolve, reject) => {
    const req = https.request(
      {
        method: init.method ?? 'GET',
        hostname: target.hostname,
        port: Number(target.port || 443),
        path: `${target.pathname}${target.search}`,
        headers: init.headers,
        createConnection: () => socket,
        signal: init.signal,
      },
      (res) => {
        const headers = new Headers()
        for (const [name, value] of Object.entries(res.headers)) {
          if (Array.isArray(value)) value.forEach((v) => headers.append(name, v))
          else if (value !== undefined) headers.set(name, String(value))
        }
        const status = res.statusCode ?? 502
        // (no body allowed with 204, 205 and 304, and a status outside 200-599 is refused: the Response constructor
        // threw here, in a callback nothing caught - the whole server ended. As fetchPinned: a failed fetch instead.)
        const noBody = status === 204 || status === 205 || status === 304 || init.method === 'HEAD'
        try {
          if (status < 200 || status > 599) throw new Error(`unexpected status ${status}`)
          if (noBody) res.resume()
          resolve(
            new Response(noBody ? null : (Readable.toWeb(res) as unknown as ReadableStream), {
              status,
              statusText: res.statusMessage,
              headers,
            }),
          )
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
    if (init.body !== undefined) req.write(init.body)
    req.end()
  })
}

// Resolves the address field into a WebDAV base URL. Accepts "host", "host:port", "host:port/path" or a complete
// http(s):// URL. The HTTPS checkbox picks the scheme when the address itself has none.
export function nasResolveBase(address: string, useHttps: boolean): string {
  const trimmed = address.trim().replace(/\/+$/, '')
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }
  return `${useHttps ? 'https' : 'http'}://${trimmed}`
}

const xmlEntities: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" }

function decodeXml(text: string): string {
  return text.replace(/&(lt|gt|amp|quot|apos);/g, (m) => xmlEntities[m] ?? m)
}

// Parses a WebDAV PROPFIND (Depth: 1) answer into the children of `folderPath`.
export function parsePropfind(xml: string, base: string, folderPath: string): NasFileEntry[] {
  const basePrefix = decodeURIComponent(new URL(base).pathname).replace(/\/+$/, '')
  const folder = `/${folderPath.split('/').filter(Boolean).join('/')}`
  const entries: NasFileEntry[] = []
  const responses = xml.match(/<(?:\w+:)?response[\s>][\s\S]*?<\/(?:\w+:)?response>/gi) ?? []
  for (const block of responses) {
    const hrefMatch = block.match(/<(?:\w+:)?href[^>]*>([\s\S]*?)<\/(?:\w+:)?href>/i)
    if (!hrefMatch) {
      continue
    }
    let hrefPath = decodeXml(hrefMatch[1].trim())
    if (/^https?:\/\//i.test(hrefPath)) {
      hrefPath = new URL(hrefPath).pathname
    }
    try {
      hrefPath = decodeURIComponent(hrefPath)
    } catch {
      // keep as is
    }
    if (basePrefix && hrefPath.startsWith(basePrefix)) {
      hrefPath = hrefPath.slice(basePrefix.length)
    }
    hrefPath = `/${hrefPath.split('/').filter(Boolean).join('/')}`
    if (hrefPath === folder) {
      continue // the folder itself
    }
    const name = hrefPath.split('/').pop() ?? hrefPath
    if (nasIsSystemEntry(name)) {
      continue
    }
    const isdir = /<(?:\w+:)?collection\s*\/?>/i.test(block)
    const sizeMatch = block.match(/<(?:\w+:)?getcontentlength[^>]*>(\d+)</i)
    const versionMatch =
      block.match(/<(?:\w+:)?getetag[^>]*>([^<]+)</i) ?? block.match(/<(?:\w+:)?getlastmodified[^>]*>([^<]+)</i)
    entries.push({
      name,
      path: hrefPath,
      isdir,
      additional: sizeMatch ? { size: Number(sizeMatch[1]) } : undefined,
      version: versionMatch ? decodeXml(versionMatch[1].trim()) : undefined,
    })
  }
  return entries
}

const PROPFIND_BODY =
  '<?xml version="1.0"?><propfind xmlns="DAV:"><prop><resourcetype/><getcontentlength/><getetag/><getlastmodified/></prop></propfind>'

// a write the NAS refused for the account (or the method, as some refuse MOVE for it)
const deniedStatus = (status: number) => status === 401 || status === 403 || status === 405

export class WebDavProvider implements NasProvider {
  readonly kind = 'webdav' as const
  private readonly auth: string

  /**
   * base: the WebDAV URL without trailing slash (may hold a path prefix); fingerprint: the SHA-256 fingerprint of the
   * NAS's own certificate the parents confirmed - https then trusts exactly this certificate.
   */
  constructor(
    readonly base: string,
    account: string,
    password: string,
    readonly fingerprint?: string,
  ) {
    this.auth = `Basic ${Buffer.from(`${account}:${password}`, 'utf8').toString('base64')}`
  }

  url(nasPath: string): string {
    const encoded = nasPath
      .split('/')
      .filter(Boolean)
      .map((part) => encodeURIComponent(part))
      .join('/')
    return `${this.base}/${encoded}`
  }

  private request(url: string, init: { method?: string; headers?: Record<string, string>; body?: string | Buffer; signal?: AbortSignal }) {
    return nasFetch(this.fingerprint, url, { ...init, headers: { Authorization: this.auth, ...init.headers } })
  }

  /** The top level as the login sees it (status and the PROPFIND answer). */
  async top(signal: AbortSignal): Promise<{ status: number; body: string }> {
    const response = await this.request(this.url('/'), { method: 'PROPFIND', headers: { Depth: '1' }, signal })
    return { status: response.status, body: await response.text().catch(() => '') }
  }

  async list(folder: string, signal?: AbortSignal): Promise<NasFileEntry[]> {
    const response = await this.request(`${this.url(folder)}/`, {
      method: 'PROPFIND',
      headers: { Depth: '1', 'Content-Type': 'application/xml' },
      body: PROPFIND_BODY,
      // 20 s: a NAS waking its disks answers after 10-20 s (8 s marked it offline for 30 s)
      signal: signal ?? AbortSignal.timeout(20000),
    })
    const text = await response.text()
    if (response.status === 401) {
      throw new NasSessionExpiredError('WebDAV 401')
    }
    if (response.status !== 207 && response.status !== 200) {
      // Folder gone / no permission: the NAS answered, so it is not offline.
      throw new NasApiError(`WebDAV error ${response.status}`)
    }
    return parsePropfind(text, this.base, folder)
  }

  async folderExists(folder: string, signal?: AbortSignal): Promise<boolean> {
    const response = await this.request(`${this.url(folder)}/`, {
      method: 'PROPFIND',
      headers: { Depth: '0' },
      signal: signal ?? AbortSignal.timeout(8000),
    })
    await response.text().catch(() => '')
    // A folder that is gone is a 404; a share (top level) that does not exist is answered with 405 by Synology.
    const topLevel = folder.split('/').filter(Boolean).length <= 1
    if (response.status === 404 || response.status === 410 || (response.status === 405 && topLevel)) {
      return false
    }
    if (response.status === 207 || response.status === 200) {
      return true
    }
    throw new NasApiError(`WebDAV error ${response.status}`)
  }

  read(file: string, options: NasReadOptions = {}): Promise<Response> {
    return this.request(this.url(file), { headers: options.range ? { Range: options.range } : {}, signal: options.signal })
  }

  private async status(url: string, method: string, headers: Record<string, string>, signal: AbortSignal | undefined, body?: Buffer) {
    const response = await this.request(url, { method, headers, body, signal: signal ?? AbortSignal.timeout(20000) })
    await response.arrayBuffer().catch(() => undefined)
    return response.status
  }

  private result(status: number): NasWriteResult {
    if (status >= 200 && status < 300) return 'ok'
    if (status === 412) return 'exists'
    return deniedStatus(status) ? 'denied' : 'failed'
  }

  async write(file: string, data: Buffer, options: { contentType: string; overwrite: boolean; signal?: AbortSignal }): Promise<NasWriteResult> {
    return this.result(
      await this.status(this.url(file), 'PUT', { 'Content-Type': options.contentType, Overwrite: options.overwrite ? 'T' : 'F' }, options.signal, data),
    )
  }

  async move(from: string, to: string, options: { overwrite: boolean; signal?: AbortSignal }): Promise<NasWriteResult> {
    return this.result(await this.status(this.url(from), 'MOVE', { Destination: this.url(to), Overwrite: options.overwrite ? 'T' : 'F' }, options.signal))
  }

  async remove(file: string, signal?: AbortSignal): Promise<NasWriteResult> {
    return this.result(await this.status(this.url(file), 'DELETE', {}, signal))
  }
}

export interface WebDavLoginResult {
  success: boolean
  provider?: WebDavProvider
  error?: string
  certificate?: NasCertificateInfo
  /** the NAS did not answer at all (switched off, wrong address, network) - not a refused login */
  unreachable?: boolean
  /** the NAS refused the account or password */
  refused?: boolean
}

// Signs in to a WebDAV NAS: a PROPFIND on its top level must answer and list at least one folder.
export async function webdavLogin(base: string, account: string, password: string, timeoutMs = 10000, fingerprint?: string): Promise<WebDavLoginResult> {
  const provider = new WebDavProvider(base, account, password, fingerprint || undefined)
  try {
    const response = await provider.top(AbortSignal.timeout(timeoutMs))
    const body = response.body
    if (response.status === 401 || response.status === 403) {
      return { success: false, refused: true, error: 'Wrong account name or password (or no WebDAV permission for this account).' }
    }
    if (response.status === 207 || response.status === 200) {
      // A NAS always shows at least one folder. An empty answer means this is not the WebDAV service (e.g. the DSM web
      // page on port 443 answers, but lists nothing), or the account may not use WebDAV.
      if (parsePropfind(body, base, '/').length === 0) {
        return {
          success: false,
          error: 'The NAS answered but lists no folders - check the WebDAV port in the address (Synology: 5006 for https, 5005 for http) and that the account may use WebDAV.',
        }
      }
      return { success: true, provider }
    }
    if (response.status === 404) {
      return { success: false, error: 'WebDAV service not found at this address/port - check the address and that WebDAV is enabled on the NAS.' }
    }
    return { success: false, error: `The NAS answered with HTTP ${response.status}. Is this the WebDAV address/port?` }
  } catch (error) {
    if (error instanceof NasCertificateError) {
      // A confirmed certificate, but the NAS now shows another one (renewed on the NAS - or not the NAS).
      return {
        success: false,
        error: 'The certificate of the NAS is not the one confirmed before. If it was renewed on the NAS, compare the new fingerprint below and confirm it.',
        certificate: error.certificate,
      }
    }
    const cause = error instanceof Error ? `${error.message} ${String((error as { cause?: unknown }).cause ?? '')}` : ''
    if (/certificate|SELF_SIGNED|UNABLE_TO_VERIFY|CERT_/i.test(cause)) {
      // Synology's own certificate is self-signed: show it, so it can be confirmed once (then trusted by its
      // fingerprint, see nasFetch).
      return {
        success: false,
        error:
          "The NAS uses a certificate that is not signed by a known authority (e.g. Synology's own). Check its fingerprint below and confirm it - or use HTTP.",
        certificate: await nasPeekCertificate(base),
      }
    }
    return { success: false, unreachable: true, error: 'Could not reach the NAS. Check the address (with WebDAV port) and network connection.' }
  }
}
