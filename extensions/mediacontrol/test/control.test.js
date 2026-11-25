// node --test extensions/mediacontrol/test
const test = require('node:test')
const assert = require('node:assert/strict')

const load = () => import('../control-logic.js')
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} is not ${b}`)

test('has no step for a tap or a little pull, 2x early (30 % of the stretch of the button) and 4x from the full stretch', async () => {
  const { stageFor } = await load()
  // (the full stretch of the button is about 10.8 % of the control's width: 32.5 px at 300 px)
  assert.equal(stageFor(0, 300), 0)
  assert.equal(stageFor(7, 300), 0)
  assert.equal(stageFor(10, 300), 1)
  assert.equal(stageFor(32, 300), 1)
  assert.equal(stageFor(33, 300), 2)
  assert.equal(stageFor(200, 300), 2)
})

test('moves the place on top of the normal playing: forward gains, back loses', async () => {
  const { scrubSeconds } = await load()
  // 2x forward: one second more per second; 4x: three; back at 2x: three less (the playing itself still adds one); 4x back: five
  near(scrubSeconds(1, 1, 1000), 1)
  near(scrubSeconds(1, 2, 1000), 3)
  near(scrubSeconds(-1, 1, 1000), -3)
  near(scrubSeconds(-1, 2, 1000), -5)
  assert.equal(scrubSeconds(1, 0, 1000), 0)
  near(scrubSeconds(-1, 2, 250), -1.25)
})

test('reads the place on the ring clockwise from the top', async () => {
  const { percentAt } = await load()
  near(percentAt(0, -10), 0)
  near(percentAt(10, 0), 25)
  near(percentAt(0, 10), 50)
  near(percentAt(-10, 0), 75)
})

test('tells the ring from the pad', async () => {
  const { onRing } = await load()
  assert.equal(onRing(0.2), false)
  assert.equal(onRing(0.42), true)
  assert.equal(onRing(0.55), false)
})

test('draws a closed wedge', async () => {
  const { sectorPath } = await load()
  for (const angle of [0, 90, 180, 270]) {
    const path = sectorPath(angle)
    assert.ok(path.startsWith('M') && path.endsWith('Z'))
    assert.ok(!path.includes('NaN'))
  }
})

test('names the wind modes the box understands and cycles the repeat modes', async () => {
  const { windMode, nextRepeat } = await load()
  assert.equal(windMode(1, 1), 'f2')
  assert.equal(windMode(1, 2), 'f4')
  assert.equal(windMode(-1, 1), 'b2')
  assert.equal(windMode(-1, 2), 'b4')
  assert.equal(nextRepeat('off'), 'all')
  assert.equal(nextRepeat('all'), 'one')
  assert.equal(nextRepeat('one'), 'off')
})

test('takes 1, 2 or 3 seconds for the hold, anything else is 2', async () => {
  const { holdMs } = await load()
  assert.equal(holdMs({ holdSeconds: 1 }), 1000)
  assert.equal(holdMs({ holdSeconds: 3 }), 3000)
  assert.equal(holdMs({ holdSeconds: 7 }), 2000)
  assert.equal(holdMs(undefined), 2000)
})
