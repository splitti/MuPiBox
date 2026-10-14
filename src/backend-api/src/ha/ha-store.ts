/**
 * What the Home Assistant API keeps (/etc/mupibox/ha, the folder ha_tls.sh makes for dietpi): the box's persistent
 * device ID and the paired clients. A client's token is kept only as its SHA-256 - the token itself is shown once, in
 * the answer of /pair/confirm. /etc/mupibox, not the program's folder: the ID and the pairings outlive updates and the
 * planned new layout of the folders.
 */

import { createHash, randomUUID } from 'node:crypto'
import { promises as fsp } from 'node:fs'

export const HA_DIR = '/etc/mupibox/ha'
const DEVICE_FILE = `${HA_DIR}/device.json`
const CLIENTS_FILE = `${HA_DIR}/clients.json`

export type Scope = 'read' | 'control' | 'notify' | 'power' | 'admin'
export const SCOPES: Scope[] = ['read', 'control', 'notify', 'power', 'admin']

export interface HaClient {
  client_id: string
  client_name: string
  /** SHA-256 of the access token, hex */
  token_sha256: string
  scopes: Scope[]
  paired_at: string
}

async function writePrivate(file: string, value: unknown): Promise<void> {
  const tmp = `${file}.tmp-${process.pid}`
  await fsp.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  await fsp.rename(tmp, file)
}

let deviceIdCache: string | null = null

/** The box's device ID: a UUID made once, the same across restarts, IP changes and updates */
export async function deviceId(): Promise<string> {
  if (deviceIdCache) return deviceIdCache
  try {
    const stored = JSON.parse(await fsp.readFile(DEVICE_FILE, 'utf8')) as { device_id?: unknown }
    if (typeof stored.device_id === 'string' && /^[0-9a-f-]{36}$/.test(stored.device_id)) {
      deviceIdCache = stored.device_id
      return deviceIdCache
    }
  } catch {
    // none yet
  }
  const id = randomUUID()
  await writePrivate(DEVICE_FILE, { device_id: id, created: new Date().toISOString() })
  deviceIdCache = id
  return id
}

export const tokenHash = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex')

export async function readClients(): Promise<HaClient[]> {
  try {
    const list = JSON.parse(await fsp.readFile(CLIENTS_FILE, 'utf8')) as unknown
    return Array.isArray(list) ? (list as HaClient[]).filter((c) => c && typeof c.token_sha256 === 'string' && typeof c.client_id === 'string') : []
  } catch {
    return []
  }
}

// (one write at a time: a pairing and a revocation at the same moment kept only one of the two)
let chain: Promise<unknown> = Promise.resolve()
export function updateClients(change: (list: HaClient[]) => HaClient[]): Promise<HaClient[]> {
  const run = chain.then(async () => {
    const next = change(await readClients())
    await writePrivate(CLIENTS_FILE, next)
    return next
  })
  chain = run.catch(() => undefined)
  return run
}

/** The client whose token this is, or null */
export async function clientByToken(token: string): Promise<HaClient | null> {
  if (!token) return null
  const hash = tokenHash(token)
  return (await readClients()).find((c) => c.token_sha256 === hash) ?? null
}
