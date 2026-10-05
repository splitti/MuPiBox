// The theme "custom" (Eigenes): the parents' own picture plus a few settings of their own - light or dark writing,
// a veil over the picture, an accent colour, the font and size of the names. The app keeps them in
// mupibox.customTheme and the backend writes them as a small stylesheet next to the picture
// (theme-data/custom/custom-settings.css); the display adds it while the theme is "custom" (km-theme.service.ts).
// Only this theme has these settings: the others stay as they are designed.

export type CustomFont = 'fredoka' | 'baloo' | 'nunito' | 'rye'
export interface CustomTheme {
  /** what the parents chose: auto = from the picture's brightness (measured by the app) */
  mode: 'auto' | 'light' | 'dark'
  /** what is used: light = dark writing on a light picture, dark = light writing on a dark picture */
  resolved: 'light' | 'dark'
  /** veil over the picture in percent (dark writing: a light veil, light writing: a dark one) */
  veil: number
  /** accent (chosen tab, play button, progress); null = the variant's own */
  accent: string | null
  font: CustomFont
  size: 's' | 'm' | 'l'
  /** changes with every save: the display loads the stylesheet again */
  v: number
}

export const CUSTOM_THEME_CSS = '/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/custom/custom-settings.css'
export const CUSTOM_THEME_DEFAULTS: CustomTheme = { mode: 'auto', resolved: 'dark', veil: 0, accent: null, font: 'fredoka', size: 'm', v: 0 }

const FONTS: Record<CustomFont, { family: string; face?: string; weight: number }> = {
  fredoka: { family: '"Fredoka", sans-serif', weight: 600 },
  baloo: { family: '"Baloo 2", "Fredoka", sans-serif', face: '@font-face { font-family: "Baloo 2"; src: url("/theme-data/_fonts/Baloo2-Variable.ttf") format("truetype"); font-weight: 400 800; font-display: block; }', weight: 700 },
  nunito: { family: '"Nunito Sans", "Fredoka", sans-serif', face: '@font-face { font-family: "Nunito Sans"; src: url("/theme-data/_fonts/nunito-sans-latin-wght-normal.woff2") format("woff2"); font-weight: 200 1000; font-display: block; }', weight: 800 },
  rye: { family: '"Rye", "Fredoka", serif', face: '@font-face { font-family: "Rye"; src: url("/theme-data/steampunk/Rye-Regular.ttf") format("truetype"); font-display: block; }', weight: 400 },
}
const SIZES = { s: 18, m: 21, l: 24 }

/** The settings as stored, with the defaults for what is missing or not valid. */
export function customThemeOf(value: unknown): CustomTheme {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const pick = <T extends string>(x: unknown, list: readonly T[], fallback: T): T => (list.includes(x as T) ? (x as T) : fallback)
  const veil = typeof v.veil === 'number' && Number.isFinite(v.veil) ? Math.round(Math.max(0, Math.min(70, v.veil))) : 0
  return {
    mode: pick(v.mode, ['auto', 'light', 'dark'] as const, 'auto'),
    resolved: pick(v.resolved, ['light', 'dark'] as const, 'dark'),
    veil,
    accent: typeof v.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.accent) ? v.accent.toUpperCase() : null,
    font: pick(v.font, ['fredoka', 'baloo', 'nunito', 'rye'] as const, 'fredoka'),
    size: pick(v.size, ['s', 'm', 'l'] as const, 'm'),
    v: typeof v.v === 'number' && Number.isFinite(v.v) ? v.v : 0,
  }
}

