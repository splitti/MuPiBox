import { albumsPerView } from './photo-albums.component'

describe('albumsPerView', () => {
  it('shows three stacks on the 5" display (800 px) and on anything narrower', () => {
    expect(albumsPerView(800)).toBe(3)
    expect(albumsPerView(480)).toBe(3)
    expect(albumsPerView(0)).toBe(3)
    expect(albumsPerView(Number.NaN)).toBe(3)
  })

  it('shows more on a wider display, so a stack keeps the distance of the 5" display', () => {
    expect(albumsPerView(1024)).toBe(4)
    expect(albumsPerView(1280)).toBe(5)
    expect(albumsPerView(1920)).toBe(7)
  })

  it('never packs the stacks closer than the stack and a small gap', () => {
    for (let w = 800; w <= 3840; w += 10) expect(w / albumsPerView(w)).toBeGreaterThanOrEqual(244)
  })

  it('keeps the distance near the one of the 5" display (267 px; up to 325 px just before the fourth stack fits)', () => {
    for (let w = 800; w <= 3840; w += 10) expect(w / albumsPerView(w)).toBeLessThan(330)
  })
})
