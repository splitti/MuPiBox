// "Abends dunkler" - the window that starts at sunset: the sunset worked out from the place, and what the display does around it.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { NIGHT_DIM_DEFAULT, nightBrightness, nightDimOf, parseNightDim, sunriseLabel, sunriseMinutes, sunriseUtcMinutes, sunsetLabel, sunsetMinutes, sunsetUtcMinutes, type NightDim } from './app-api/night-dim'

const BERLIN = { lat: 52.52, lon: 13.405 }
// (minutes after midnight UTC for a clock "HH:MM")
const utc = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const near = (actual: number | null, hhmm: string, within = 4) => assert.ok(actual !== null && Math.abs(actual - utc(hhmm)) <= within, `${actual} is not within ${within} min of ${hhmm}`)

describe('the sunset of a place', () => {
  it('matches the tables (within a few minutes): Berlin, Sydney, New York', () => {
    near(sunsetUtcMinutes(BERLIN.lat, BERLIN.lon, 2026, 6, 21), '19:33') // 21:33 CEST
    near(sunsetUtcMinutes(BERLIN.lat, BERLIN.lon, 2026, 12, 21), '14:54') // 15:54 CET
    near(sunsetUtcMinutes(-33.87, 151.21, 2026, 12, 21), '09:05') // 20:05 AEDT
    near(sunsetUtcMinutes(40.71, -74.0, 2026, 3, 21), '23:07') // 19:07 EDT
  })

  it('matches the tables for the sunrise too', () => {
    near(sunriseUtcMinutes(BERLIN.lat, BERLIN.lon, 2026, 6, 21), '02:47') // 04:47 CEST
    near(sunriseUtcMinutes(BERLIN.lat, BERLIN.lon, 2026, 12, 21), '07:16') // 08:16 CET
    assert.ok(Math.abs((sunriseUtcMinutes(-33.87, 151.21, 2026, 12, 21) as number) + 1440 - utc('18:41')) <= 4) // 05:41 AEDT, the evening before in UTC
  })

  it('is none where the sun does not set: polar day and polar night', () => {
    assert.strictEqual(sunsetUtcMinutes(69.65, 18.96, 2026, 6, 21), null)
    assert.strictEqual(sunsetUtcMinutes(69.65, 18.96, 2026, 12, 21), null)
  })

  it('is a minute of the local day, and a label for the page', () => {
    const minutes = sunsetMinutes(BERLIN.lat, BERLIN.lon, new Date(2026, 5, 21, 12))
    assert.ok(minutes !== null && minutes >= 0 && minutes < 1440)
    const nd = { ...NIGHT_DIM_DEFAULT, lat: BERLIN.lat, lon: BERLIN.lon }
    assert.match(String(sunsetLabel(nd, new Date(2026, 5, 21, 12))), /^\d\d:\d\d$/)
    assert.match(String(sunriseLabel(nd, new Date(2026, 5, 21, 12))), /^\d\d:\d\d$/)
    assert.strictEqual(sunsetLabel(NIGHT_DIM_DEFAULT, new Date()), null, 'no place, no sunset')
    assert.strictEqual(sunriseLabel(NIGHT_DIM_DEFAULT, new Date()), null)
    assert.strictEqual(sunsetLabel({ ...NIGHT_DIM_DEFAULT, lat: 69.65, lon: 18.96 }, new Date(2026, 5, 21, 12)), '', 'the sun does not set')
  })
})

