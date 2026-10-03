/**
 * The network's name as wpa_cli prints it (list_networks, status, get_network): a character outside ASCII comes as
 * \xNN per byte, a backslash as \\. Decoded here to the name as the box's user wrote it.
 */
export function decodeWpaSsid(raw: string): string {
  const bytes: number[] = []
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '\\' && raw[i + 1] === 'x' && /^[0-9a-fA-F]{2}$/.test(raw.slice(i + 2, i + 4))) {
      bytes.push(Number.parseInt(raw.slice(i + 2, i + 4), 16))
      i += 3
    } else if (raw[i] === '\\' && raw[i + 1] === '\\') {
      bytes.push(0x5c)
      i += 1
    } else {
      bytes.push(...Buffer.from(raw[i]))
    }
  }
  return Buffer.from(bytes).toString('utf8')
}
