// How much larger than the design size (800 x 480) the display draws its page: the resolution set in the app
// (chromium.resX / resY) divided by 800 x 480, the smaller of the two, never below 1 (chromium-autostart.sh starts
// Chromium with it as --force-device-scale-factor). 1280 x 720 (Raspberry Pi Touch Display 2): 1.5, the page is then
// 853 x 480. Covers are made that much larger, so they stay sharp.
export function uiScale(cfg: unknown): number {
  const chromium = (cfg as { chromium?: { resX?: unknown; resY?: unknown } } | undefined)?.chromium
  const x = Number(chromium?.resX)
  const y = Number(chromium?.resY)
  if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) return 1
  const scale = Math.min(x / 800, y / 480)
  return scale > 1 ? Math.min(Math.round(scale * 100) / 100, 3) : 1
}
