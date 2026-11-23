// Finding Jellyfin servers in the home network: Jellyfin answers the broadcast "Who is JellyfinServer?" on UDP 7359 with
// {Address, Id, Name}. Asked on every network of the box (its broadcast address) and on 255.255.255.255; what answers
// within the time is the list. A server in another network (VLAN, behind a router) does not answer - the address is
// typed in then.

import dgram from 'node:dgram'
import os from 'node:os'
import { cleanAddress } from './client'

export interface FoundServer {
  address: string
  id: string
  name: string
}

const PORT = 7359
const QUESTION = 'Who is JellyfinServer?'

/** The broadcast address of each IPv4 network of the box (192.168.1.37/24 -> 192.168.1.255) */
export function broadcastAddresses(nets = os.networkInterfaces()): string[] {
  const out = new Set<string>(['255.255.255.255'])
  for (const list of Object.values(nets)) {
    for (const n of list ?? []) {
      if (n.family !== 'IPv4' || n.internal || !n.netmask) continue
      const ip = n.address.split('.').map(Number)
      const mask = n.netmask.split('.').map(Number)
      if (ip.length !== 4 || mask.length !== 4) continue
      out.add(ip.map((b, i) => (b | (~mask[i] & 255)) & 255).join('.'))
    }
  }
  return [...out]
}

/**
 * One answer: the server, or null for what is not one. A server that names itself by a loopback or unset address
 * (127.0.0.1, 0.0.0.0 - no "published server URL" set) gets the address the answer came from, with its port.
 */
export function parseAnswer(text: string, from?: string): FoundServer | null {
  try {
    const j = JSON.parse(text) as Record<string, unknown>
    let address = cleanAddress(j.Address)
    // (also an IP that is not the one answering: Jellyfin in Docker names its container's own, 172.17.0.2 - not reached
    // from the box; a name - jellyfin.home - stays, a published address of a proxy)
    const ip = address ? /^https?:\/\/(\d{1,3}(?:\.\d{1,3}){3})(?=[:/]|$)/i.exec(address)?.[1] : undefined
    if (address && from && (/^https?:\/\/(127\.|0\.0\.0\.0|localhost|\[::1?\])/i.test(address) || (ip && ip !== from))) {
      const u = new URL(address)
      address = cleanAddress(`${u.protocol}//${from}${u.port ? `:${u.port}` : ''}${u.pathname}`)
    }
    const id = typeof j.Id === 'string' ? j.Id : ''
    if (!address || !/^[0-9a-f]{32}$/i.test(id)) return null
    return { address, id, name: typeof j.Name === 'string' ? j.Name.slice(0, 100) : '' }
  } catch {
    return null
  }
}

/** The Jellyfin servers that answer within waitMs (one per server id) */
export function discover(waitMs = 2500): Promise<FoundServer[]> {
  return new Promise((resolve) => {
    const found = new Map<string, FoundServer>()
    let socket: dgram.Socket
    try {
      socket = dgram.createSocket('udp4')
    } catch {
      resolve([])
      return
    }
    const finish = () => {
      try {
        socket.close()
      } catch {
        // closed already
      }
      resolve([...found.values()])
    }
    socket.on('error', finish)
    socket.on('message', (msg, from) => {
      const s = parseAnswer(msg.toString('utf8'), from.address)
      if (s && !found.has(s.id)) found.set(s.id, s)
    })
    socket.bind(0, () => {
      try {
        socket.setBroadcast(true)
      } catch {
        return finish()
      }
      for (const to of broadcastAddresses()) socket.send(QUESTION, PORT, to, () => undefined)
      setTimeout(finish, waitMs)
    })
  })
}
