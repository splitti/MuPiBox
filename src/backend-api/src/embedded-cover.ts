/**
 * The picture embedded in an audio file (the cover of that very track): ID3v2 (MP3, versions 2.2 to 2.4) and FLAC.
 * Only the head of the file is read (`read(start, end)`, e.g. an HTTP range request to the NAS), never the audio.
 * A front cover (picture type 3) is preferred, else the first picture.
 */

export interface EmbeddedPicture {
  data: Buffer
  mime: string
}

type Reader = (start: number, end: number) => Promise<Buffer>

const MAX_TAG_BYTES = 8 * 1024 * 1024

function syncsafe(b: Buffer, offset: number): number {
  return ((b[offset] & 0x7f) << 21) | ((b[offset + 1] & 0x7f) << 14) | ((b[offset + 2] & 0x7f) << 7) | (b[offset + 3] & 0x7f)
}

// ID3 "unsynchronisation": every 0xFF 0x00 stands for 0xFF.
function resync(b: Buffer): Buffer {
  const out = Buffer.alloc(b.length)
  let n = 0
  for (let i = 0; i < b.length; i++) {
    out[n++] = b[i]
    if (b[i] === 0xff && b[i + 1] === 0x00) i++
  }
  return out.subarray(0, n)
}

// End of a text ended by a zero (one byte for latin-1/UTF-8, two aligned bytes for UTF-16).
function skipText(b: Buffer, offset: number, encoding: number): number {
  if (encoding === 1 || encoding === 2) {
    for (let i = offset; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return i + 2
    return b.length
  }
  const end = b.indexOf(0, offset)
  return end < 0 ? b.length : end + 1
}

function mimeOf(format: string, data: Buffer): string {
  if (data[0] === 0x89 && data[1] === 0x50) return 'image/png'
  if (data[0] === 0xff && data[1] === 0xd8) return 'image/jpeg'
  const f = format.toLowerCase()
  if (f.includes('png')) return 'image/png'
  return 'image/jpeg'
}

function parseId3(tag: Buffer, version: number): EmbeddedPicture | undefined {
  let first: EmbeddedPicture | undefined
  let offset = 0
  const headerSize = version === 2 ? 6 : 10
  while (offset + headerSize <= tag.length) {
    const id = tag.toString('latin1', offset, offset + (version === 2 ? 3 : 4))
    if (!/^[A-Z0-9]{3,4}$/.test(id)) break // padding
    let size: number
    let flags = 0
    if (version === 2) size = (tag[offset + 3] << 16) | (tag[offset + 4] << 8) | tag[offset + 5]
    else if (version === 4) size = syncsafe(tag, offset + 4)
    else size = tag.readUInt32BE(offset + 4)
    if (version !== 2) flags = tag.readUInt16BE(offset + 8)
    const start = offset + headerSize
    const end = start + size
    if (size <= 0 || end > tag.length) break
    if (id === 'APIC' || id === 'PIC') {
      let frame = tag.subarray(start, end)
      if (version === 4 && flags & 0x0002) frame = resync(frame) // per-frame unsynchronisation
      if (version === 4 && flags & 0x0001) frame = frame.subarray(4) // data length indicator
      const encoding = frame[0]
      let p = 1
      let format: string
      if (version === 2) {
        format = frame.toString('latin1', 1, 4)
        p = 4
      } else {
        const mimeEnd = frame.indexOf(0, 1)
        if (mimeEnd < 0) break
        format = frame.toString('latin1', 1, mimeEnd)
        p = mimeEnd + 1
      }
      const pictureType = frame[p]
      p = skipText(frame, p + 1, encoding)
      const data = frame.subarray(p)
      if (data.length > 16 && !(version !== 2 && format === '-->')) {
        const picture = { data: Buffer.from(data), mime: mimeOf(format, data) }
        if (pictureType === 3) return picture
        first ??= picture
      }
    }
    offset = end
  }
  return first
}

async function readId3(read: Reader): Promise<{ picture?: EmbeddedPicture; tagEnd: number }> {
  const head = await read(0, 9)
  if (head.length < 10 || head.toString('latin1', 0, 3) !== 'ID3') return { tagEnd: 0 }
  const version = head[3]
  const flags = head[5]
  const size = syncsafe(head, 6)
  const tagEnd = 10 + size + (flags & 0x10 ? 10 : 0) // + footer
  if (version < 2 || version > 4 || size <= 0 || size > MAX_TAG_BYTES) return { tagEnd }
  let tag = await read(10, 10 + size - 1)
  if (version < 4 && flags & 0x80) tag = resync(tag) // whole-tag unsynchronisation
  if (version === 3 && flags & 0x40) tag = tag.subarray(4 + tag.readUInt32BE(0)) // extended header
  if (version === 4 && flags & 0x40) tag = tag.subarray(syncsafe(tag, 0))
  return { picture: parseId3(tag, version), tagEnd }
}

async function readFlac(read: Reader, offset: number): Promise<EmbeddedPicture | undefined> {
  const marker = await read(offset, offset + 3)
  if (marker.toString('latin1') !== 'fLaC') return undefined
  let p = offset + 4
  let first: EmbeddedPicture | undefined
  for (let blocks = 0; blocks < 64; blocks++) {
    const header = await read(p, p + 3)
    if (header.length < 4) break
    const last = (header[0] & 0x80) !== 0
    const type = header[0] & 0x7f
    const length = (header[1] << 16) | (header[2] << 8) | header[3]
    if (type === 6 && length > 32 && length <= MAX_TAG_BYTES) {
      const block = await read(p + 4, p + 4 + length - 1)
      const pictureType = block.readUInt32BE(0)
      const mimeLength = block.readUInt32BE(4)
      const mime = block.toString('latin1', 8, 8 + mimeLength)
      let q = 8 + mimeLength
      q += 4 + block.readUInt32BE(q) // description
      q += 16 // width, height, depth, colours
      const dataLength = block.readUInt32BE(q)
      const data = block.subarray(q + 4, q + 4 + dataLength)
      if (data.length > 16) {
        const picture = { data: Buffer.from(data), mime: mimeOf(mime, data) }
        if (pictureType === 3) return picture
        first ??= picture
      }
    }
    p += 4 + length
    if (last) break
  }
  return first
}

export async function readEmbeddedPicture(read: Reader): Promise<EmbeddedPicture | undefined> {
  const id3 = await readId3(read)
  if (id3.picture) return id3.picture
  // FLAC, possibly behind an ID3 tag
  return await readFlac(read, id3.tagEnd)
}
