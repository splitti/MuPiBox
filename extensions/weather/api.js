// The weather, API part: fetches the values of the chosen place from the chosen weather server and gives the display one plain answer
// (the same fields from either server), and searches places by name. Both servers are free and need no key.
//   GET /api/ext/weather/data           -> { configured, provider, place, timeText, temperature, humidity, windSpeed, windGust, windDir,
//                                            windDirAvg, pressure, rain24, rainKind, tempMin, tempMax, humMin, humMax, pressMin,
//                                            pressMax, trend: { temp, hum, press } (-1, 0, 1) }
//   GET /api/ext/weather/places?q=name  -> [{ label, values: { placeName, lat, lon } }]

// (what the box keeps of an answer at least: a display that asks every few seconds does not become a request to the weather server each time)
const MIN_CACHE_MS = 60 * 1000
const UNIT_MS = { seconds: 1000, minutes: 60 * 1000 }

/** How often the user lets the display ask (every N seconds or minutes): from 10 seconds to a day, 10 minutes when nothing is set. */
function intervalMs(s) {
  const every = Number(s?.refreshEvery)
  const ms = Number.isFinite(every) && every > 0 ? every * (UNIT_MS[s?.refreshUnit] ?? UNIT_MS.minutes) : 10 * UNIT_MS.minutes
  return Math.min(Math.max(Math.round(ms), 10 * 1000), 24 * 60 * 60 * 1000)
}
const TIMEOUT_MS = 15000
// (met.no asks every program to name itself: https://api.met.no/doc/TermsOfService)
const USER_AGENT = 'MuPiBox-weather-extension/1.0 github.com/Lippsson/MuPiBox'

const round = (value, digits = 1) => (Number.isFinite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : null)

