const id = (val) => val

// B7: previous parseString was a blind `str.slice(1, -1)` — strips the
// FIRST and LAST characters whether or not they're actually quotes.
// mplayer's slave-protocol responses for `get_meta_*` ARE wrapped in
// double quotes, but the wrapper isn't guaranteed (some mplayer
// builds emit unquoted strings, ANS_-property responses are bare,
// and edge cases — empty strings, partial outputs — would have us
// silently strip real characters). Check the wrapper first; if it's
// not a `"…"` pair, return the input untouched.
const parseString = (str) => {
  if (typeof str !== 'string') return ''
  if (str.length >= 2 && str.startsWith('"') && str.endsWith('"')) {
    return str.slice(1, -1)
  }
  return str
}

const parseFlag = (str) => typeof str === 'string' && str.toLowerCase().trim() === 'yes'

const knownMetaProps = ['Title', 'Artist', 'Album', 'Year', 'Comment', 'Genre']

// B7: parseStringList consumes mplayer's `metadata` response which
// concatenates fields as comma-separated `Title,<v>,Artist,<v>,…`.
// The previous implementation split on a literal `,` — which goes
// wrong as soon as a field VALUE contains a comma (e.g. an album
// titled "Foo, Vol. 2" or an artist "Bach, Johann Sebastian"). We
// can't fix the underlying ambiguity (mplayer's protocol is what it
// is), but we can be more defensive: re-join everything between two
// known meta-prop markers as the value, so a comma INSIDE a value
// gets preserved instead of treated as a delimiter. Loses only when
// a value happens to start with one of knownMetaProps verbatim — far
// less likely than commas in titles.
const parseStringList = (str) => {
  const res = Object.create(null)
  if (typeof str !== 'string') return res
  const parts = str.split(',')
  let metaProp = null
  let buffer = []
  const flush = () => {
    if (metaProp != null && buffer.length > 0) {
      res[metaProp] = buffer.join(',')
      buffer = []
    }
  }
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (knownMetaProps.includes(part)) {
      flush()
      metaProp = part
    } else if (metaProp) {
      buffer.push(part)
    }
  }
  flush()
  return res
}

module.exports = {
  osdlevel: Number.parseInt,
  loop: Number.parseInt,
  speed: Number.parseFloat,
  filename: id, // `get_property filename`
  FILENAME: parseString, // `get_file_name`
  path: id,
  demuxer: id,
  stream_pos: Number.parseFloat,
  stream_start: Number.parseFloat,
  stream_end: Number.parseFloat,
  stream_length: Number.parseFloat,
  stream_time_pos: Number.parseFloat,
  length: Number.parseFloat, // `get_property length`
  LENGTH: Number.parseFloat, // `get_time_length`
  percent_pos: Number.parseInt, // `get_property percent_pos`
  PERCENT_POSITION: Number.parseFloat, // `get_percent_pos`
  time_pos: Number.parseFloat,
  TIME_POSITION: Number.parseFloat, // `get_time_pos`
  chapter: Number.parseInt,
  titles: Number.parseInt,
  chapters: Number.parseInt,
  angle: Number.parseInt,
  metadata: parseStringList,
  META_ALBUM: parseString, // `get_meta_album`
  META_ARTIST: parseString, // `get_meta_artist`
  META_COMMENT: parseString, // `get_meta_comment`
  META_GENRE: parseString, // `get_meta_genre`
  META_TITLE: parseString, // `get_meta_title`
  META_TRACK: parseString, // `get_meta_track`
  META_YEAR: parseString, // `get_meta_year`
  pause: parseFlag,
  capturing: parseFlag,
  volume: Number.parseFloat,
  mute: parseFlag,
  audio_delay: Number.parseFloat,
  audio_format: Number.parseInt,
  audio_codec: id,
  audio_bitrate: Number.parseInt,
  // todo: AUDIO_BITRATE from `get_audio_bitrate`
  AUDIO_CODEC: parseString, // `get_audio_codec`
  samplerate: Number.parseInt,
  channels: Number.parseInt,
  switch_audio: Number.parseInt,
  balance: Number.parseFloat,
  fullscreen: parseFlag,
  deinterlace: parseFlag,
  ontop: parseFlag,
  rootwin: parseFlag,
  border: parseFlag,
  framedropping: Number.parseInt,
  gamma: Number.parseInt,
  brightness: Number.parseInt,
  contrast: Number.parseInt,
  saturation: Number.parseInt,
  hue: Number.parseInt,
  panscan: Number.parseFloat,
  vsync: parseFlag,
  video_format: Number.parseInt,
  VIDEO_RESOLUTION: parseString, // `get_video_resolution`
  video_codec: id,
  VIDEO_CODEC: parseString, // `get_video_codec`
  video_bitrate: Number.parseInt,
  // todo: VIDEO_BITRATE from `get_video_bitrate`
  width: Number.parseInt,
  height: Number.parseInt,
  fps: Number.parseFloat,
  aspect: Number.parseFloat,
  switch_video: Number.parseInt,
  switch_program: Number.parseInt,
  sub: Number.parseInt,
  sub_source: Number.parseInt,
  sub_vob: Number.parseInt,
  sub_demux: Number.parseInt,
  sub_file: Number.parseInt,
  sub_delay: Number.parseFloat,
  sub_pos: Number.parseInt,
  sub_alignment: Number.parseInt,
  sub_visibility: parseFlag,
  sub_forced_only: parseFlag,
  tv_brightness: Number.parseInt,
  tv_contrast: Number.parseInt,
  tv_saturation: Number.parseInt,
  tv_hue: Number.parseInt,
  teletext_page: Number.parseInt,
  teletext_subpage: Number.parseInt,
  teletext_mode: parseFlag,
  teletext_format: Number.parseInt,
  teletext_half_page: Number.parseInt,
}
