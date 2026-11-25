// The CD drive, API part: the picture of the disc in the drive (the player, player.js, keeps it in a file while the disc is in; the
// display's CD tab shows it as the cover) and the ripping of the disc into a folder of the box's media: the app's dialog (a `form` of the
// extension's card, hostApi 17), the job (cd-rip.js) and its status.

const fs = require('node:fs')
const path = require('node:path')
const { DEVICE } = require('./cd-drive.js')
const { BITRATES, FORMATS, RESERVE_BYTES, boxRip, conflicts, imageKind, listArtists, startJob } = require('./cd-rip.js')
const { buildForm, parseRequest } = require('./cd-rip-form.js')

const COVER_FILE = '/tmp/mupibox-cd-cover.jpg'
const MEDIA = '/home/dietpi/MuPiBox/media'
// the player keeps the disc for the ripper this long after the last word (player.js RIP_HOLD_MS), so the ripper says so more often
const HEARTBEAT_MS = 10 * 1000

/** Where a program is on the PATH (null when it is not installed). */
function findBinary(name, dirs = String(process.env.PATH ?? '').split(path.delimiter)) {
  for (const dir of dirs) {
    try {
      fs.accessSync(path.join(dir, name), fs.constants.X_OK)
      return path.join(dir, name)
    } catch {
      // not here
    }
  }
  return null
}

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

  const media = host.paths?.media ?? MEDIA
  const mediaCover = path.join(media, 'cover')

  // ---------- ripping ----------

  // what the player says about the disc (player.js), null when it does not answer
  const player = async (route, ms = 5000) => {
    try {
      const res = await fetch(`${host.playerUrl}/ext/cd${route}`, { signal: AbortSignal.timeout(ms) })
      return res.ok ? await res.json() : { status: res.status, ...(await res.json().catch(() => ({}))) }
    } catch {
      return null
    }
  }

  const settingsNow = () => {
    const all = typeof host.settings === 'function' ? host.settings() : {}
    const format = FORMATS[all?.ripFormat] ? all.ripFormat : 'mp3'
    const bitrate = BITRATES.includes(Number(all?.ripBitrate)) ? Number(all.ripBitrate) : 320
    return { format, bitrate }
  }

  let job = null
  let status = { state: 'idle' }
  const running = () => status.state === 'running'

  const tools = () => ['cdparanoia', 'ffmpeg'].filter((name) => !findBinary(name))
  const missingText = (list) => `${list.join(' und ')} ${list.length > 1 ? 'fehlen' : 'fehlt'} auf der Box. In den Einstellungen der Box die Updates der Erweiterungen ausführen oder die Erweiterung neu einschalten.`

  async function formFor(disc) {
    const settings = settingsNow()
    let hasCover = false
    try {
      hasCover = !!disc.info?.hasCover && fs.statSync(COVER_FILE).size > 0
    } catch {
      hasCover = false
    }
    return buildForm({ disc, info: disc.info, settings, artists: listArtists(media), hasCover })
  }

  /** The disc in the drive for the dialog, or { message } when there is nothing to rip now. */
  async function readyDisc() {
    if (running()) return { message: 'Es wird gerade eine CD gerippt.' }
    const missing = tools()
    if (missing.length > 0) return { message: missingText(missing) }
    const disc = await player('/info')
    if (!disc) return { message: 'Der Player antwortet nicht.' }
    if (!disc.present || !(disc.tracks > 0)) return { message: 'Es liegt keine Audio-CD im Laufwerk.' }
    if (disc.ripping) return { message: 'Die CD wird gerade gelesen.' }
    if (!Array.isArray(disc.lbas)) return { message: 'Das Inhaltsverzeichnis der CD ist nicht lesbar.' }
    return { disc }
  }

  host.route(
    'get',
    '/ripform',
    async (_req, res) => {
      const { disc, message } = await readyDisc()
      if (!disc) return res.json({ ok: false, message })
      res.json(await formFor(disc))
    },
    { session: true },
  )

  // "update album info online": the internet is asked again, the dialog is drawn with what it said
  host.route(
    'get',
    '/riplookup',
    async (_req, res) => {
      const { disc, message } = await readyDisc()
      if (!disc) return res.json({ ok: false, message })
      const again = await player('/relookup', 60000)
      const fresh = await player('/info')
      if (!again || !fresh?.info) return res.json({ ok: false, message: 'Im Internet wurde zu dieser CD nichts gefunden.' })
      res.json(await formFor(fresh))
    },
    { session: true },
  )

  host.route(
    'post',
    '/rip',
    async (req, res) => {
      const { disc, message } = await readyDisc()
      if (!disc) return res.json({ ok: false, message })
      const body = req.body ?? {}
      if (!Array.isArray(body.rows) || body.rows.length !== disc.tracks) return res.json({ ok: false, message: 'Die CD hat gewechselt – bitte den Dialog neu öffnen.' })
      const settings = settingsNow()
      const parsed = parseRequest(body, { disc, settings, media, mediaCover })
      if (parsed.error) return res.json({ ok: false, message: parsed.error })
      const { plan } = parsed
      const same = conflicts(plan.dir, plan.tracks.map((t) => t.file))
      if (same.length > 0) return res.json({ ok: false, message: `Im Ordner gibt es schon ${same[0]}${same.length > 1 ? ` und ${same.length - 1} weitere` : ''}. Bitte einen anderen Ordner für das Album wählen.` })
      try {
        const st = fs.statfsSync(media)
        if (st.bavail * st.bsize - RESERVE_BYTES < plan.estimate) return res.json({ ok: false, message: 'Auf der Speicherkarte ist nicht genug Platz für die CD.' })
      } catch {
        // (the free space is unknown: the job finds out)
      }
      // the cover: the one the user chose, else the disc's own
      let cover = null
      try {
        const file = plan.cover.kind === 'picked' ? plan.cover.file : COVER_FILE
        const bytes = fs.readFileSync(file)
        if (imageKind(bytes)) cover = { bytes, replace: plan.cover.kind === 'picked' }
      } catch {
        if (plan.cover.kind === 'picked') return res.json({ ok: false, message: 'Das gewählte Cover ist nicht mehr da – bitte noch einmal wählen.' })
      }
      const taken = await player('/ripping?on=1', 15000)
      if (!taken?.ok) return res.json({ ok: false, message: 'Der Player gibt die CD nicht frei.' })
      const rel = path.relative(media, plan.dir)
      status = { state: 'running', album: plan.album, track: 0, tracks: plan.tracks.length, percent: 0, dir: rel }
      const beat = setInterval(() => void player('/ripping?on=1'), HEARTBEAT_MS)
      beat.unref?.()
      job = startJob({ ...plan, cover }, {
        rip: boxRip,
        device: DEVICE,
        report: (s) => {
          status = { ...status, ...s, dir: rel }
        },
      })
      host.log.info(`[Extension cd] ripping ${plan.tracks.length} tracks of "${plan.album}" as ${plan.format} into ${rel}`)
      void job.done.then(async (result) => {
        clearInterval(beat)
        job = null
        await player('/ripping?on=0')
        if (result.ok) host.libraryChanged?.()
        host.log.info(result.ok ? `[Extension cd] ripped: ${rel}` : result.cancelled ? '[Extension cd] ripping cancelled' : `[Extension cd] ripping failed: ${result.error}`)
      })
      res.json({ ok: true, message: 'Das Rippen hat begonnen. Den Fortschritt zeigt die Karte „Audio-CD“.' })
    },
    { session: true },
  )

  host.route(
    'post',
    '/ripcancel',
    (_req, res) => {
      if (!job) return res.json({ ok: false, message: 'Es wird gerade nichts gerippt.' })
      job.cancel()
      res.json({ ok: true, message: 'Das Rippen wird abgebrochen.' })
    },
    { session: true },
  )

  // the lines of the card (the app asks every few seconds while it is open)
  host.route(
    'get',
    '/ripstatus',
    async (_req, res) => {
      const s = status
      if (s.state === 'running') {
        return res.json({
          rows: [
            { label: 'Rippen', value: `${s.album || 'Audio-CD'}: Titel ${Math.max(1, s.track)} von ${s.tracks} (${s.percent} %)` },
            { label: 'Ziel', value: s.dir },
            { label: 'Abbrechen', value: 'Bereits fertige Dateien werden gelöscht.', button: { label: 'Abbrechen', post: '/api/ext/cd/ripcancel', confirm: 'Das Rippen abbrechen? Die bisher gerippten Dateien werden gelöscht.' } },
          ],
        })
      }
      if (s.state === 'done') return res.json({ rows: [{ label: 'Letztes Rippen', value: `${s.album || 'Audio-CD'}: fertig (${s.tracks} Titel)`, tone: 'ok' }, { label: 'Ordner', value: s.dir }] })
      if (s.state === 'failed') {
        const missing = s.missing ? missingText([s.missing]) : ''
        return res.json({ rows: [{ label: 'Letztes Rippen', value: `${s.album || 'Audio-CD'}: nicht geklappt`, tone: 'error' }, { label: 'Grund', value: missing || String(s.message ?? '').slice(0, 200) }] })
      }
      if (s.state === 'cancelled') return res.json({ rows: [{ label: 'Letztes Rippen', value: 'Abgebrochen', tone: 'warn' }] })
      const disc = await player('/info', 2500)
      const missing = tools()
      res.json({
        rows: [
          {
            label: 'Rippen',
            value: missing.length > 0 ? `${missing.join(' und ')} noch nicht installiert` : disc?.present ? `Bereit – ${disc.tracks} Titel auf der CD` : 'Keine Audio-CD im Laufwerk',
            ...(missing.length > 0 ? { tone: 'warn' } : {}),
          },
        ],
      })
    },
    { session: true },
  )
}

exports._findBinary = findBinary
