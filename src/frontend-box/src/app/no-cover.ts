/**
 * The card shown for a cover that is missing (see .mupi-no-cover in global.scss): every folder gets one colour out of
 * these palettes, and the card runs from a dark shade of it (30 % lightness) to a light one (70 %).
 */
const PALETTES: Record<string, string[]> = {
  Birthday: ['#FAF78E', '#FBA7B6', '#B4D8C4', '#E1C5DD', '#6CB8F4'],
  Bedroom: ['#CAE7E3', '#B2B2B2', '#EEB8C5', '#DCDBD9', '#FEC7BC'],
  Rainbow: ['#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF'],
  'Mint Green': ['#E8F4EA', '#E0F0E3', '#D2E7D6', '#C8E1CC', '#B8D8BE'],
  Crystal: ['#DDF2F4', '#84A6D6', '#4382BB', '#E4CEE0', '#A15D98'],
  Lavender: ['#E0D6FF', '#E3DAFF', '#E6DEFF', '#E9E2FF', '#ECE6FF'],
  Red: ['#FDE0E0', '#F4C1C1', '#FDAAAA', '#F97C7C', '#EE6969'],
  Donut: ['#C6C9D0', '#C54B6C', '#E5B3BB', '#C47482', '#D5E4C3'],
  Brown: ['#AF7C74', '#B78876', '#C99E87', '#D2A993', '#D9B7A5'],
  'Neutral Shades': ['#B7C4CF', '#EEE3CB', '#D7C0AE', '#967E76'],
  Entryway: ['#C2D9E1', '#D29F8C', '#D9D3D2', '#81B1CC', '#FFD9CF'],
  'Soft Tones': ['#FFC5C5', '#FFEBD8', '#C7DCA7', '#89B9AD'],
  'Earthy Tones': ['#DADDB1', '#B3A492', '#BFB29E', '#D6C7AE'],
  'Mint Combination': ['#218B82', '#9AD9DB', '#E5DBD9', '#98D4BB', '#EB96AA'],
  'Gentle Nature': ['#F5F0BB', '#DBDFAA', '#B3C890', '#73A9AD'],
  'Soft Pinks': ['#F9F5F6', '#F8E8EE', '#FDCEDF', '#F2BED1'],
  Fashion: ['#C6AC85', '#E2E5CB', '#D9C2BD', '#A2C4C6', '#82B2B8'],
  'Serene Blues': ['#C4DFDF', '#D2E9E9', '#E3F4F4', '#F8F6F4'],
  'Green and Beyond': ['#BBD6B8', '#AEC2B6', '#94AF9F', '#DBE4C6'],
  'Soft Pastels': ['#AAE3E2', '#D9ACF5', '#FFCEFE', '#FDEBED'],
  'Sea Village': ['#8EA4C8', '#C3B8AA', '#DEDCE4', '#DB93A5', '#C7CDC5'],
  'Cool Blues': ['#898AA6', '#C9BBCF', '#B7D3DF', '#D6EFED'],
  'Soft Hues': ['#FFE6E6', '#F2D1D1', '#DAEAF1', '#C6DCE4'],
  'Light Pastel': ['#D9D7F1', '#FFFDDE', '#E7FBBE', '#FFCBCB'],
  'Sugar Colors': ['#F5BFD2', '#E5DB9C', '#D0BCAC', '#BEB4C5', '#E6A57E'],
  'Soft Elegance': ['#CAF7E3', '#F8EDED', '#F6DFEB', '#E4BAD4'],
  'Sunny Gradients': ['#FDFFBC', '#FFEEBB', '#FFDCB8', '#FFC1B6'],
  'Vibrant Lavenders': ['#FFE6E6', '#FFABE1', '#A685E2', '#6155A6'],
  'Soft Purples': ['#FFD5CD', '#EFBBCF', '#C3AED6', '#8675A9'],
}

// each colour once, in the order of the palettes
const COLORS: string[] = [
  ...new Set(
    Object.values(PALETTES)
      .flat()
      .map((c) => c.toUpperCase()),
  ),
]

/** 32-bit FNV-1a of a text: the same name always gives the same number. */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Hue (0-360), saturation and lightness (0-100) of a "#RRGGBB" colour. */
function hexToHsl(hex: string): [number, number, number] {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l * 100]
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [Math.round((h * 60 + 360) % 360), Math.round(s * 100), l * 100]
}

/** Relative luminance (0-1) of an HSL colour, to choose dark or light text on it. */
function luminance(h: number, s: number, l: number): number {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const channel = (n: number): number => {
    const k = (n + h / 30) % 12
    const v = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(8) + 0.0722 * channel(4)
}

export interface NoCoverStyle {
  background: string
  color: string
}

const cache = new Map<string, NoCoverStyle>()

/**
 * The look of the card for a folder: the colour comes from its name (so a folder keeps its colour, in the lists and in
 * the player), the gradient goes from 30 % to 70 % lightness of it, and the text is dark or white, whichever reads
 * better on the middle of the card.
 */
export function noCoverStyle(name: string): NoCoverStyle {
  const known = cache.get(name)
  if (known) return known
  const [h, s] = hexToHsl(COLORS[hash(name) % COLORS.length])
  const style: NoCoverStyle = {
    background: `linear-gradient(145deg, hsl(${h} ${s}% 30%), hsl(${h} ${s}% 70%))`,
    color: luminance(h, s, 50) > 0.2 ? '#1c1c1c' : '#ffffff',
  }
  cache.set(name, style)
  return style
}
