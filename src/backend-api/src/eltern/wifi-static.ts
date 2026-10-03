// Netzwerk › WLAN › Gespeicherte Netze: a fixed address for one WiFi network (the others keep DHCP).
//
// The box connects through wpa-roam (/etc/network/interfaces: "iface wlan0 inet manual" + "wpa-roam …" and
// "iface default inet dhcp"). wpa_supplicant names a network by its id_str, and on connecting wpa_action brings up
// the logical interface of that name instead of "default". So a network with a fixed address gets an id_str
// ("mupi_" and a hash of its name) and its own stanza "iface mupi_… inet static" in /etc/network/interfaces.d/
// mupibox-wifi, written here. The DNS server goes into /etc/resolv.conf by the stanza's "up" line (there is no
// resolvconf on the box, so "dns-nameservers" would do nothing).
//
// A wrong address must not lock the box out of the network - three steps:
//   - before saving, a test (in the network the box is in now): the address free, and tried as a second address
//     for a few seconds - does the router answer it? - while the connection stays as it is; the DNS server asked;
//   - after saving for that network, the box switches at once and looks after a few seconds whether it reaches its
//     router;
//   - and every 30 s, in whichever network: three misses in a row and the network goes back to DHCP.
// Taken back, a fixed address is not lost: it is kept "paused" (no id_str, so DHCP), the app shows it to correct and
// try again. dietpi-config, which writes wpa_supplicant.conf anew from its own list, drops the id_str - the network
// then simply has DHCP again.

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import dns from 'node:dns'
import { promises as fsp } from 'node:fs'
import net from 'node:net'
import type { RequestHandler, Router } from 'express'
import { decodeWpaSsid } from '../wpa-ssid'
import { requireCsrf, requireSession } from './middleware'

export interface WifiStatic {
  ip: string
  mask: string
  gateway: string
  dns: string
}

export interface WifiStaticDeps {
  /** the WiFi adapter in use */
  wifiIface: () => string
}

/** Who may read and change: the app (session, and CSRF for changes) - or, under /api, the display too (see server.ts) */
export interface WifiStaticAccess {
  prefix: string
  read: RequestHandler[]
  write: RequestHandler[]
}
const APP_ACCESS: WifiStaticAccess = { prefix: '', read: [requireSession], write: [requireSession, requireCsrf] }

const FILE = '/etc/network/interfaces.d/mupibox-wifi'

function run(cmd: string, args: string[], timeout = 10000): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 1024 * 1024 }, (err, stdout) => resolve({ ok: !err, stdout: String(stdout ?? '') }))
  })
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** The id_str of a network with a fixed address: the same for the same name, only letters and digits */
export const idStrOf = (ssid: string) => `mupi_${createHash('sha1').update(ssid).digest('hex').slice(0, 10)}`

const isV4 = (s: unknown): s is string => typeof s === 'string' && net.isIPv4(s)
const toInt = (ip: string) => ip.split('.').reduce((n, part) => n * 256 + Number(part), 0)
const isMask = (m: string) => {
  const n = toInt(m)
  // (ones, then zeros only - and not 0.0.0.0 or 255.255.255.255)
  return n > 0 && n < 0xffffffff && ((~n >>> 0) & ((~n >>> 0) + 1)) === 0
}
const prefixOf = (mask: string) => toInt(mask).toString(2).replace(/0/g, '').length
const sameNet = (a: string, b: string, mask: string) => ((toInt(a) & toInt(mask)) >>> 0) === ((toInt(b) & toInt(mask)) >>> 0)

/** What is wrong with a fixed address (null: nothing) - the address and the router in the same network */
export function checkStatic(s: Partial<WifiStatic>): string | null {
  if (!isV4(s.ip)) return 'ip'
  if (!isV4(s.mask) || !isMask(s.mask)) return 'mask'
  if (!isV4(s.gateway)) return 'gateway'
  if (s.dns && !isV4(s.dns)) return 'dns'
  if (!sameNet(s.ip, s.gateway, s.mask)) return 'subnet'
  if (s.ip === s.gateway) return 'same'
  // (not the network's own address or its broadcast address)
  const host = (toInt(s.ip) & ~toInt(s.mask)) >>> 0
  if (host === 0 || host === (~toInt(s.mask) >>> 0)) return 'host'
  return null
}

