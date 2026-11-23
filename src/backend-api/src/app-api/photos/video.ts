// The photo display's video clips (5.1, Einstellungen › Fotoanzeige › Videos anzeigen): a clip that comes (upload) is
// kept as it came (<id>.pending) and made, in the background and one at a time, into what the Pi plays well:
//   <id>.mp4    H.264/AAC, long side at most 1280, the moov atom in front (it starts while it loads) - a clip that is
//               H.264 already only gets its sound and container made, else ffmpeg encodes it (slow on the Pi: niced)
//   <id>.jpg, <id>.s.jpg, <id>.b.jpg   a picture of it (its first second) in the photos' three sizes (process.ts)
// ffmpeg is installed when "Videos anzeigen" is switched on: clips coming before wait for it ("Wird vorbereitet").
// Too long (more than 3 minutes) or no clip at all: it is taken out again.

import { execFile } from 'node:child_process'
import { existsSync, promises as fsp } from 'node:fs'
import { promisify } from 'node:util'
import { NotAPicture, photoFiles, processPhoto } from './process'
import { albums, assetBase, cardSpace, update } from './store'

// what stays free on the card (as for an upload)
const RESERVE_BYTES = 300 * 1024 * 1024

const execFileAsync = promisify(execFile)

export const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.m4v']
export const VIDEO_MAX_SECONDS = 180
/** a clip as it comes (upload, NAS, Immich): up to 1 GB - made smaller on the box */
export const VIDEO_MAX_BYTES = 1024 * 1024 * 1024
export const FFMPEG = '/usr/bin/ffmpeg'
const FFPROBE = '/usr/bin/ffprobe'

export class VideoTooLong extends Error {}
export class NotAVideo extends Error {}

interface Probe {
  duration: number
  w: number
  h: number
  codec: string
  pix: string
  audio: boolean
  taken: string | null
}

