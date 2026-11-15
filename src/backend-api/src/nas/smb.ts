// The SMB provider: a Windows share (\\nas\Musik) as the box's NAS - what Synology, QNAP, a FRITZ!Box with a USB disk
// or a Windows PC offer without setting anything up.
//
// The Linux kernel mounts the share (cifs, scripts/mupibox/nas_smb.sh as root, under /run/mupibox/nas); a helper
// process of its own reads it and serves it on 127.0.0.1 (smb-helper.ts) - never the server itself: a NAS that hangs
// blocks every file access of the process reading the mount for up to a minute. When the helper stops answering, a
// probe decides: the NAS counts as away, and the helper is asked again every 30 s (see SmbConnection).
//
// NAS paths start with the share, as a Synology shows its shares over WebDAV: "/Musik/Hörspiele/..." - folders chosen
// over WebDAV stay valid when the box changes to SMB on the same share.

import { type ChildProcess, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { access, readFile } from 'node:fs/promises'
import {
  NasApiError,
  type NasFileEntry,
  nasIsSystemEntry,
  type NasListOptions,
  type NasProvider,
  type NasReadOptions,
  type NasWriteResult,
} from './provider'
import type { SmbHelperEntry } from './smb-helper'

export const SMB_MOUNT_POINT = '/run/mupibox/nas'
const SMB_SCRIPT = '/usr/local/bin/mupibox/nas_smb.sh'

export interface SmbTarget {
  host: string
  share: string
  /** a folder below the share given with it (\\nas\Musik\Hörspiele: "Hörspiele"), "" for none */
  folder: string
}

const HOST = /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,62})(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}))*\.?$/
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/
// what Windows does not allow in a share name (and "/" "\" separate the parts anyway)
const SHARE = /^[^\\/:*?"<>|\u0000-\u001f]{1,80}$/u

/**
 * A share as people type it: \\nas\Musik, \\192.168.1.20\Musik\Hörspiele, //nas/Musik, smb://nas/Musik (also with a
 * login "smb://user@nas/..." - the login is not taken from it). undefined: not a share address.
 */
export function parseSmbAddress(input: unknown): SmbTarget | undefined {
  if (typeof input !== 'string') return undefined
  let text = input.trim().replace(/\\/g, '/')
  text = text.replace(/^(?:smb|cifs):\/*/i, '')
  const parts = text.split('/').filter(Boolean)
  if (parts.length < 2) return undefined
  const host = parts[0].replace(/^.*@/, '').toLowerCase()
  const [, share, ...rest] = parts
  if (!(IPV4.test(host) ? host.split('.').every((n) => Number(n) <= 255) : HOST.test(host))) return undefined
  if (!SHARE.test(share) || share === '.' || share === '..' || share.trim() !== share) return undefined
  if (rest.some((part) => part === '.' || part === '..' || part.includes('\0'))) return undefined
  return { host: host.replace(/\.$/, ''), share, folder: rest.join('/') }
}

/** \\host\share as Windows writes it (shown in the app). */
export function smbDisplayAddress(host: string, share: string): string {
  return `\\\\${host}\\${share}`
}

/** Why a share could not be mounted (nas_smb.sh prints "error=<reason>"). */
export type SmbError = 'unreachable' | 'resolve' | 'auth' | 'notfound' | 'smb1' | 'install' | 'installing' | 'other'

export function smbErrorOf(output: string): SmbError {
  const m = /error=(\w+)/.exec(output)
  const reason = m?.[1] ?? ''
  return (['unreachable', 'resolve', 'auth', 'notfound', 'smb1', 'install'] as const).find((r) => r === reason) ?? 'other'
}

/** The server's words for it (English, as the other NAS errors; the app shows its own by `reason`). */
export function smbErrorText(error: SmbError): string {
  switch (error) {
    case 'unreachable':
      return 'Could not reach the NAS. Check the address and that SMB (Windows file sharing) is switched on.'
    case 'resolve':
      return 'The name of the NAS is not known in the network. Use its IP address (or name.local).'
    case 'auth':
      return 'Wrong account name or password (or no permission for this share).'
    case 'notfound':
      return 'There is no share of this name on the NAS.'
    case 'smb1':
      return 'The NAS only speaks SMB1, which the box does not use. Switch on SMB2 or SMB3 on the NAS.'
    case 'install':
      return 'The SMB support (cifs-utils) could not be installed. Is the box online?'
    case 'installing':
      return 'The SMB support (cifs-utils) is being installed.'
    default:
      return 'The share could not be mounted.'
  }
}

export interface SmbLogin {
  host: string
  share: string
  account: string
  password: string
  domain?: string
}

export interface SmbHelperHandle {
  port: number
  kill(): void
  /** called once when the helper ends by itself */
  onExit(callback: () => void): void
}

/** What the box does as root and in other processes - replaced in the tests. */
export interface SmbSystem {
  /** nas_smb.sh as root: its exit code and output */
  script(args: string[], input?: string, timeoutMs?: number): Promise<{ code: number; out: string }>
  /** whether mount.cifs is there (else: install first) */
  hasCifs(): Promise<boolean>
  /** what is mounted at the mount point ("//host/share"), undefined: nothing - read from /proc/mounts, never the mount */
  mountedSource(): Promise<string | undefined>
  startHelper(root: string, token: string): Promise<SmbHelperHandle>
  /** (tests: shorter waits) */
  probeMs?: number
  retryMs?: number
}

// /proc/mounts writes a space in a name as \040
function unescapeMount(text: string): string {
  return text.replace(/\\([0-7]{3})/g, (_, octal: string) => String.fromCharCode(Number.parseInt(octal, 8)))
}

/** The box's own: sudo nas_smb.sh, and the helper as `node nas-smb-helper.js` next to server.js. */
export function smbSystem(helperFile: string): SmbSystem {
  return {
    script(args, input, timeoutMs = 60_000) {
      return new Promise((resolve) => {
        const child = spawn('sudo', ['bash', SMB_SCRIPT, ...args], { stdio: ['pipe', 'pipe', 'pipe'] })
        let out = ''
        // (SIGTERM: sudo passes it on to the script - a SIGKILL ended only sudo, and the script went on as root,
        // holding its lock and mounting after the server had given up)
        const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs)
        child.stdout.on('data', (d) => (out += d))
        child.stderr.on('data', (d) => (out += d))
        child.on('error', () => undefined)
        child.on('close', (code) => {
          clearTimeout(timer)
          resolve({ code: code ?? 1, out })
        })
        child.stdin.on('error', () => undefined)
        child.stdin.end(input ?? '')
      })
    },
    async hasCifs() {
      for (const file of ['/sbin/mount.cifs', '/usr/sbin/mount.cifs']) {
        try {
          await access(file)
          return true
        } catch {
          // next
        }
      }
      return false
    },
    async mountedSource() {
      try {
        const line = (await readFile('/proc/mounts', 'utf8')).split('\n').find((l) => unescapeMount(l.split(' ')[1] ?? '') === SMB_MOUNT_POINT)
        return line ? unescapeMount(line.split(' ')[0]) : undefined
      } catch {
        return undefined
      }
    },
    startHelper(root, token) {
      return new Promise((resolve, reject) => {
        const child: ChildProcess = spawn(process.execPath, [helperFile], {
          // its own thread pool: 16 - the folder index takes 4, playing and the app's lists get the rest
          env: { PATH: process.env.PATH ?? '/usr/bin:/bin', UV_THREADPOOL_SIZE: '16', MUPIBOX_SMB_ROOT: root, MUPIBOX_SMB_TOKEN: token },
          stdio: ['pipe', 'pipe', 'inherit'],
        })
        let buffered = ''
        const timer = setTimeout(() => {
          child.kill('SIGKILL')
          reject(new Error('SMB helper did not start'))
        }, 10_000)
        child.once('error', (error) => {
          clearTimeout(timer)
          reject(error)
        })
        child.stdout?.on('data', (chunk) => {
          buffered += chunk
          const m = /port=(\d+)/.exec(buffered)
          if (m) {
            clearTimeout(timer)
            child.stdout?.removeAllListeners('data')
            child.stdout?.resume()
            resolve({
              port: Number(m[1]),
              kill: () => child.kill('SIGKILL'),
              onExit: (callback) => child.once('exit', callback),
            })
          }
        })
        child.once('exit', () => {
          clearTimeout(timer)
          reject(new Error('SMB helper ended'))
        })
      })
    },
  }
}

// cifs-utils: installed once at a time for the whole box (a login in the app and the remembered one in the background
// would lock each other out of apt); after a failure (no internet, broken package list) not again for 30 minutes - apt
// every 30 s wears the SD card.
let installRun: Promise<boolean> | undefined
let installFailedAt = 0
const INSTALL_RETRY_MS = 30 * 60_000

function installCifs(system: SmbSystem): Promise<boolean> {
  installRun ??= system
    .script(['install'], undefined, 15 * 60_000)
    .then(async (r) => r.code === 0 && (await system.hasCifs()))
    .catch(() => false)
    .then((ok) => {
      if (!ok) installFailedAt = Date.now()
      return ok
    })
    .finally(() => {
      installRun = undefined
    })
  return installRun
}

export interface SmbConnectResult {
  provider?: SmbProvider
  error?: SmbError
}

// a NAS whose disks sleep takes 10-20 s for its first answer; one that hangs never answers (a skipped track or a
// stopped preload makes the connection probe too - a sleeping NAS must not count as away then)
const PROBE_MS = 25_000
const RETRY_MS = 30_000
// a login the NAS refused is not tried every 30 s: a Synology or QNAP blocks the box's address after a few
const REFUSED_RETRY_MS = 10 * 60_000
// longer than nas_smb.sh may take itself (its lock up to 90 s, the check of 445 6 s, the mount 45 s)
const MOUNT_MS = 160_000

function isAbort(error: unknown): boolean {
  const name = (error as Error)?.name
  return name === 'AbortError' || name === 'TimeoutError'
}

// One mounted share and its helper. There is one mount point, so one connection at a time (smbConnect below).
//
// A NAS that hangs or is gone: nothing is ended and nothing unmounted - the box only counts it as away and asks the
// helper again every 30 s. The kernel connects again by itself once the NAS is back (a few seconds); the helper's
// waiting reads end with an error after a minute at most (soft mount). Ending the helper while it waited in the kernel,
// unmounting and mounting again left the kernel's connection to the NAS stuck for good (tested with kernel 6.18: only
// a restart of the box helped). A new helper is started only when the old one ended by itself.
export class SmbConnection {
  private helper: (SmbHelperHandle & { token: string }) | undefined
  private answering = false
  private opening: Promise<SmbError | undefined> | undefined
  private probing: Promise<boolean> | undefined
  private lastProbe = 0
  private retryAt = 0
  private lastError: SmbError | undefined
  private closed = false
  private token = ''

  /** made by a login in the app (not the remembered one of the config) */
  readonly byApp: boolean

  /** fresh: mount anew at the first open (a login in the app); else a share mounted already is used as it is */
  constructor(
    readonly login: SmbLogin,
    private readonly system: SmbSystem,
    private fresh = false,
  ) {
    this.byApp = fresh
  }

  /** Same NAS, share and login (the password too: after a change the share is mounted anew). */
  sameAs(login: SmbLogin): boolean {
    return (
      this.login.host === login.host &&
      this.login.share.toLowerCase() === login.share.toLowerCase() &&
      this.login.account === login.account &&
      this.login.password === login.password &&
      (this.login.domain ?? '') === (login.domain ?? '')
    )
  }

  /** The helper runs and the share answered its last probe. */
  get running(): boolean {
    return Boolean(this.helper) && this.answering
  }

  /** Why the last try failed while it is not tried again yet (the remembered login is not tried every request). */
  get waiting(): SmbError | undefined {
    return !this.running && Date.now() < this.retryAt ? this.lastError : undefined
  }

  /** Mounts the share if needed, starts the helper if needed, and probes - undefined when it answers, else why not. */
  open(): Promise<SmbError | undefined> {
    if (!this.opening) {
      this.opening = this.doOpen().finally(() => {
        this.opening = undefined
      })
    }
    return this.opening
  }

  private failure(error: SmbError): SmbError {
    this.answering = false
    this.lastError = error
    const refused = error === 'auth' || error === 'notfound' || error === 'smb1'
    this.retryAt = Date.now() + (this.system.retryMs ?? (refused ? REFUSED_RETRY_MS : RETRY_MS))
    return error
  }

  private async mount(): Promise<SmbError | undefined> {
    if (!(await this.system.hasCifs())) {
      // A login in the app waits for it (a minute or two, once). The remembered login does not: every NAS request
      // waits on it - it is installed in the background, the NAS counts as away until then.
      if (!this.fresh) {
        if (Date.now() - installFailedAt < INSTALL_RETRY_MS && !installRun) return 'install'
        void installCifs(this.system)
        return 'installing'
      }
      if (!(await installCifs(this.system))) return 'install'
    }
    const { host, share, account, password, domain } = this.login
    const mounted = await this.system.script(['mount', host, share], `${account}\n${password}\n${domain ?? ''}\n`, MOUNT_MS)
    return mounted.code === 0 ? undefined : smbErrorOf(mounted.out)
  }

  private async doOpen(): Promise<SmbError | undefined> {
    const { host, share } = this.login
    // (checked every time, also with a helper running: a share that is not mounted any more leaves an empty folder,
    // whose answers looked like a share with nothing in it)
    const source = await this.system.mountedSource()
    if (this.fresh || source?.toLowerCase() !== `//${host}/${share}`.toLowerCase()) {
      this.stopHelper()
      const error = await this.mount()
      if (error) return this.failure(error)
      this.fresh = false
      if (this.closed) {
        // (signed off while it mounted: nothing stays mounted after a sign-off)
        await this.system.script(['umount'], undefined, MOUNT_MS).catch(() => undefined)
        return 'other'
      }
    }
    if (this.closed) return 'other'
    if (!this.helper) {
      let handle: SmbHelperHandle
      try {
        handle = await this.system.startHelper(SMB_MOUNT_POINT, (this.token = randomBytes(24).toString('hex')))
      } catch {
        return this.failure('other')
      }
      if (this.closed) {
        handle.kill() // (signed off while it started)
        return 'other'
      }
      this.helper = { ...handle, token: this.token }
      handle.onExit(() => {
        if (this.helper?.port === handle.port) {
          this.helper = undefined
          this.answering = false
        }
      })
    }
    if (!(await this.probe())) return this.failure('unreachable')
    this.answering = true
    this.retryAt = 0
    return undefined
  }

  /** Whether the share answers through the helper: a name that is not there must come back as "not there". */
  probe(): Promise<boolean> {
    if (!this.probing) {
      this.probing = (async () => {
        const helper = this.helper
        if (!helper) return false
        try {
          const response = await fetch(`http://127.0.0.1:${helper.port}/probe`, {
            headers: { 'x-mupibox-token': helper.token },
            signal: AbortSignal.timeout(this.system.probeMs ?? PROBE_MS),
          })
          await response.arrayBuffer().catch(() => undefined)
          return response.ok
        } catch {
          return false
        } finally {
          this.lastProbe = Date.now()
        }
      })().finally(() => {
        this.probing = undefined
      })
    }
    return this.probing
  }

  private stopHelper() {
    this.helper?.kill()
    this.helper = undefined
    this.answering = false
  }

  /** A request did not answer in time: if the probe does not answer either, the share counts as away for a while. */
  suspect(): void {
    if (!this.answering || this.probing || Date.now() - this.lastProbe < Math.min(10_000, this.system.retryMs ?? 10_000)) return
    this.probe().then((ok) => {
      if (!ok && !this.closed && this.answering) {
        console.error(`${new Date().toLocaleString()}: [MuPiBox-Server] NAS (SMB): the share does not answer - asked again in 30 s`)
        this.failure('unreachable')
      }
    })
  }

  /**
   * The helper's port while the share answers; else it is asked again first (not more often than every 30 s - in
   * between the share counts as away at once). A request waits at most 15 s for that.
   */
  private async port(): Promise<{ port: number; token: string }> {
    if (!this.running && !this.closed && Date.now() >= this.retryAt) {
      let timer: NodeJS.Timeout | undefined
      await Promise.race([this.open(), new Promise((resolve) => (timer = setTimeout(resolve, 15_000)))])
      clearTimeout(timer)
    }
    const helper = this.helper
    if (!helper || !this.answering) throw new Error('NAS (SMB) not available')
    return helper
  }

  /** A request to the helper; a failure to answer at all makes the connection suspect the share. */
  async request(route: string, init: { method?: string; headers?: Record<string, string>; body?: Buffer; signal?: AbortSignal } = {}): Promise<Response> {
    const helper = await this.port()
    try {
      return await fetch(`http://127.0.0.1:${helper.port}${route}`, {
        method: init.method ?? 'GET',
        headers: { ...init.headers, 'x-mupibox-token': helper.token },
        body: init.body as RequestInit['body'],
        signal: init.signal,
      })
    } catch (error) {
      if (isAbort(error)) this.suspect()
      throw error
    }
  }

  /** The probe did not answer: away for a while, as a failed open. */
  notAnswering(): SmbError {
    return this.failure('unreachable')
  }

  /** Not used any more, the mount is someone else's now: only its helper is ended. */
  abandon(): void {
    this.closed = true
    this.stopHelper()
  }

  /** Back in use after a login in the app that failed: mounted again with the next request (after its own wait). */
  revive(): void {
    this.closed = false
    this.fresh = true
  }

  /** Signed off, or another NAS: helper ended, share unmounted. */
  async close(): Promise<void> {
    this.closed = true
    this.stopHelper()
    // (as long as a mount under way may hold the script's lock)
    await this.system.script(['umount'], undefined, MOUNT_MS).catch(() => undefined)
  }
}

const enc = encodeURIComponent

export class SmbProvider implements NasProvider {
  readonly kind = 'smb' as const

  constructor(readonly connection: SmbConnection) {}

  get share(): string {
    return this.connection.login.share
  }

  /** "/<share>/a/b" -> "/a/b" (the helper's path below the mount point); undefined: not in the share. */
  private inner(nasPath: string): string | undefined {
    const parts = nasPath.split('/').filter(Boolean)
    if (parts.length === 0 || parts[0].toLowerCase() !== this.share.toLowerCase()) return undefined
    return `/${parts.slice(1).join('/')}`
  }

  private async json<T>(route: string, signal: AbortSignal): Promise<T> {
    const response = await this.connection.request(route, { signal })
    if (response.status === 404 || response.status === 403 || response.status === 400) {
      await response.arrayBuffer().catch(() => undefined)
      throw new NasApiError(`NAS error ${response.status}`)
    }
    if (!response.ok) {
      await response.arrayBuffer().catch(() => undefined)
      throw new Error(`NAS (SMB) not answering (${response.status})`)
    }
    return (await response.json()) as T
  }

  async list(folder: string, signal?: AbortSignal, options?: NasListOptions): Promise<NasFileEntry[]> {
    const parts = folder.split('/').filter(Boolean)
    if (parts.length === 0) {
      return [{ name: this.share, path: `/${this.share}`, isdir: true }]
    }
    const inner = this.inner(folder)
    if (inner === undefined) throw new NasApiError('NAS error 404')
    const base = `/${parts.join('/')}`
    const entries = await this.json<SmbHelperEntry[]>(`/list?path=${enc(inner)}${options?.foldersOnly ? '&folders=1' : ''}`, signal ?? AbortSignal.timeout(20000))
    return entries
      .filter((e) => !nasIsSystemEntry(e.name))
      .map((e) => ({
        name: e.name,
        path: `${base}/${e.name}`,
        isdir: e.isdir,
        additional: e.isdir ? undefined : { size: e.size },
        version: e.isdir ? undefined : `${e.mtimeMs}-${e.size}`,
      }))
  }

  async folderExists(folder: string, signal?: AbortSignal): Promise<boolean> {
    if (folder.split('/').filter(Boolean).length === 0) return true
    const inner = this.inner(folder)
    // (a folder on another share - a profile made over WebDAV sees all of them: unknown here, not gone)
    if (inner === undefined) throw new Error('NAS (SMB): the folder is on another share')
    try {
      const info = await this.json<{ isdir: boolean }>(`/stat?path=${enc(inner)}`, signal ?? AbortSignal.timeout(8000))
      return info.isdir
    } catch (error) {
      if (error instanceof NasApiError && /404/.test(error.message)) return false
      throw error
    }
  }

  async read(file: string, options: NasReadOptions = {}): Promise<Response> {
    const inner = this.inner(file)
    if (inner === undefined) return new Response(null, { status: 404 })
    const response = await this.connection.request(`/file?path=${enc(inner)}`, { headers: options.range ? { Range: options.range } : {}, signal: options.signal })
    if (response.status === 503) {
      // (the share did not answer: as a request that failed - the stream tries again, the NAS may count as away)
      await response.arrayBuffer().catch(() => undefined)
      this.connection.suspect()
      throw new Error('NAS (SMB) not answering (503)')
    }
    return response
  }

  private async status(route: string, method: string, signal: AbortSignal | undefined, body?: Buffer): Promise<NasWriteResult> {
    const response = await this.connection.request(route, { method, body, signal: signal ?? AbortSignal.timeout(20000) })
    await response.arrayBuffer().catch(() => undefined)
    if (response.ok) return 'ok'
    if (response.status === 412) return 'exists'
    if (response.status === 403) return 'denied'
    return 'failed'
  }

  async write(file: string, data: Buffer, options: { contentType: string; overwrite: boolean; signal?: AbortSignal }): Promise<NasWriteResult> {
    const inner = this.inner(file)
    if (inner === undefined) return 'failed'
    return await this.status(`/file?path=${enc(inner)}&overwrite=${options.overwrite ? 1 : 0}`, 'PUT', options.signal, data)
  }

  async move(from: string, to: string, options: { overwrite: boolean; signal?: AbortSignal }): Promise<NasWriteResult> {
    const a = this.inner(from)
    const b = this.inner(to)
    if (a === undefined || b === undefined) return 'failed'
    return await this.status(`/move?path=${enc(a)}&to=${enc(b)}&overwrite=${options.overwrite ? 1 : 0}`, 'POST', options.signal)
  }

  async remove(file: string, signal?: AbortSignal): Promise<NasWriteResult> {
    const inner = this.inner(file)
    if (inner === undefined) return 'failed'
    return await this.status(`/file?path=${enc(inner)}`, 'DELETE', signal)
  }
}

// The one mounted share of the box.
let current: SmbConnection | undefined

/**
 * Signs in to a share: mounts it (cifs-utils installed first when missing) and starts the helper. The same login as
 * the one mounted reuses it while it answers. fresh: mount anew in any case (the login in the app).
 */
export async function smbConnect(login: SmbLogin, system: SmbSystem, fresh = false): Promise<SmbConnectResult> {
  // The remembered login (not fresh) uses the share there: its own - or one a login in the app made, whose login is
  // newer than the config's (a login without "merken", or one still mounting while the old password is stored).
  if (current && !fresh && (current.sameAs(login) || current.byApp)) {
    if (current.running) {
      if (await current.probe()) return { provider: new SmbProvider(current) }
      return { error: current.notAnswering() }
    }
    // (failed a moment ago - a refused login 10 minutes ago: not tried again yet)
    const waiting = current.waiting
    if (waiting) return { error: waiting }
    const error = await current.open()
    return error ? { error } : { provider: new SmbProvider(current) }
  }
  const before = current
  const next = new SmbConnection(login, system, fresh)
  current = next
  if (before) await before.close()
  const error = await next.open()
  if (!error) return { provider: new SmbProvider(next) }
  if (current !== next) {
    next.abandon() // (another login came in the meantime: this one's helper must not stay behind)
  } else if (fresh && before) {
    // (a login in the app that did not work: the share that worked before is mounted again - its provider is still
    // the one the box uses; the failed one's helper is ended)
    next.abandon()
    current = before
    before.revive()
  } else if (fresh) {
    // (none before: the remembered login gets its turn again, not this one that failed)
    next.abandon()
    current = undefined
  }
  // (else it stays the current one: the remembered login is tried again after its wait, not on every request)
  return { error }
}

/**
 * Signed off, or the NAS is a WebDAV one now: nothing mounted any more - also a share mounted before the server
 * started again (system: to find and unmount that one).
 */
export async function smbDisconnect(system?: SmbSystem): Promise<void> {
  const before = current
  current = undefined
  if (before) await before.close()
  else if (system && (await system.mountedSource())) await system.script(['umount'], undefined, MOUNT_MS).catch(() => undefined)
}

/** Why the remembered share is not used right now (shown in the app), undefined: nothing to tell. */
export function smbWaiting(): SmbError | undefined {
  return current?.waiting
}
