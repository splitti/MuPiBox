// The photo display: every picture is brought into its three sizes once, when it comes (upload, NAS, Immich), and
// only read afterwards - little room on the card and no work while a child looks at it. With Python's PIL, as the
// covers (server.ts getThumbnail): the turn of the camera (EXIF) applied, nothing of the EXIF kept (no place, no
// camera), JPEG. iPhone photos (HEIC) through heif-convert first (installed when the display is switched on).
//
//   <id>.jpg     the picture on the display and in the app's full view, long side at most 1280
//   <id>.s.jpg   the grid and the album tiles, long side at most 400
//   <id>.b.jpg   the blurred background of the full view, long side 32 (the display only scales it up)

import { execFile } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const SIZES = { full: 1280, small: 400, blur: 32 } as const
export const PHOTO_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp']

export interface ProcessedPhoto {
  w: number
  h: number
  /** when it was taken (EXIF, ISO), else null */
  taken: string | null
}

// (prints the size of the turned picture and the time it was taken, as JSON; exit code 2: not a picture)
const SCRIPT = `
import sys, json
from PIL import Image, ImageOps
src, out = sys.argv[1], sys.argv[2]
try:
    im = Image.open(src)
    ow, oh = im.size
    # (a JPEG read already smaller - by 2, 4 or 8, as long as its long side keeps 1280: a photo of a phone took 137 MB
    # read whole, 55 MB so - a Pi with 1 GB froze at the first upload, together with the display and apt; the same
    # picture comes out. No effect on other kinds.)
    im.draft(None, (1280, 1) if ow >= oh else (1, 1280))
    im.load()
except Exception:
    sys.exit(2)
dw, dh = im.size
taken = None
try:
    exif = im.getexif()
    sub = exif.get_ifd(0x8769) if hasattr(exif, 'get_ifd') else {}
    raw = sub.get(36867) or exif.get(36867) or exif.get(306)
    if raw:
        d, t = str(raw).strip().split(' ')
        taken = d.replace(':', '-') + 'T' + t
except Exception:
    taken = None
try:
    im = ImageOps.exif_transpose(im)
except Exception:
    pass
if im.mode in ('RGBA', 'LA', 'P'):
    im = im.convert('RGBA')
    bg = Image.new('RGB', im.size, (0, 0, 0))
    bg.paste(im, mask=im.split()[-1])
    im = bg
else:
    im = im.convert('RGB')
# (the size of the picture itself, turned as shown - not of the smaller one read)
w, h = (oh, ow) if (im.size != (dw, dh) and im.size == (dh, dw)) else (ow, oh)
for size, suffix, quality in ((1280, '.jpg', 84), (400, '.s.jpg', 80), (32, '.b.jpg', 70)):
    copy = im.copy()
    copy.thumbnail((size, size), Image.LANCZOS)
    copy.save(out + suffix + '.tmp', 'JPEG', quality=quality, optimize=True)
print(json.dumps({'w': w, 'h': h, 'taken': taken}))
`

// one at a time: the Pi is busy enough with an upload or a sync, and a child may be listening meanwhile
let chain: Promise<unknown> = Promise.resolve()
function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
  const run = chain.then(work, work)
  chain = run.catch(() => undefined)
  return run
}

export class NotAPicture extends Error {}
/** The one who sent the picture is gone (the app's upload was stopped): nothing more is done for it */
export class PhotoAborted extends Error {}

// Not while a program of the photos is being installed (apt, right after the display was switched on - routes.ts sets
// this): apt, the display and the pictures together were too much for a Pi with 1 GB, it froze at the first upload.
// At most 3 minutes, then the picture goes on anyway (an upload of the app waits for it, and gives up after 5).
const INSTALL_WAIT_MS = 3 * 60_000
let installing: () => Promise<void> = () => Promise.resolve()
export function setPhotoInstallWait(wait: () => Promise<void>): void {
  installing = wait
}
async function afterInstalling(signal?: AbortSignal): Promise<void> {
  let timer: NodeJS.Timeout | undefined
  let onAbort: (() => void) | undefined
  try {
    await Promise.race([
      installing(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, INSTALL_WAIT_MS)
        timer.unref?.()
      }),
      new Promise<void>((resolve) => {
        onAbort = resolve
        signal?.addEventListener('abort', onAbort, { once: true })
      }),
    ])
  } finally {
    clearTimeout(timer)
    if (onAbort) signal?.removeEventListener('abort', onAbort)
  }
}