async function probe(src: string): Promise<Probe> {
  let stdout: string
  try {
    ;({ stdout } = await execFileAsync(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', src], { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 }))
  } catch {
    throw new NotAVideo()
  }
  const j = JSON.parse(stdout) as {
    streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number; pix_fmt?: string }>
    format?: { duration?: string; tags?: Record<string, string> }
  }
  const v = j.streams?.find((s) => s.codec_type === 'video')
  if (!v) throw new NotAVideo()
  const created = j.format?.tags?.creation_time ?? j.format?.tags?.['com.apple.quicktime.creationdate']
  return {
    duration: Number(j.format?.duration) || 0,
    w: Number(v.width) || 0,
    h: Number(v.height) || 0,
    codec: String(v.codec_name ?? ''),
    pix: String(v.pix_fmt ?? ''),
    audio: !!j.streams?.some((s) => s.codec_type === 'audio'),
    taken: created && /^\d{4}-\d{2}-\d{2}T/.test(created) ? created.slice(0, 19) : null,
  }
}

export interface ProcessedVideo {
  w: number
  h: number
  duration: number
  taken: string | null
}

/** A clip into <out>.mp4 and its picture in the three sizes; throws NotAVideo / VideoTooLong */
export async function processVideo(src: string, out: string): Promise<ProcessedVideo> {
  const p = await probe(src)
  if (p.duration > VIDEO_MAX_SECONDS + 1) throw new VideoTooLong()
  const mp4 = `${out}.mp4.tmp`
  const copy = p.codec === 'h264' && (p.pix === 'yuv420p' || p.pix === 'yuvj420p') && Math.max(p.w, p.h) <= 1280
  const video = copy
    ? ['-c:v', 'copy']
    : [
        '-vf',
        "scale='if(gte(iw,ih),min(1280,iw),-2)':'if(gte(iw,ih),-2,min(1280,ih))',format=yuv420p",
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '26',
        '-threads',
        '2',
      ]
  const audio = p.audio ? ['-c:a', 'aac', '-b:a', '96k', '-ac', '2'] : ['-an']
  try {
    await execFileAsync('nice', ['-n', '15', FFMPEG, '-v', 'error', '-y', '-i', src, '-map', '0:v:0', '-map', '0:a:0?', ...video, ...audio, '-movflags', '+faststart', '-f', 'mp4', mp4], {
      timeout: 30 * 60_000,
    })
    // its picture: from its first second (a clip that starts black - often a little later)
    const poster = `${out}.poster.jpg`
    const at = String(Math.min(1, Math.max(0, p.duration / 3)))
    await execFileAsync(FFMPEG, ['-v', 'error', '-y', '-ss', at, '-i', mp4, '-frames:v', '1', '-q:v', '3', poster], { timeout: 120_000 })
    let facts
    try {
      facts = await processPhoto(poster, out, '.jpg')
    } finally {
      await fsp.rm(poster, { force: true })
    }
    await fsp.rename(mp4, `${out}.mp4`)
    return { w: facts.w, h: facts.h, duration: Math.round(p.duration), taken: p.taken }
  } catch (err) {
    await fsp.rm(mp4, { force: true })
    if (err instanceof NotAPicture) throw new NotAVideo()
    throw err
  }
}

/**
 * The clips waiting (asset kind 'video', not ready, its <id>.pending there): made one after the other. Without ffmpeg
 * they wait - asked again when "Videos anzeigen" has installed it (kick) and every 10 minutes.
 */
export class VideoQueue {
  private running = false
  private again = false

  start(): void {
    setTimeout(() => void this.kick(), 30_000).unref?.()
    setInterval(() => void this.kick(), 10 * 60_000).unref?.()
  }

  async kick(): Promise<void> {
    if (this.running) {
      this.again = true
      return
    }
    this.running = true
    try {
      do {
        this.again = false
        await this.work()
      } while (this.again)
    } finally {
      this.running = false
    }
  }

  private log(msg: string): void {
    console.log(`${new Date().toLocaleString()}: [photos] video: ${msg}`)
  }

  private async work(): Promise<void> {
    for (;;) {
      // (an Immich album shown live: its clips come from Immich - nothing to make)
      const waiting = (await albums()).flatMap((a) => (a.live ? [] : a.assets.filter((x) => x.kind === 'video' && x.ready === false).map((x) => ({ a, x }))))
      if (!waiting.length) return
      if (!existsSync(FFMPEG) || !existsSync(FFPROBE)) return
      const { a, x } = waiting[0]
      const out = assetBase(a, x.id)
      const src = `${out}.pending`
      // (the made one takes at most about as much as the clip as it came: that room and the reserve, else it waits)
      const size = (await fsp.stat(src).catch(() => ({ size: 0 }))).size
      const space = await cardSpace()
      if (space && space.free - size < RESERVE_BYTES) {
        this.log(`${x.id}: not enough room on the card to make it, it waits`)
        return
      }
      let result: ProcessedVideo | null = null
      let gone = false
      let rejected = false
      if (!existsSync(src)) gone = true
      else {
        try {
          result = await processVideo(src, out)
        } catch (err) {
          this.log(`${x.id}: ${err instanceof VideoTooLong ? 'longer than 3 minutes' : err instanceof NotAVideo ? 'not a clip' : (err as Error).message}`)
          gone = true
          rejected = err instanceof VideoTooLong || err instanceof NotAVideo
        }
      }
      // done: ready with its size and length; not to be made: out again (the app shows it no longer)
      const kept = await update((lib) => {
        const album = lib.albums.find((y) => y.id === a.id)
        const asset = album?.assets.find((y) => y.id === x.id)
        if (!album || !asset) return false
        // (the album went live meanwhile: its clip comes from Immich - the entry stays, the files made here go)
        if (album.live) return false
        if (gone || !result) {
          album.assets = album.assets.filter((y) => y.id !== x.id)
          if (album.cover === x.id) delete album.cover
          if (rejected && asset.ref) lib.rejected = [...(lib.rejected ?? []), `${album.source}:${asset.ref}|${asset.ver ?? ''}`].slice(-1000)
          return false
        }
        Object.assign(asset, { w: result.w, h: result.h, duration: result.duration, taken: result.taken ?? asset.taken, ready: true })
        return true
      })
      await fsp.rm(src, { force: true })
      if (!kept) for (const f of photoFiles(out)) await fsp.rm(f, { force: true }).catch(() => undefined)
    }
  }
}

export const videoQueue = new VideoQueue()
