// node --test extensions/clock/test
const test = require('node:test')
const assert = require('node:assert/strict')

const load = () => import('../display.js')
const at = (h, m) => new Date(2026, 9, 27, h, m)

test('writes 24 hours with two digits and 12 hours with AM / PM', async () => {
  const { digitalTime } = await load()
  assert.deepEqual(digitalTime(at(7, 5), 24), { time: '07:05', suffix: '' })
  assert.deepEqual(digitalTime(at(0, 5), 12), { time: '12:05', suffix: 'AM' })
  assert.deepEqual(digitalTime(at(12, 30), 12), { time: '12:30', suffix: 'PM' })
  assert.deepEqual(digitalTime(at(21, 15), 12), { time: '9:15', suffix: 'PM' })
})

test('turns the hands of the dial; the hour hand moves on with the minutes', async () => {
  const { analogAngles } = await load()
  assert.deepEqual(analogAngles(at(3, 0)), { hour: 90, minute: 0 })
  assert.deepEqual(analogAngles(at(21, 30)), { hour: 285, minute: 180 })
  assert.deepEqual(analogAngles(at(12, 0)), { hour: 0, minute: 0 })
})

test('takes the defaults (digits, 24 hours) for anything missing or odd', async () => {
  const { clockSettings } = await load()
  assert.deepEqual(clockSettings(undefined), { style: 'digital', hours: 24 })
  assert.deepEqual(clockSettings({ style: 'analog', hours: 12 }), { style: 'analog', hours: 12 })
  assert.deepEqual(clockSettings({ style: 'roman', hours: 7 }), { style: 'digital', hours: 24 })
})
