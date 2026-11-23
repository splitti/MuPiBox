// The shuffle's choice of the next track (src/shuffle.js): no engine needed, runs anywhere (npm test).
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createShuffler } = require('../src/shuffle.js')

// a play-through: "next" until the album ends; returns the order in which the tracks came
function playThrough(count, repeat = false, rounds = 1, random = Math.random) {
  const s = createShuffler(random)
  let current = Math.floor(random() * count)
  s.visit(current)
  const order = [current]
  for (let guard = 0; guard < count * rounds * 3; guard++) {
    const next = s.next(current, count, repeat)
    if (next < 0) break
    s.visit(next)
    order.push(next)
    current = next
    if (order.length >= count * rounds) break
  }
  return order
}

test('every track comes exactly once in a round, whatever the chance', () => {
  for (let run = 0; run < 200; run++) {
    const order = playThrough(10)
    assert.equal(order.length, 10)
    assert.deepEqual([...order].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  }
})

test('the album ends when the round is over (no repeat)', () => {
  const s = createShuffler()
  s.visit(0)
  s.visit(1)
  s.visit(2)
  assert.equal(s.next(2, 3, false), -1)
})

test('with repeat a new round starts and nothing is played twice in a row', () => {
  const order = playThrough(5, true, 4)
  assert.equal(order.length, 20)
  for (let i = 1; i < order.length; i++) assert.notEqual(order[i], order[i - 1])
  // (the track that ends a round also opens the next one, so the rounds overlap by one: of 20 plays each track is 3-5 times)
  for (let t = 0; t < 5; t++) {
    const n = order.filter((i) => i === t).length
    assert.ok(n >= 3 && n <= 5, `track ${t} played ${n} times`)
  }
})

test('a track chosen in the list counts as played', () => {
  const s = createShuffler(() => 0)
  s.visit(0)
  s.visit(3) // tapped in the playlist
  // chance 0 takes the first open one: 1, then 2, then (4 after 2 - 3 is played)
  assert.equal(s.next(3, 5), 1)
  s.visit(1)
  assert.equal(s.next(1, 5), 2)
  s.visit(2)
  assert.equal(s.next(2, 5), 4)
})

test('previous goes back through what was played, in order', () => {
  const s = createShuffler()
  for (const i of [4, 1, 3]) s.visit(i)
  assert.equal(s.previous(), 1)
  assert.equal(s.previous(), 4)
  assert.equal(s.previous(), -1)
})

test('after going back, next still avoids the tracks played in the round', () => {
  const s = createShuffler(() => 0)
  for (const i of [2, 0, 1]) s.visit(i)
  assert.equal(s.previous(), 0)
  s.visit(0)
  // 2, 0 and 1 are played: of five tracks 3 comes next
  assert.equal(s.next(0, 5), 3)
})

test('one track or none: nothing to choose', () => {
  assert.equal(createShuffler().next(0, 1), -1)
  assert.equal(createShuffler().next(-1, 0), -1)
})

test('reset forgets the round (a new album)', () => {
  const s = createShuffler(() => 0)
  s.visit(0)
  s.visit(1)
  s.reset()
  assert.equal(s.playedCount, 0)
  assert.equal(s.next(0, 2), 1)
})
