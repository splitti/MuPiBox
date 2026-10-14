// The volumes this server sets, one after the other: the app's slider, Home Assistant, and the lowering after a new
// hearing protection. Each one reads the maximum inside its turn - two overlapping saves of the maximum (60 %, then
// 20 %) could otherwise end with the older, higher one written last, and 60 % played while 20 % was saved.
let chain: Promise<unknown> = Promise.resolve()

export function withVolumeLock<T>(fn: () => Promise<T>): Promise<T> {
  const turn = chain.then(fn)
  chain = turn.catch(() => undefined)
  return turn
}