// ---------- colours ----------
const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
const hexOf = (c: number[]) => `#${c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((x) => {
    const s = x / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
const mix = (hex: string, to: number[], f: number) => hexOf(rgb(hex).map((c, i) => c + (to[i] - c) * f))
const INK = '#1A1A1A'
/** An accent the dark symbols on it can be read on (the chosen tab and the play button show INK on it): lighter until they can. */
export function readableAccent(hex: string): string {
  let c = hex
  for (let i = 0; i < 20 && contrast(c, INK) < 4.5; i++) c = mix(c, [255, 255, 255], 0.12)
  return c
}

// ---------- the stylesheet ----------
const LIGHT = `--km-night: #F2F2F2; --km-night-2: rgba(255,255,255,.72); --km-night-3: #FFFFFF; --km-night-4: #E4E4E4; --km-stack-1: #FFFFFF; --km-stack-2: #D8D8D8; --km-shadow: rgba(0,0,0,.25); --km-overlay: rgba(255,255,255,.82); --km-cream: #FFFFFF; --km-ring: #FFFFFF; --km-ink: #1A1A1A; --km-lavender: #4A4A4A; --km-apricot: #FFCF6E; --km-apricot-shadow: #C99A3A; --km-moon: #FFE9A0; --km-rose: #E5484D; --km-on-bg: #1A1A1A; --km-sync-bg: #4A4A4A; --km-sync-fg: #FFFFFF;
  --km-band: rgba(255,255,255,.6); --km-on-band: #1A1A1A; --km-on-band-2: #4A4A4A; --km-btn: #FFFFFF; --km-on-btn: #1A1A1A; --km-tab-idle: #1A1A1A; --km-on-pill: #1A1A1A;`

export function customThemeCss(t: CustomTheme): string {
  const font = FONTS[t.font]
  const veil = t.veil / 100
  const veilColour = t.resolved === 'light' ? '255,255,255' : '0,0,0'
  const accent = t.accent ? readableAccent(t.accent) : null
  const lines = [
    '/* made by the app (Settings › Appearance › Theme › Eigenes) - changed with every save there, do not edit */',
    font.face ?? '',
    'body.km.km-theme-custom {',
    t.resolved === 'light' ? `  ${LIGHT}` : '',
    accent ? `  --km-apricot: ${accent}; --km-apricot-shadow: ${mix(accent, [0, 0, 0], 0.35)};` : '',
    `  --km-name-font: ${font.family}; --km-name-size: ${SIZES[t.size]}px;`,
    '}',
    // the picture, with the veil and (light writing on a light picture's top) a soft band for the status
    `body.km.km-theme-custom .ion-page { background: ${
      t.resolved === 'light' ? 'linear-gradient(to bottom, rgba(255,255,255,.6) 0, rgba(255,255,255,0) 120px), ' : ''
    }linear-gradient(rgba(${veilColour},${veil}), rgba(${veilColour},${veil})), var(--km-night) url("/theme-data/custom/custom-bg.jpg") center / cover no-repeat !important; }`,
    // (dark writing: the round buttons are white, their symbols dark - the resume symbol is drawn in --km-cream)
    t.resolved === 'light' ? 'body.km.km-theme-custom .km-hbtn .km-resume-icon { stroke: var(--km-on-btn) !important; }' : '',
    // the names: name bars, the stage's name, the titles in the header
    `body.km.km-theme-custom .title-row ion-card-title, body.km.km-theme-custom .title-row .truncate-text { font-family: var(--km-name-font) !important; font-size: var(--km-name-size) !important; font-weight: ${font.weight} !important; line-height: 1.1; }`,
    `body.km.km-theme-custom.km-stage .km-stage-name, body.km.km-theme-custom.km-stage .km-stage-name span, body.km.km-theme-custom.km-stage .km-stage-name * { font-family: var(--km-name-font) !important; font-size: calc(var(--km-name-size) + 1px) !important; font-weight: ${font.weight} !important; }`,
    `body.km.km-theme-custom .km-ht1, body.km.km-theme-custom .kp-t1 { font-family: var(--km-name-font) !important; font-weight: ${font.weight} !important; }`,
    '',
  ]
  return lines.filter((l, i) => l !== '' || i === lines.length - 1).join('\n')
}
