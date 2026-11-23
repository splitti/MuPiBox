import { WinampMainView, MAIN_W, MAIN_H } from '../../src/frontend-box/src/app/winamp/winamp-main-view'
import { WinampEqView, EQ_W, EQ_H } from '../../src/frontend-box/src/app/winamp/winamp-eq-view'
import { WinampPlaylistView, PL_W, PL_H, PLAYLIST_CSS } from '../../src/frontend-box/src/app/winamp/winamp-playlist-view'
import { Skin, WINAMP_BASE_CSS, type SkinMeta } from '../../src/frontend-box/src/app/winamp/winamp-skin'

const style = document.createElement('style')
style.textContent = WINAMP_BASE_CSS + PLAYLIST_CSS
document.head.appendChild(style)

const meta = (await (await fetch('skin/skin.json')).json()) as SkinMeta
const skin = new Skin(meta, 'skin')
const noop = () => undefined
const scale = 960 / MAIN_W
const place = (host: HTMLElement, node: HTMLElement, w: number, h: number) => {
  node.style.transform = `scale(${scale})`
  node.style.left = '0px'
  node.style.top = `${Math.round((480 - h * scale) / 2)}px`
  host.appendChild(node)
}
const main = new WinampMainView(skin, {
  prev: noop, play: noop, pause: noop, stop: noop, next: noop, eject: noop, seek: noop, setVolume: noop, setBalance: noop,
  toggleShuffle: noop, toggleRepeat: noop, toggleEq: noop, togglePlaylist: noop, menu: noop, minimize: noop, shade: noop, close: noop, clutter: noop,
})
place(document.getElementById('left')!, main.node, MAIN_W, MAIN_H)
main.update({ title: '4. Crusher-P - Echo (3:50)', playState: 'play', positionSeconds: 111, durationSeconds: 230, volume: 70, balance: 0, bitrate: 128, khz: 48, channels: 2, eqOpen: true })
const which = new URLSearchParams(location.search).get('right') ?? 'eq'
if (which === 'pl') {
  const noopAll = new Proxy({}, { get: () => noop }) as never
  const pl = new WinampPlaylistView(skin, noopAll)
  pl.setEntries(Array.from({ length: 14 }, (_, i) => ({ position: i + 1, name: `Track number ${i + 1} of the album`, artist: i % 2 ? 'Some Artist' : undefined, duration: 120 + i * 17 })), 4)
  pl.setTime('1:51/42:10')
  const scale = 960 / PL_W
  pl.node.style.transform = `scale(${scale})`
  pl.node.style.top = `${Math.round((480 - PL_H * scale) / 2)}px`
  document.getElementById('right')!.appendChild(pl.node)
} else {
  const eq = new WinampEqView(skin, noop, noop)
  eq.setState({ on: true, auto: false, preamp: 3, bands: [4, 2, 0, -3, -5, -2, 3, 6, 8, 9] })
  place(document.getElementById('right')!, eq.node, EQ_W, EQ_H)
}
;(window as unknown as { main: unknown }).main = main
