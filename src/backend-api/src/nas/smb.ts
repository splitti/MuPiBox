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
export type SmbError = 'unreachable' | 'resolve' | 'auth' | 'notfound' | 'smb1' | 'install' | 'other'

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
        const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
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

export interface SmbConnectResult {
  provider?: SmbProvider
  error?: SmbError
}

const PROBE_MS = 12_000 // a NAS whose disks sleep takes 10-20 s for its first answer; one that hangs never answers
const RETRY_MS = 30_000

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
  private closed = false

  /** fresh: mount anew at the first open (a login in the app); else a share mounted already is used as it is */
  constructor(
    readonly login: SmbLogin,
    private readonly system: SmbSystem,
    private fresh = false,
  ) {}

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
    this.retryAt = Date.now() + (this.system.retryMs ?? RETRY_MS)
    return error
  }

  private async mount(): Promise<SmbError | undefined> {
    if (!(await this.system.hasCifs())) {
      const installed = await this.system.script(['install'], undefined, 15 * 60_000)
      if (installed.code !== 0 || !(await this.system.hasCifs())) return 'install'
    }
    const { host, share, account, password, domain } = this.login
    const mounted = await this.system.script(['mount', host, share], `${account}\n${password}\n${domain ?? ''}\n`, 60_000)
    return mounted.code === 0 ? undefined : smbErrorOf(mounted.out)
  }

  private async doOpen(): Promise<SmbError | undefined> {
    if (this.fresh || !this.helper) {
      const { host, share } = this.login
      const source = await this.system.mountedSource()
      if (this.fresh || source?.toLowerCase() !== `//${host}/${share}`.toLowerCase()) {
        this.stopHelper()
        const error = await this.mount()
        if (error) return this.failure(error)
        this.fresh = false
      }
      if (this.closed) return 'other'
      if (!this.helper) {
        try {
          const token = randomBytes(24).toString('hex')
          const handle = await this.system.startHelper(SMB_MOUNT_POINT, token)
          this.helper = { ...handle, token }
          handle.onExit(() => {
            if (this.helper?.port === handle.port) {
              this.helper = undefined
              this.answering = false
            }
          })
        } catch {
          return this.failure('other')
        }
      }
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

  /** Back in use after a login that failed (its share is mounted again). */
  reopen(): Promise<SmbError | undefined> {
    this.closed = false
    this.fresh = true
    return this.open()
  }

  /** Signed off, or another NAS: helper ended, share unmounted. */
  async close(): Promise<void> {
    this.closed = true
    this.stopHelper()
    await this.system.script(['umount'], undefined, 30_000).catch(() => undefined)
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
    if (inner === undefined) return false
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
    return await this.connection.request(`/file?path=${enc(inner)}`, { headers: options.range ? { Range: options.range } : {}, signal: options.signal })
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
  if (current && current.sameAs(login) && !fresh) {
    if (current.running && (await current.probe())) {
      return { provider: new SmbProvider(current) }
    }
    const error = await current.open()
    return error ? { error } : { provider: new SmbProvider(current) }
  }
  const before = current
  const next = new SmbConnection(login, system, fresh)
  current = next
  if (before) await before.close()
  const error = await next.open()
  if (!error) return { provider: new SmbProvider(next) }
  if (before && current === next) {
    // (a login in the app that did not work: the share that worked before is mounted again - its provider is still
    // the one the box uses)
    current = before
    await before.reopen()
  }
  return { error }
}

/** Signed off, or the NAS is a WebDAV one now: nothing mounted any more. */
export async function smbDisconnect(): Promise<void> {
  const before = current
  current = undefined
  if (before) await before.close()
}

/** Whether a share is in use (the login of the app's NAS page is SMB). */
export function smbInUse(): boolean {
  return Boolean(current)
}
