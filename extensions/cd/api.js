// The CD drive, API part: the picture of the disc in the drive. The player (player.js) keeps it in a file while the disc is in;
// the display's CD tab shows it as the cover.

const fs = require('node:fs')

const COVER_FILE = '/tmp/mupibox-cd-cover.jpg'

exports.activate = (host) => {
  host.route('get', '/cover', (_req, res) => {
    let stat
    try {
      stat = fs.statSync(COVER_FILE)
    } catch {
      res.status(404).set('Cache-Control', 'no-store').send('no cd cover')
      return
    }
    // revalidated on every use (a cheap 304 on the box itself), so a new disc's cover is shown at once
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Last-Modified', stat.mtime.toUTCString())
    const since = Date.parse(String(_req.headers['if-modified-since'] ?? ''))
    if (Number.isFinite(since) && Math.floor(stat.mtimeMs / 1000) * 1000 <= since) {
      res.status(304).end()
      return
    }
    res.setHeader('Content-Length', String(stat.size))
    fs.createReadStream(COVER_FILE).on('error', () => res.end()).pipe(res)
  })
}
