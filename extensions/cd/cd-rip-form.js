// The dialog of the rip (the app's `form` item, hostApi 17): what the parents see before a CD is read - album, artist, genre, year, the
// cover, a title and a contributing artist for each track, and where the files go (a category and folders of the box's media, an
// existing one or a new one) - and the check of what they send back. Plain logic, no disc and no card needed.

const path = require('node:path')
const { CATEGORIES, FORMATS, SECTOR_BYTES, cleanName, tagText, trackFileName, albumDirectory, estimateBytes } = require('./cd-rip.js')

const CATEGORY_LABELS = { audiobook: 'Hörspiele', music: 'Musik', other: 'Sonstiges' }
const COVER_NAME = /^[A-Za-z0-9._-]+\.(jpe?g|png)$/i
const WAV_HEADER = 44

/** The dialog for a disc. `info`: what the internet knows (cd-lookup.js) or null; `artists`: the folders of every category. */
function buildForm({ disc, info, settings, artists, hasCover }) {
  const album = tagText(info?.album) || 'Audio-CD'
  const albumArtist = tagText(info?.artist)
  const format = FORMATS[settings.format] ?? FORMATS.mp3
  const how = format.lossy ? `${format.label}, ${settings.bitrate} kbit/s` : `${format.label} (ohne Qualitätsverlust)`
  return {
    ok: true,
    title: 'CD rippen',
    message: `Die Titel werden als ${how} gespeichert (oben bei den Einstellungen änderbar). Die Angaben unten stehen später in den Dateien.`,
    submit: 'Rippen',
    fields: [
      { key: 'album', label: 'Album', type: 'text', value: album, required: true },
      { key: 'albumArtist', label: 'Albuminterpret', type: 'text', value: albumArtist },
      { key: 'genre', label: 'Genre', type: 'text', value: tagText(info?.genre) },
      { key: 'year', label: 'Jahr', type: 'text', value: /^\d{4}$/.test(String(info?.year ?? '')) ? String(info.year) : '', maxLength: 4 },
      {
        key: 'category',
        label: 'Speichern in',
        type: 'select',
        value: 'music',
        keep: true,
        options: CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
        help: 'Die Medien-Ordner der Box: Hörspiele, Musik oder Sonstiges.',
      },
      {
        key: 'artistFolder',
        label: 'Ordner des Interpreten',
        type: 'combo',
        value: cleanName(albumArtist) || 'Unbekannt',
        follows: 'albumArtist',
        keep: true,
        required: true,
        optionsBy: { key: 'category', map: artists },
        help: 'Einen vorhandenen Ordner wählen oder einen neuen Namen eintippen.',
      },
      { key: 'albumFolder', label: 'Ordner des Albums', type: 'text', value: cleanName(album) || 'Audio-CD', follows: 'album', keep: true, required: true, help: 'Ein neuer Name legt einen neuen Ordner an.' },
    ],
    image: {
      url: hasCover ? `/api/ext/cd/cover?v=${disc.id}` : null,
      label: 'Cover ändern',
      picker: { target: 'own:cd-cover', title: album, query: [albumArtist, info?.album].filter(Boolean).join(' ') },
    },
    rows: {
      label: 'Titel',
      columns: [
        { key: 'nr', label: '#', readonly: true },
        { key: 'title', label: 'Titel' },
        { key: 'artist', label: 'Beteiligte Interpreten' },
      ],
      items: Array.from({ length: disc.tracks }, (_, i) => ({
        nr: i + 1,
        title: tagText(info?.tracks?.[i]?.title),
        artist: tagText(info?.tracks?.[i]?.artist) || albumArtist,
      })),
    },
    links: [{ label: 'Albuminformationen online aktualisieren', get: '/api/ext/cd/riplookup' }],
  }
}

/**
 * What the app sent back ({ values, rows, image }), checked, and the plan of the job made of it: { plan } or { error } (a text for the
 * parents). `media`: the box's media folder; `mediaCover`: the folder of the app's own pictures.
 */
function parseRequest(body, { disc, settings, media, mediaCover }) {
  const values = body?.values && typeof body.values === 'object' ? body.values : {}
  const text = (key) => tagText(values[key])
  const album = text('album')
  if (!album) return { error: 'Bitte einen Albumnamen angeben.' }
  const year = text('year')
  if (year !== '' && !/^\d{4}$/.test(year)) return { error: 'Das Jahr hat vier Ziffern (zum Beispiel 1991).' }
  const where = albumDirectory(media, String(values.category ?? ''), String(values.artistFolder ?? ''), String(values.albumFolder ?? ''))
  if (where.error) return { error: where.error }
  const lbas = disc.lbas
  if (!Array.isArray(lbas) || lbas.length !== disc.tracks + 1) return { error: 'Das Inhaltsverzeichnis der CD ist nicht lesbar.' }
  const rows = Array.isArray(body?.rows) ? body.rows : []
  const format = FORMATS[settings.format] ? settings.format : 'mp3'
  const ext = FORMATS[format].ext
  const albumArtist = text('albumArtist')
  const tracks = Array.from({ length: disc.tracks }, (_, i) => {
    const row = rows[i] && typeof rows[i] === 'object' ? rows[i] : {}
    const title = tagText(row.title)
    return {
      nr: i + 1,
      number: (disc.first ?? 1) + i,
      title,
      artist: tagText(row.artist) || albumArtist,
      bytes: (lbas[i + 1] - lbas[i]) * SECTOR_BYTES + WAV_HEADER,
      file: trackFileName(i + 1, title, ext),
    }
  })
  // a picture the user chose in the app's picker (an address of the box's own pictures): the file of the media/cover folder
  let cover = null
  if (typeof body?.image === 'string' && body.image !== '') {
    let name = ''
    try {
      name = decodeURIComponent(path.posix.basename(new URL(body.image, 'http://box').pathname))
    } catch {
      name = ''
    }
    if (!COVER_NAME.test(name)) return { error: 'Das Cover ist nicht zu lesen.' }
    cover = { kind: 'picked', file: path.join(mediaCover, name) }
  } else cover = { kind: 'disc' }
  return {
    plan: {
      dir: where.dir,
      format,
      bitrate: settings.bitrate,
      album,
      albumArtist,
      genre: text('genre'),
      year,
      tracks,
      cover,
      estimate: estimateBytes(format, settings.bitrate, lbas),
    },
  }
}

module.exports = { buildForm, parseRequest, CATEGORY_LABELS }