/** The mean of directions in degrees (359° and 1° give 0°, not 180°); null for none. */
function circularMean(degrees) {
  const list = degrees.filter((d) => Number.isFinite(d))
  if (list.length === 0) return null
  const x = list.reduce((sum, d) => sum + Math.cos((d * Math.PI) / 180), 0)
  const y = list.reduce((sum, d) => sum + Math.sin((d * Math.PI) / 180), 0)
  if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9) return null
  return (Math.round((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360
}

/** -1, 0 or 1: the value fell, stayed or rose by at least `step` (the dials show it as an arrow); 0 when one of the values is missing. */
function trendOf(now, before, step) {
  if (!Number.isFinite(now) || !Number.isFinite(before)) return 0
  return now - before >= step ? 1 : before - now >= step ? -1 : 0
}

const minOf = (values) => round(Math.min(...values.filter((v) => Number.isFinite(v))))
const maxOf = (values) => round(Math.max(...values.filter((v) => Number.isFinite(v))))

/** Open-Meteo: measured values of now and the hours before (hourly, 24 h back). */
function parseOpenMeteo(body) {
  const c = body?.current
  if (!c || !Number.isFinite(c.temperature_2m)) throw new Error('no current values')
  const h = body.hourly ?? {}
  const times = Array.isArray(h.time) ? h.time : []
  // (the hours up to now; the last hour of the answer may lie ahead)
  const past = times.map((t, i) => i).filter((i) => String(times[i]).slice(0, 13) <= String(c.time).slice(0, 13))
  const series = (key, now) => [...past.map((i) => h[key]?.[i]), now].filter((v) => Number.isFinite(v))
  const temps = series('temperature_2m', c.temperature_2m)
  const hums = series('relative_humidity_2m', c.relative_humidity_2m)
  const press = series('pressure_msl', c.pressure_msl)
  // (the trend: now against three hours ago)
  const ago = (key) => h[key]?.[past[Math.max(0, past.length - 4)]]
  return {
    timeText: String(c.time).slice(11, 16),
    temperature: round(c.temperature_2m),
    humidity: round(c.relative_humidity_2m, 0),
    windSpeed: round(c.wind_speed_10m),
    windGust: round(c.wind_gusts_10m),
    windDir: round(c.wind_direction_10m, 0),
    windDirAvg: circularMean(past.slice(-3).map((i) => h.wind_direction_10m?.[i])) ?? round(c.wind_direction_10m, 0),
    pressure: round(c.pressure_msl),
    rain24: round(past.slice(-24).reduce((sum, i) => sum + (Number(h.precipitation?.[i]) || 0), 0)),
    rainKind: 'past',
    tempMin: minOf(temps),
    tempMax: maxOf(temps),
    humMin: minOf(hums),
    humMax: maxOf(hums),
    pressMin: minOf(press),
    pressMax: maxOf(press),
    trend: { temp: trendOf(c.temperature_2m, ago('temperature_2m'), 1), hum: trendOf(c.relative_humidity_2m, ago('relative_humidity_2m'), 5), press: trendOf(c.pressure_msl, ago('pressure_msl'), 1) },
  }
}

/** MET Norway: the model's values for now; the rain is the forecast of the next 24 hours (there are no values of the hours before). */
function parseMetNo(body) {
  const series = body?.properties?.timeseries
  const first = Array.isArray(series) ? series[0] : null
  const d = first?.data?.instant?.details
  if (!d || !Number.isFinite(d.air_temperature)) throw new Error('no current values')
  const day = series.slice(0, 24)
  const temps = day.map((e) => e?.data?.instant?.details?.air_temperature).filter((v) => Number.isFinite(v))
  const dirs = day.slice(0, 3).map((e) => e?.data?.instant?.details?.wind_from_direction)
  const at = (hour, key) => series[hour]?.data?.instant?.details?.[key]
  const all = (key) => day.map((e) => e?.data?.instant?.details?.[key])
  const kmh = (ms) => (Number.isFinite(ms) ? ms * 3.6 : NaN)
  return {
    timeText: new Date(first.time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    temperature: round(d.air_temperature),
    humidity: round(d.relative_humidity, 0),
    windSpeed: round(kmh(d.wind_speed)),
    windGust: round(kmh(d.wind_speed_of_gust)),
    windDir: round(d.wind_from_direction, 0),
    windDirAvg: circularMean(dirs) ?? round(d.wind_from_direction, 0),
    pressure: round(d.air_pressure_at_sea_level),
    rain24: round(day.reduce((sum, e) => sum + (Number(e?.data?.next_1_hours?.details?.precipitation_amount) || 0), 0)),
    rainKind: 'forecast',
    tempMin: minOf(temps),
    tempMax: maxOf(temps),
    humMin: minOf(all('relative_humidity')),
    humMax: maxOf(all('relative_humidity')),
    pressMin: minOf(all('air_pressure_at_sea_level')),
    pressMax: maxOf(all('air_pressure_at_sea_level')),
    // (the model has no hours before: the trend is where the next three hours go)
    trend: { temp: trendOf(at(3, 'air_temperature'), d.air_temperature, 1), hum: trendOf(at(3, 'relative_humidity'), d.relative_humidity, 5), press: trendOf(at(3, 'air_pressure_at_sea_level'), d.air_pressure_at_sea_level, 1) },
  }
}

/** A place from the geocoding answer of Open-Meteo, as the app lists it. */
function placeOf(r) {
  const label = [r.name, r.admin1, r.country].filter((p, i, all) => p && all.indexOf(p) === i).join(', ').slice(0, 120)
  return { label: `${label} (${round(r.latitude, 2)}, ${round(r.longitude, 2)})`, values: { placeName: label, lat: round(r.latitude, 4), lon: round(r.longitude, 4) } }
}

async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

const SOURCES = {
  openmeteo: async (lat, lon) =>
    parseOpenMeteo(
      await getJson(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,relative_humidity_2m,pressure_msl,precipitation,wind_direction_10m&past_hours=24&forecast_hours=1&wind_speed_unit=kmh&timezone=auto`,
      ),
    ),
  metno: async (lat, lon) => parseMetNo(await getJson(`https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`)),
}

exports.activate = (host) => {
  const cache = new Map() // provider:lat:lon -> { at, data, pending }

  async function current(provider, lat, lon, ttl) {
    const key = `${provider}:${lat}:${lon}`
    const entry = cache.get(key)
    if (entry?.data && Date.now() - entry.at < ttl) return entry.data
    // (several displays or a quick second tap: one request)
    if (entry?.pending) return entry.pending
    const pending = SOURCES[provider](lat, lon).then(
      (data) => {
        cache.set(key, { at: Date.now(), data })
        return data
      },
      (error) => {
        // (the server does not answer: the last values are better than none)
        if (entry?.data) {
          cache.set(key, { at: entry.at, data: entry.data })
          return { ...entry.data, stale: true }
        }
        cache.delete(key)
        throw error
      },
    )
    cache.set(key, { at: entry?.at ?? 0, data: entry?.data, pending })
    return pending
  }

  host.route('get', '/data', async (_req, res) => {
    const s = await host.settings()
    const provider = s.provider === 'metno' ? 'metno' : 'openmeteo'
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) {
      res.set('Cache-Control', 'no-store').json({ configured: false })
      return
    }
    try {
      const data = await current(provider, s.lat, s.lon, Math.max(intervalMs(s), MIN_CACHE_MS))
      res.set('Cache-Control', 'no-store').json({ configured: true, provider, place: s.placeName || '', ...data })
    } catch (error) {
      host.log.warn(`[Extension weather] ${provider}: ${error}`)
      res.status(502).set('Cache-Control', 'no-store').json({ configured: true, error: 'no answer from the weather server' })
    }
  })

  host.route('get', '/places', async (req, res) => {
    const q = String(req.query.q ?? '').trim().slice(0, 80)
    if (q.length < 2) {
      res.json([])
      return
    }
    try {
      const body = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=de&format=json`)
      res.json((Array.isArray(body?.results) ? body.results : []).filter((r) => Number.isFinite(r?.latitude) && Number.isFinite(r?.longitude)).map(placeOf))
    } catch (error) {
      host.log.warn(`[Extension weather] place search: ${error}`)
      res.status(502).json({ error: 'search failed' })
    }
  })
}

exports._test = { parseOpenMeteo, parseMetNo, circularMean, placeOf, trendOf, intervalMs }
