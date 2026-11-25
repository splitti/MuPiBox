import { MediaControlComponent, sectorPath } from './media-control.component'

describe('MediaControlComponent (the pure parts)', () => {
  it('has no step for a tap or a little pull, then 2× and 4× for a longer one', () => {
    expect(MediaControlComponent.stageFor(0, 300)).toBe(0)
    expect(MediaControlComponent.stageFor(10, 300)).toBe(0)
    expect(MediaControlComponent.stageFor(22, 300)).toBe(1)
    expect(MediaControlComponent.stageFor(47, 300)).toBe(1)
    expect(MediaControlComponent.stageFor(49, 300)).toBe(2)
    expect(MediaControlComponent.stageFor(200, 300)).toBe(2)
  })

  it('moves the place on top of the normal playing: forward gains, back loses', () => {
    // 2× forward: one second more per second; 4×: three; back at 2×: three less (the playing itself still adds one); 4× back: five
    expect(MediaControlComponent.scrubSeconds(1, 1, 1000)).toBeCloseTo(1)
    expect(MediaControlComponent.scrubSeconds(1, 2, 1000)).toBeCloseTo(3)
    expect(MediaControlComponent.scrubSeconds(-1, 1, 1000)).toBeCloseTo(-3)
    expect(MediaControlComponent.scrubSeconds(-1, 2, 1000)).toBeCloseTo(-5)
    expect(MediaControlComponent.scrubSeconds(1, 0, 1000)).toBe(0)
    expect(MediaControlComponent.scrubSeconds(-1, 2, 250)).toBeCloseTo(-1.25)
  })

  it('reads the place on the ring clockwise from the top', () => {
    expect(MediaControlComponent.percentAt(0, -10)).toBeCloseTo(0)
    expect(MediaControlComponent.percentAt(10, 0)).toBeCloseTo(25)
    expect(MediaControlComponent.percentAt(0, 10)).toBeCloseTo(50)
    expect(MediaControlComponent.percentAt(-10, 0)).toBeCloseTo(75)
  })

  it('tells the ring from the pad', () => {
    expect(MediaControlComponent.onRing(0.2)).toBe(false)
    expect(MediaControlComponent.onRing(0.42)).toBe(true)
    expect(MediaControlComponent.onRing(0.55)).toBe(false)
  })

  it('draws a closed segment', () => {
    const path = sectorPath(90)
    expect(path.startsWith('M')).toBe(true)
    expect(path.endsWith('Z')).toBe(true)
    expect(path).not.toContain('NaN')
  })
})