// pillow-heif with a libheif of its own (photos_setup.sh puts it there below libheif 1.17): a HEIC to a JPEG for the
// script above. libheif hands the picture already turned (the turn of a HEIC is in the file's own boxes), so the EXIF
// turn is set to "as it is" - kept, the script would turn it once more; the rest of the EXIF (the date) stays.
export const HEIF_FALLBACK_PYTHON = '/opt/mupibox/heif/bin/python3'
const HEIF_SCRIPT = `
import sys
from PIL import Image
from pillow_heif import register_heif_opener
register_heif_opener()
im = Image.open(sys.argv[1])
exif = im.getexif()
exif[0x0112] = 1
im.convert('RGB').save(sys.argv[2], 'JPEG', quality=92, exif=exif.tobytes())
`
async function heifFallback(src: string, dest: string, signal?: AbortSignal): Promise<boolean> {
  try {
    await fsp.access(HEIF_FALLBACK_PYTHON)
  } catch {
    return false
  }
  try {
    await execFileAsync('nice', ['-n', '10', HEIF_FALLBACK_PYTHON, '-c', HEIF_SCRIPT, src, dest], { timeout: 120_000, signal })
    return true
  } catch {
    await fsp.rm(dest, { force: true }).catch(() => undefined)
    return false
  }
}

/**
 * The three sizes of `src` as `<out>.jpg`, `<out>.s.jpg`, `<out>.b.jpg` (written next to each other and renamed at the
 * end: never half of them). `ext`: the source's kind (HEIC goes through heif-convert). Throws NotAPicture for a file
 * PIL cannot read, PhotoAborted when `signal` ends it (waiting for its turn or on its way).
 */
export function processPhoto(src: string, out: string, ext: string, signal?: AbortSignal): Promise<ProcessedPhoto> {
  return oneAtATime(async () => {
    if (signal?.aborted) throw new PhotoAborted()
    await afterInstalling(signal)
    if (signal?.aborted) throw new PhotoAborted()
    let input = src
    let converted: string | undefined
    try {
      if (ext === '.heic' || ext === '.heif') {
        converted = `${out}.heic.jpg`
        const target = converted
        await execFileAsync('nice', ['-n', '10', 'heif-convert', '-q', '92', src, target], { timeout: 120_000, signal }).catch(async (err) => {
          if (signal?.aborted) throw new PhotoAborted()
          // (heif-convert could not read it - a newer iPhone photo under Debian 12's libheif -, or it is missing: pillow-heif
          // where the box has it (photos_setup.sh))
          if (await heifFallback(src, target, signal)) return
          if (signal?.aborted) throw new PhotoAborted()
          // (started through nice: a missing heif-convert is nice's exit code 127, not an ENOENT - the photo is fine,
          // the box is still setting HEIC up or that failed; the app says so instead of "Datei beschädigt")
          const code = (err as { code?: unknown }).code
          throw code === 127 || code === 'ENOENT' ? new Error('heif-convert missing') : new NotAPicture()
        })
        input = converted
      }
      let stdout: string
      try {
        ;({ stdout } = await execFileAsync('nice', ['-n', '10', 'python3', '-c', SCRIPT, input, out], { timeout: 120_000, signal }))
      } catch (err) {
        if (signal?.aborted) throw new PhotoAborted()
        if ((err as { code?: number }).code === 2) throw new NotAPicture()
        throw err
      }
      if (signal?.aborted) throw new PhotoAborted()
      const facts = JSON.parse(stdout) as ProcessedPhoto
      for (const suffix of ['.jpg', '.s.jpg', '.b.jpg']) await fsp.rename(`${out}${suffix}.tmp`, `${out}${suffix}`)
      return { w: Number(facts.w) || 0, h: Number(facts.h) || 0, taken: typeof facts.taken === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(facts.taken) ? facts.taken : null }
    } catch (err) {
      for (const suffix of ['.jpg', '.s.jpg', '.b.jpg']) await fsp.rm(`${out}${suffix}.tmp`, { force: true })
      throw err
    } finally {
      if (converted) await fsp.rm(converted, { force: true })
    }
  })
}

/** The files of a processed picture (to delete them) - and of a clip: its video and the clip as it came, waiting */
export function photoFiles(out: string): string[] {
  return ['.jpg', '.s.jpg', '.b.jpg', '.mp4', '.pending'].map((s) => `${out}${s}`)
}

export const extOf = (name: string): string => path.extname(name).toLowerCase()