type Entry = WifiStatic & { ssid: string; id: string; paused: boolean }

/** The networks with a fixed address (also the paused ones), by their id_str (from the file written below) */
export async function readStatic(): Promise<Map<string, Entry>> {
  const text = await fsp.readFile(FILE, 'utf8').catch(() => '')
  const out = new Map<string, Entry>()
  for (const block of text.split(/\n(?=# ssid )/)) {
    const ssidLine = /^# ssid (.*)$/m.exec(block)?.[1]
    const id = /^iface (mupi_[0-9a-f]{10}) inet static$/m.exec(block)?.[1]
    if (!ssidLine || !id) continue
    let ssid: string
    try {
      ssid = JSON.parse(ssidLine)
    } catch {
      continue
    }
    const field = (name: string) => new RegExp(`^\\s+${name} (\\S+)$`, 'm').exec(block)?.[1] ?? ''
    const dnsServer = /^\s+up printf 'nameserver %s\\n' (\S+) > \/etc\/resolv\.conf$/m.exec(block)?.[1] ?? ''
    const gateway = field('gateway')
    out.set(id, { ssid, id, ip: field('address'), mask: field('netmask'), gateway, dns: dnsServer === gateway ? '' : dnsServer, paused: /^# paused$/m.test(block) })
  }
  return out
}

function render(entries: Entry[]): string {
  const head = [
    '# MuPiBox: WiFi networks with a fixed address (app: Netzwerk › WLAN › Gespeicherte Netze) - written by the box.',
    '# wpa_supplicant names the network by its id_str, wpa-roam then brings up this interface instead of "default".',
    '# A "paused" one is not used (its network has no id_str): kept to be corrected and tried again in the app.',
    '',
  ]
  const blocks = entries.map((e) =>
    [
      `# ssid ${JSON.stringify(e.ssid)}`,
      ...(e.paused ? ['# paused'] : []),
      `iface ${e.id} inet static`,
      `\taddress ${e.ip}`,
      `\tnetmask ${e.mask}`,
      `\tgateway ${e.gateway}`,
      // (all of them are checked IPv4 addresses - nothing else gets into the shell line)
      `\tup printf 'nameserver %s\\n' ${e.dns || e.gateway} > /etc/resolv.conf`,
      '',
    ].join('\n'),
  )
  return [...head, ...blocks].join('\n')
}

// One change of the list at a time - saving from the app and from the display, a network taken out, the watch taking
// one back: two at once read the same file, and the second one's write undid the first (the id_str of that network
// stayed in the WPA profile, pointing at nothing)
let chain: Promise<unknown> = Promise.resolve()
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn)
  chain = run.catch(() => undefined)
  return run
}
let writeSeq = 0

// Written as the box writes /etc/network/interfaces: a new file next to it, then renamed (a power cut mid-write
// leaves the old one)
async function writeStatic(entries: Entry[]): Promise<boolean> {
  if (!entries.length) return (await run('sudo', ['rm', '-f', FILE])).ok
  const tmp = `/tmp/.mupibox-wifi.${process.pid}.${Date.now()}.${++writeSeq}`
  await fsp.writeFile(tmp, render(entries), { mode: 0o644 })
  try {
    const next = `${FILE}.mupibox-new.${process.pid}.${writeSeq}`
    return (await run('sudo', ['cp', tmp, next])).ok && (await run('sudo', ['chmod', '644', next])).ok && (await run('sudo', ['mv', '-f', next, FILE])).ok
  } finally {
    await fsp.rm(tmp, { force: true })
  }
}

const cli = (iface: string, ...args: string[]) => run('sudo', ['/usr/sbin/wpa_cli', '-i', iface, ...args], 8000)

/** The saved network of this name: its number at wpa_supplicant and whether the box is in it now */
async function networkOf(iface: string, ssid: string): Promise<{ id: string; active: boolean } | null> {
  for (const ln of (await cli(iface, 'list_networks')).stdout.split('\n')) {
    const parts = ln.split('\t')
    // (wpa_cli prints a name with an umlaut as \xNN per byte - the app sends the name as written)
    if (ln.startsWith('network id') || decodeWpaSsid(parts[1] ?? '') !== ssid || !/^\d+$/.test(parts[0])) continue
    return { id: parts[0], active: (parts[3] ?? '').includes('[CURRENT]') }
  }
  return null
}

/**
 * The network's id_str set (or, with '', taken off) and saved. A fixed address set but not saved: the id_str before is
 * put back in the running wpa_supplicant too - else it would use the new one at the next connection while the file
 * (and the app) keep it paused. Taken off but not saved, it stays off while the box runs: DHCP is the safe side.
 */
async function setIdStr(iface: string, id: string, idStr: string): Promise<boolean> {
  const before = idStr ? (await cli(iface, 'get_network', id, 'id_str')).stdout.trim() : ''
  if (!/OK/.test((await cli(iface, 'set_network', id, 'id_str', `"${idStr}"`)).stdout)) return false
  if (/OK/.test((await cli(iface, 'save_config')).stdout)) return true
  if (idStr) await cli(iface, 'set_network', id, 'id_str', /^"[^"]*"$/.test(before) ? before : '""')
  return false
}

/**
 * The address changed now, while the WiFi connection stays - set directly (entry: the fixed address; null: DHCP), and
 * ifupdown's state set to match, so that wpa_action takes it from there at the next connection (the id_str's
 * interface, or "default"). Neither wpa_supplicant nor ifupdown is touched: disconnecting and connecting again made
 * the access points turn the box away for minutes ("authentication timed out", every try waiting longer), and an
 * ifdown from outside - also through wpa_action's events - ended wpa_supplicant itself (/etc/wpa_supplicant/
 * ifupdown.sh). All values in the script are checked IPv4 addresses, the adapter's name and the id_str's pattern.
 */
async function switchTo(iface: string, entry: Entry | null): Promise<boolean> {
  if (!/^wl[\w.-]{0,13}$/.test(iface)) return false
  const dh = `-pf /run/dhclient.${iface}.pid -lf /var/lib/dhcp/dhclient.${iface}.leases`
  const state = (logical: string) =>
    `sed -i 's/^${iface}=.*/${iface}=${logical}/' /run/network/ifstate; echo ${logical} > /run/network/ifstate.${iface}`
  const script = entry
    ? [
        // (the DHCP client stopped without giving the address back - the same address may stay, nothing in between)
        `dhclient -4 -x ${dh} ${iface} 2>/dev/null`,
        `ip -4 addr flush dev ${iface} scope global`,
        // (a second WiFi adapter in the same network - USB and onboard - got the same address through the shared
        // profile: taken off the other one, this one has it)
        `for o in /sys/class/net/wl*; do o=\${o##*/}; [ "$o" = "${iface}" ] || ip -4 addr del ${entry.ip}/${prefixOf(entry.mask)} dev "$o" 2>/dev/null; done`,
        `ip -4 addr add ${entry.ip}/${prefixOf(entry.mask)} dev ${iface}`,
        `ip -4 route replace default via ${entry.gateway} dev ${iface}`,
        `printf 'nameserver %s\\n' ${entry.dns || entry.gateway} > /etc/resolv.conf`,
        state(entry.id),
      ]
    : [
        `ip -4 addr flush dev ${iface} scope global`,
        state('default'),
        // (as ifupdown starts it; it waits for an address up to the DHCP timeout, then goes on in the background)
        `dhclient -4 -v -i ${dh} -I -df /var/lib/dhcp/dhclient6.${iface}.leases ${iface}`,
      ]
  return (await run('sudo', ['sh', '-c', script.join('; ')], 90000)).ok
}

const reachable = async (iface: string, gateway: string) => (await run('ping', ['-c', '2', '-W', '2', '-I', iface, gateway], 8000)).ok

/** A network taken out entirely (removed from the saved networks) */
export function dropStatic(iface: string, ssid: string): Promise<void> {
  return serialized(async () => {
    const all = await readStatic()
    const id = idStrOf(ssid)
    if (!all.has(id)) return
    all.delete(id)
    await writeStatic([...all.values()])
    const n = await networkOf(iface, ssid)
    if (n) await setIdStr(iface, n.id, '')
  })
}

// the last time a network was taken back to DHCP - shown by the app until it is read
let reverted: { ssid: string; at: number } | null = null
// (one change at a time: saving, the test, the check after saving and the watch would get in each other's way)
let busy = false

/** Back to DHCP for this network, its address kept paused */
async function revert(iface: string, entry: Entry, why: string): Promise<void> {
  console.warn(`${new Date().toLocaleString()}: [wifi-static] ${entry.ssid}: ${why} with ${entry.ip} - back to DHCP`)
  const n = await serialized(async () => {
    const all = await readStatic()
    all.set(entry.id, { ...entry, paused: true })
    await writeStatic([...all.values()])
    const net = await networkOf(iface, entry.ssid)
    if (net) await setIdStr(iface, net.id, '')
    return net
  })
  reverted = { ssid: entry.ssid, at: Date.now() }
  if (n?.active) await switchTo(iface, null)
}

// After saving a fixed address for the network the box is in: switched to it, and after a few seconds - is the router
// there? (before the WLAN watchdog of DietPi, wifi_monitor.sh, starts the WiFi anew after its third miss, ~36 s)
async function checkAfterSaving(iface: string, entry: Entry): Promise<void> {
  busy = true
  try {
    await sleep(1000)
    await switchTo(iface, entry)
    await sleep(5000)
    for (let i = 0; i < 3; i++) {
      if (await reachable(iface, entry.gateway)) return
      await sleep(3000)
    }
    await revert(iface, entry, `router ${entry.gateway} not reached after saving`)
  } finally {
    busy = false
  }
}

let misses = 0
let missesFor = ''
async function watch(iface: string): Promise<void> {
  const status = (await cli(iface, 'status')).stdout
  const idStr = /^id_str=(mupi_[0-9a-f]{10})$/m.exec(status)?.[1]
  // (a moment without connection counts neither way: DietPi's watchdog starts the WiFi anew every ~40 s while the
  // router is not reached, and a tick in that gap wiped the count before - the third miss never came)
  if (!/^wpa_state=COMPLETED$/m.test(status) || !idStr) return
  if (idStr !== missesFor) {
    missesFor = idStr
    misses = 0
  }
  const entry = (await readStatic()).get(idStr)
  if (!entry) {
    // The network's id_str points at no stanza (saved and taken out at nearly the same moment, the file gone): the
    // box got no address with it - ifup of an interface it does not know. The id_str taken off, DHCP instead.
    const ssid = /^ssid=(.*)$/m.exec(status)?.[1] ?? ''
    console.warn(`${new Date().toLocaleString()}: [wifi-static] ${ssid || idStr}: no fixed address for its id_str - back to DHCP`)
    await serialized(async () => {
      const n = ssid ? await networkOf(iface, ssid) : null
      if (n) await setIdStr(iface, n.id, '')
    })
    await switchTo(iface, null)
    return
  }
  if (entry.paused) {
    // Paused, but wpa_supplicant still names the network by its id_str (taking it off failed - a full card while
    // saving, or when it was taken back): the box would run the paused fixed address, unwatched. Taken off, DHCP.
    const ssid = /^ssid=(.*)$/m.exec(status)?.[1] ?? entry.ssid
    console.warn(`${new Date().toLocaleString()}: [wifi-static] ${ssid}: fixed address paused but still in use - back to DHCP`)
    await serialized(async () => {
      const n = await networkOf(iface, entry.ssid)
      if (n) await setIdStr(iface, n.id, '')
    })
    await switchTo(iface, null)
    return
  }
  // (most routers answer a ping; three misses in a row, and an address from DHCP is the safe side)
  if (await reachable(iface, entry.gateway)) {
    misses = 0
    return
  }
  if (++misses < 3) return
  misses = 0
  await revert(iface, entry, `router ${entry.gateway} not reached`)
}

export function startWifiStaticWatch(deps: WifiStaticDeps): void {
  setInterval(async () => {
    if (busy) return
    busy = true
    try {
      await watch(deps.wifiIface())
    } catch {
      // next time
    } finally {
      busy = false
    }
  }, 30000).unref()
}

type Check = { id: string; ok: boolean; warn?: boolean }

/** The address and the router the adapter has now */
async function current(iface: string): Promise<{ ip?: string; prefix?: number; gateway?: string }> {
  const addr = /inet (\d+\.\d+\.\d+\.\d+)\/(\d+)/.exec((await run('ip', ['-4', 'addr', 'show', 'dev', iface])).stdout)
  const gateway = /via (\S+)/.exec((await run('ip', ['-4', 'route', 'show', 'default', 'dev', iface])).stdout)?.[1]
  return { ip: addr?.[1], prefix: addr ? Number(addr[2]) : undefined, gateway }
}

/**
 * The test before saving, in the network the box is in now (the connection stays as it is):
 *   network - the router and the range as the box has them now from DHCP (a typo in the router's address);
 *   free    - nobody else has the address: asked by ARP (a ping to it - every device answers ARP, not every one ping);
 *   router  - the address added for a few seconds as a second one, the router pinged from it;
 *   dns     - the DNS server (else the router) asked for a name.
 */
async function test(iface: string, s: WifiStatic): Promise<Check[]> {
  const checks: Check[] = []
  const now = await current(iface)
  const prefix = prefixOf(s.mask)
  const sameAsNow = now.gateway === s.gateway && now.prefix === prefix && !!now.ip && sameNet(now.ip, s.ip, s.mask)
  checks.push({ id: 'network', ok: sameAsNow, warn: !sameAsNow })
  if (s.ip === now.ip) {
    // (the address the box has now - from DHCP: the router may give it to another device later, see the hint)
    checks.push({ id: 'own', ok: true })
  } else {
    await run('ping', ['-c', '1', '-W', '1', '-I', iface, s.ip], 4000)
    const neigh = (await run('ip', ['neigh', 'show', s.ip, 'dev', iface])).stdout
    checks.push({ id: 'free', ok: !/lladdr/.test(neigh) })
  }
  if (s.ip === now.ip) {
    checks.push({ id: 'router', ok: await reachable(iface, s.gateway) })
  } else if (checks.at(-1)?.ok) {
    // (noprefixroute: no second route for the network; taken off again in any case)
    const added = (await run('sudo', ['ip', 'addr', 'add', `${s.ip}/${prefix}`, 'dev', iface, 'noprefixroute'])).ok
    try {
      checks.push({ id: 'router', ok: added && (await run('ping', ['-c', '2', '-W', '2', '-I', s.ip, s.gateway], 8000)).ok })
    } finally {
      if (added) await run('sudo', ['ip', 'addr', 'del', `${s.ip}/${prefix}`, 'dev', iface])
    }
  }
  const resolver = new dns.promises.Resolver({ timeout: 3000, tries: 1 })
  resolver.setServers([s.dns || s.gateway])
  checks.push({ id: 'dns', ok: await resolver.resolve4('github.com').then((a) => a.length > 0, () => false) })
  return checks
}

export function registerWifiStaticRoutes(router: Router, deps: WifiStaticDeps, access: WifiStaticAccess = APP_ACCESS): void {
  const p = access.prefix
  /** GET /api/app/wifi/static - {networks: {ssid: {ip, mask, gateway, dns, paused}}, reverted?: {ssid, at}} */
  router.get(`${p}/wifi/static`, ...access.read, async (_req, res) => {
    const networks: Record<string, WifiStatic & { paused: boolean }> = {}
    for (const e of (await readStatic()).values()) networks[e.ssid] = { ip: e.ip, mask: e.mask, gateway: e.gateway, dns: e.dns, paused: e.paused }
    res.json({ networks, ...(reverted ? { reverted } : {}) })
  })

  /**
   * POST /api/app/wifi/static/test {ssid, ip, mask, gateway, dns?} - {active, checks: [{id, ok, warn?}]}: the test
   * before saving (see test above) - only in the network the box is in now ({active: false}: no checks).
   */
  router.post(`${p}/wifi/static/test`, ...access.write, async (req, res) => {
    const body = (req.body as Partial<WifiStatic> & { ssid?: unknown } | undefined) ?? {}
    const s = { ip: body.ip, mask: body.mask, gateway: body.gateway, dns: body.dns ?? '' }
    const problem = checkStatic(s)
    if (problem) {
      res.status(400).json({ error: 'invalid', field: problem })
      return
    }
    const iface = deps.wifiIface()
    const n = typeof body.ssid === 'string' ? await networkOf(iface, body.ssid) : null
    if (!n?.active) {
      res.json({ active: false, checks: [] })
      return
    }
    if (busy) {
      res.status(409).json({ error: 'busy' })
      return
    }
    busy = true
    try {
      res.json({ active: true, checks: await test(iface, s as WifiStatic) })
    } finally {
      busy = false
    }
  })

  /**
   * POST /api/app/wifi/static {ssid, dhcp: true} | {ssid, ip, mask, gateway, dns?} - the network's address: DHCP or
   * fixed. The network the box is in now connects anew at once ({active: true}: the box is then reached at the new
   * address - or, if it does not reach its router there, after about 30 s at its old one again, DHCP); another one
   * takes it at its next connection.
   */
  router.post(`${p}/wifi/static`, ...access.write, async (req, res) => {
    const body = (req.body as (Partial<WifiStatic> & { ssid?: unknown; dhcp?: unknown }) | undefined) ?? {}
    const ssid = typeof body.ssid === 'string' ? body.ssid : ''
    const iface = deps.wifiIface()
    const n = ssid ? await networkOf(iface, ssid) : null
    if (!n) {
      res.status(404).json({ error: 'ssid_not_saved' })
      return
    }
    if (busy) {
      res.status(409).json({ error: 'busy' })
      return
    }
    // (taken from here on: the watch, the test and a second save stay out while the file and the id_str change; the
    // check after saving takes it over - it is let go here only on the paths without it)
    busy = true
    let handedOver = false
    try {
      const id = idStrOf(ssid)
      let entry: Entry | undefined
      if (body.dhcp !== true) {
        const s = { ip: body.ip, mask: body.mask, gateway: body.gateway, dns: body.dns ?? '' }
        const problem = checkStatic(s)
        if (problem) {
          res.status(400).json({ error: 'invalid', field: problem })
          return
        }
        entry = { ssid, id, ip: s.ip as string, mask: s.mask as string, gateway: s.gateway as string, dns: s.dns as string, paused: false }
      }
      // (read, changed, written and the id_str set as one step - see serialized)
      const saved = await serialized(async () => {
        const all = await readStatic()
        // (a fixed address in use now - a paused one is DHCP already, nothing to switch)
        const wasFixed = !!all.get(id) && !all.get(id)?.paused
        if (entry) all.set(id, entry)
        else if (all.has(id)) all.delete(id)
        else return { ok: true, wasFixed }
        let ok = await writeStatic([...all.values()])
        if (ok && !(await setIdStr(iface, n.id, entry ? id : ''))) {
          // (the file says "fixed", wpa_supplicant does not know it: the box would run DHCP while the app shows the
          // address as in use - kept paused instead, as after a failed check, so both say the same)
          ok = false
          if (entry) {
            all.set(id, { ...entry, paused: true })
            await writeStatic([...all.values()])
          }
        }
        return { ok, wasFixed }
      })
      if (!saved.ok) {
        res.status(500).json({ error: 'not_saved' })
        return
      }
      const wasFixed = saved.wasFixed
      if (reverted?.ssid === ssid) reverted = null
      res.json({ ok: true, active: n.active })
      // (after the answer has gone out: the connection is gone for a moment)
      if (n.active && entry) {
        handedOver = true
        void checkAfterSaving(iface, entry).catch(() => undefined)
      } else if (n.active && wasFixed) {
        handedOver = true
        setTimeout(() => {
          void switchTo(iface, null)
            .catch(() => undefined)
            .finally(() => {
              busy = false
            })
        }, 1000).unref()
      }
    } finally {
      if (!handedOver) busy = false
    }
  })

  /** POST /api/app/wifi/static/seen - the note "back to DHCP" read */
  router.post(`${p}/wifi/static/seen`, ...access.write, (_req, res) => {
    reverted = null
    res.json({ ok: true })
  })
}