describe('the window from sunset', () => {
  const day = new Date(2026, 5, 21, 12)
  const sunset = sunsetMinutes(BERLIN.lat, BERLIN.lon, day) as number
  const at = (minutes: number) => new Date(2026, 5, 21, Math.floor(minutes / 60), minutes % 60)
  const nd: NightDim = { ...NIGHT_DIM_DEFAULT, enabled: true, from: '23:00', to: '05:00', level: 30, fade: 0, sunset: true, lat: BERLIN.lat, lon: BERLIN.lon, place: 'Berlin' }

  it('dims at sunset and later - not before - and not any more when the window ends', () => {
    assert.deepStrictEqual(nightBrightness(nd, 100, at(sunset - 5), false), { value: 100, dimmed: false })
    assert.deepStrictEqual(nightBrightness(nd, 100, at(sunset), false), { value: 30, dimmed: true })
    assert.deepStrictEqual(nightBrightness(nd, 100, at(sunset + 1), false), { value: 30, dimmed: true })
    // (after midnight it still dims, the next morning it is over)
    assert.strictEqual(nightBrightness(nd, 100, new Date(2026, 5, 22, 1, 0), false).dimmed, true)
    assert.strictEqual(nightBrightness(nd, 100, new Date(2026, 5, 22, 5, 30), false).dimmed, false)
  })

  it('ends at sunrise, not at the fixed "to" time', () => {
    const rise = sunriseMinutes(BERLIN.lat, BERLIN.lon, day) as number
    const morning = (minutes: number) => new Date(2026, 5, 22, Math.floor(minutes / 60), minutes % 60)
    const late = { ...nd, to: '09:00' }
    assert.strictEqual(nightBrightness(late, 100, morning(rise - 5), false).dimmed, true)
    assert.strictEqual(nightBrightness(late, 100, morning(rise + 5), false).dimmed, false, 'sunrise ends it although "to" says 09:00')
    const early = { ...nd, to: '03:00' }
    assert.strictEqual(nightBrightness(early, 100, morning(rise - 5), false).dimmed, true, 'and "to" at 03:00 does not end it earlier')
  })

  it('dims gradually from the sunset on', () => {
    const slow = { ...nd, fade: 30 }
    assert.strictEqual(nightBrightness(slow, 100, at(sunset), false).value, 100)
    assert.strictEqual(nightBrightness(slow, 100, at(sunset + 15), false).value, 65)
    assert.strictEqual(nightBrightness(slow, 100, at(sunset + 30), false).value, 30)
  })

  it('uses the fixed time without a place, or with the switch off, and when the sun does not set', () => {
    const noPlace = { ...nd, lat: null, lon: null }
    assert.strictEqual(nightBrightness(noPlace, 100, new Date(2026, 5, 21, 22, 0), false).dimmed, false)
    assert.strictEqual(nightBrightness(noPlace, 100, new Date(2026, 5, 21, 23, 0), false).dimmed, true)
    const off = { ...nd, sunset: false }
    assert.strictEqual(nightBrightness(off, 100, at(sunset + 1), false).dimmed, sunset + 1 >= 23 * 60)
    const polar = { ...nd, lat: 69.65, lon: 18.96 }
    assert.strictEqual(nightBrightness(polar, 100, new Date(2026, 5, 21, 23, 0), false).dimmed, true, 'the fixed times take over')
    assert.strictEqual(nightBrightness(polar, 100, new Date(2026, 5, 22, 5, 30), false).dimmed, false)
  })
})

describe('the setting', () => {
  const ok = { enabled: true, from: '19:00', to: '07:00', level: 30, fade: 30, withQuiet: false }

  it('is read with the new fields, and an old setting is read as before', () => {
    assert.deepStrictEqual(nightDimOf({ mupibox: { nightDim: ok } }), { ...ok, sunset: false, lat: null, lon: null, place: '' })
    const placed = nightDimOf({ mupibox: { nightDim: { ...ok, sunset: true, lat: 52.52, lon: 13.405, place: 'Berlin' } } })
    assert.deepStrictEqual([placed.sunset, placed.lat, placed.lon, placed.place], [true, 52.52, 13.405, 'Berlin'])
    const bad = nightDimOf({ mupibox: { nightDim: { ...ok, lat: 91, lon: 'x', place: 7 } } })
    assert.deepStrictEqual([bad.lat, bad.lon, bad.place], [null, null, ''])
  })

  it('is taken from the app only when it is right: coordinates in range, both or none, sunset needs a place', () => {
    assert.ok(parseNightDim({ ...ok }))
    assert.ok(parseNightDim({ ...ok, sunset: true, lat: 52.52, lon: 13.405, place: 'Berlin' }))
    assert.ok(parseNightDim({ ...ok, lat: null, lon: null, sunset: false }))
    assert.strictEqual(parseNightDim({ ...ok, sunset: true }), null, 'no place')
    assert.strictEqual(parseNightDim({ ...ok, lat: 52.52 }), null, 'one coordinate')
    assert.strictEqual(parseNightDim({ ...ok, lat: 91, lon: 0 }), null)
    assert.strictEqual(parseNightDim({ ...ok, lat: 0, lon: 181 }), null)
    assert.strictEqual(parseNightDim({ ...ok, lat: '52', lon: '13' }), null)
    assert.strictEqual(parseNightDim({ ...ok, sunset: 'yes', lat: 1, lon: 1 }), null)
    assert.strictEqual(parseNightDim({ ...ok, place: 7 }), null)
    assert.strictEqual(parseNightDim({ ...ok, lat: 1, lon: 1, place: `Ber\nlin${'x'.repeat(200)}` })?.place.includes('\n'), false)
    assert.ok((parseNightDim({ ...ok, lat: 1, lon: 1, place: 'x'.repeat(200) })?.place.length ?? 0) <= 80)
  })
})
