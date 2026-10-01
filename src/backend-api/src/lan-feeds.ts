/**
 * Servers in the home network the box may fetch feeds from (mupibox.feedHosts).
 *
 * The box fetches no address of the home network on its own (server.ts, checkRemoteUrl / openRemote): a feed, a
 * cover or a redirect could otherwise use it to reach the router, the NAS or the box's own services. A podcast server
 * of the family (Pinepods, Audiobookshelf, …) lives exactly there, though. The parents allow such a server once in the
 * app, by host and port ("192.168.1.20:8040"): then that one is reached - feed, covers, episodes, downloads - and every
 * other address of the home network stays closed. Never allowed: the box itself, loopback, link-local.
 */

import { promises as dns } from 'node:dns'
import os from 'node:os'

export const MAX_FEED_HOSTS = 20

const PRIVATE_IP_REGEXES = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./, // 172.16.0.0/12
  /^169\.254\./, // link-local
  /^0\./,
  /^::1$/,
  /^::ffff:127\./i,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // 100.64.0.0/10 (carrier-grade NAT)
  /^fe[89ab][0-9a-f]:/i, // IPv6 link-local fe80::/10
  /^f[cd][0-9a-f]{2}:/i, // IPv6 unique local fc00::/7 (was only the literal prefixes fc00:/fd00:)
]
/** An address of the home network, loopback or link-local (as written - a name is resolved by the caller) */
export const isPrivateHost = (host: string): boolean => {
  // Strip brackets from IPv6 literals
  let h = host.replace(/^\[|\]$/g, '').toLowerCase()
  // IPv4-mapped IPv6 (::ffff:10.0.0.1) is checked as the IPv4 address it maps to - also in the form the URL parser
  // writes it (::ffff:a00:1), as NAT64 (64:ff9b::a00:1) or IPv4-compatible (::a00:1): these passed as "public" before
  h = h.replace(/^(?:::ffff:|64:ff9b::|::)(\d+\.\d+\.\d+\.\d+)$/, '$1')
  const hex = /^(?:::ffff:|64:ff9b::|::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h)
  if (hex) {
    const hi = Number.parseInt(hex[1], 16)
    const lo = Number.parseInt(hex[2], 16)
    h = `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`
  }
  // any other form of these prefixes is nothing a feed lives on
  if (/^(::ffff:|64:ff9b:)/.test(h)) return true
  if (h === 'localhost' || h.endsWith('.localhost') || h === '0.0.0.0' || h === '::') return true
  return PRIVATE_IP_REGEXES.some((r) => r.test(h))
}

/** A URL's host and port as kept in the list: "192.168.1.20:8040", "pinepods.lan:80", "[fd00::5]:443" */
export function feedHostKey(url: URL): string {
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const port = url.port || (url.protocol === 'https:' ? '443' : '80')
  return `${host.includes(':') ? `[${host}]` : host}:${port}`
}

/** The allowed servers from the config (only well-formed entries) */
export function feedHostsOf(cfg: unknown): string[] {
  const list = (cfg as { mupibox?: { feedHosts?: unknown } } | undefined)?.mupibox?.feedHosts
  return Array.isArray(list)
    ? list.filter((h): h is string => typeof h === 'string' && /^[^\s/?#@]+:\d{1,5}$/.test(h)).slice(0, MAX_FEED_HOSTS)
    : []
}

/** The box's own addresses (every network card): never a feed server, whatever is listed */
function ownAddresses(): Set<string> {
  const own = new Set<string>()
  for (const list of Object.values(os.networkInterfaces())) for (const a of list ?? []) own.add(a.address.toLowerCase())
  return own
}

/**
 * An address that is never fetched, also when its server is listed: loopback, link-local, "any", and the box's own
 * addresses (its player and settings answer there).
 */
export function neverFetched(address: string): boolean {
  const a = address
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/, '$1')
  if (a === 'localhost' || a.endsWith('.localhost') || a === '0.0.0.0' || a === '::' || a === '::1') return true
  if (/^127\./.test(a) || /^0\./.test(a) || /^169\.254\./.test(a) || /^fe[89ab][0-9a-f]:/.test(a)) return true
  return ownAddresses().has(a)
}

/**
 * What the app needs to know about a feed's address before it is added: whether it is in the home network (a private
 * address as written, or a name resolving to one), whether its server is allowed already, and whether it never can be
 */
export async function feedHostCheck(
  raw: string,
  allowed: string[],
): Promise<{ host: string; lan: boolean; allowed: boolean; never: boolean } | null> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  const host = feedHostKey(url)
  const name = url.hostname.replace(/^\[|\]$/g, '')
  let addresses = [name]
  if (!isPrivateHost(name)) {
    // (a name: what it stands for - unknown names are no home-network question)
    addresses = (await dns.lookup(name, { all: true, verbatim: true }).catch(() => [])).map((a) => a.address)
  }
  const lan = addresses.some((a) => isPrivateHost(a))
  return { host, lan, allowed: allowed.includes(host), never: [name, ...addresses].some(neverFetched) }
}
