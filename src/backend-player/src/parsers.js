const id = (val) => val

const parseString = (str) => str.slice(1, -1)

const parseFlag = (str) => str.toLowerCase().trim() === 'yes'

const knownMetaProps = ['Title', 'Artist', 'Album', 'Year', 'Comment', 'Genre']

const parseStringList = (str) => {
  const res = Object.create(null)
  const parts = str.split(',')
  let metaProp = null
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (knownMetaProps.includes(part)) {
      metaProp = part
    } else if (metaProp) {
      if (!res[metaProp]) res[metaProp] = part
      else res[metaProp] += `,${part}`
    }
  }
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
