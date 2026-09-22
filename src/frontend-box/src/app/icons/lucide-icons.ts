import { addIcons } from 'ionicons'
import {
  Battery,
  BatteryCharging,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  Bluetooth,
  ChevronLeft,
  ChevronRight,
  FastForward,
  Headphones,
  History,
  type IconNode,
  ListMusic,
  Lock,
  Minus,
  Music,
  Pause,
  Pencil,
  Play,
  Plus,
  Podcast,
  Power,
  Radio,
  RefreshCw,
  Rewind,
  Save,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  SquarePlus,
  Trash2,
  Volume1,
  Volume2,
  Wifi,
  WifiOff,
  X,
} from 'lucide'

/**
 * Lucide icons (line style, 2px stroke, round caps and joins) registered for
 * ion-icon under a `lucide-` prefix. The SVG data URLs are built in the same
 * format ionicons uses for its own icons, so `<ion-icon name="lucide-wifi">`
 * works everywhere without extra setup.
 */
function toIonIconUrl(icon: IconNode): string {
  const children = icon
    .map(([tag, attrs]) => {
      const attributes = Object.entries(attrs)
        .map(([key, value]) => `${key}='${value}'`)
        .join(' ')
      return `<${tag} ${attributes}/>`
    })
    .join('')
  return (
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' " +
    `stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${children}</svg>`
  )
}

export const lucideIcons = {
  'lucide-wifi': toIonIconUrl(Wifi),
  'lucide-radio': toIonIconUrl(Radio),
  'lucide-bluetooth': toIonIconUrl(Bluetooth),
  'lucide-chevron-left': toIonIconUrl(ChevronLeft),
  'lucide-chevron-right': toIonIconUrl(ChevronRight),
  'lucide-pencil': toIonIconUrl(Pencil),
  'lucide-power': toIonIconUrl(Power),
  'lucide-refresh-cw': toIonIconUrl(RefreshCw),
  'lucide-save': toIonIconUrl(Save),
  'lucide-search': toIonIconUrl(Search),
  'lucide-square-plus': toIonIconUrl(SquarePlus),
  'lucide-trash-2': toIonIconUrl(Trash2),
  'lucide-x': toIonIconUrl(X),
  'lucide-wifi-off': toIonIconUrl(WifiOff),
  'lucide-history': toIonIconUrl(History),
  'lucide-list-music': toIonIconUrl(ListMusic),
  'lucide-lock': toIonIconUrl(Lock),
  'lucide-headphones': toIonIconUrl(Headphones),
  'lucide-music': toIonIconUrl(Music),
  'lucide-podcast': toIonIconUrl(Podcast),
  'lucide-battery': toIonIconUrl(Battery),
  'lucide-battery-low': toIonIconUrl(BatteryLow),
  'lucide-battery-medium': toIonIconUrl(BatteryMedium),
  'lucide-battery-full': toIonIconUrl(BatteryFull),
  'lucide-battery-charging': toIonIconUrl(BatteryCharging),
  'lucide-play': toIonIconUrl(Play),
  'lucide-pause': toIonIconUrl(Pause),
  'lucide-skip-back': toIonIconUrl(SkipBack),
  'lucide-skip-forward': toIonIconUrl(SkipForward),
  'lucide-rewind': toIonIconUrl(Rewind),
  'lucide-fast-forward': toIonIconUrl(FastForward),
  'lucide-volume-1': toIonIconUrl(Volume1),
  'lucide-volume-2': toIonIconUrl(Volume2),
  'lucide-shuffle': toIonIconUrl(Shuffle),
  'lucide-minus': toIonIconUrl(Minus),
  'lucide-plus': toIonIconUrl(Plus),
}

let registered = false

/** Registers the Lucide icon set once. Safe to call from every component constructor. */
export function registerLucideIcons(): void {
  if (registered) {
    return
  }
  addIcons(lucideIcons)
  registered = true
}
