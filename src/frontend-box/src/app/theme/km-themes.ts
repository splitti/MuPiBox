// km themes: children's themes of one design (17 looks, one layout) - see themes/km-themes.json, where this list comes
// from (ids, names, light background, mascots, day/night). Everything km-specific in the app is switched on by
// isKmTheme(); all other themes (and the old 3D "coverflow") stay as they are.

export interface KmTheme {
  id: string
  label: string
  /** light background: header text and status icons are dark */
  light: boolean
  mascot: { sleeping: string; awake: string }
  /** shown instead of the default cover (bear with headphones) when a title has no cover of its own */
  coverPlaceholder: string
  /** Tag & Nacht: the placeholder at night */
  coverPlaceholderNight?: string
  /** Tag & Nacht: night look between nightFrom and nightUntil (and during quiet time) */
  dayNight?: {
    nightFrom: string
    nightUntil: string
    alsoDuringQuietTime: boolean
    lightAtNight: boolean
    mascotNight: { sleeping: string; awake: string }
  }
}

export const KM_THEMES: readonly KmTheme[] = [
  {
    id: 'kuschelmond',
    label: 'Kuschelmond',
    light: false,
    mascot: {
      sleeping: '/theme-data/kuschelmond/maskottchen.svg',
      awake: '/theme-data/kuschelmond/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/kuschelmond/cover-platzhalter.svg',
  },
  {
    id: 'moosnest',
    label: 'Moosnest',
    light: false,
    mascot: {
      sleeping: '/theme-data/moosnest/maskottchen.svg',
      awake: '/theme-data/moosnest/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/moosnest/cover-platzhalter.svg',
  },
  {
    id: 'sonnenhof',
    label: 'Sonnenhof',
    light: true,
    mascot: {
      sleeping: '/theme-data/sonnenhof/maskottchen.svg',
      awake: '/theme-data/sonnenhof/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/sonnenhof/cover-platzhalter.svg',
  },
  {
    id: 'pferdehof',
    label: 'Pferdehof',
    light: true,
    mascot: {
      sleeping: '/theme-data/pferdehof/maskottchen.svg',
      awake: '/theme-data/pferdehof/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/pferdehof/cover-platzhalter.svg',
  },
  {
    id: 'fussball',
    label: 'Fußball',
    light: false,
    mascot: {
      sleeping: '/theme-data/fussball/maskottchen.svg',
      awake: '/theme-data/fussball/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/fussball/cover-platzhalter.svg',
  },
  {
    id: 'fahrzeuge',
    label: 'Fahrzeuge',
    light: false,
    mascot: {
      sleeping: '/theme-data/fahrzeuge/maskottchen.svg',
      awake: '/theme-data/fahrzeuge/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/fahrzeuge/cover-platzhalter.svg',
  },
  {
    id: 'buecherregal',
    label: 'Bücherregal',
    light: false,
    mascot: {
      sleeping: '/theme-data/buecherregal/maskottchen.svg',
      awake: '/theme-data/buecherregal/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/buecherregal/cover-platzhalter.svg',
  },
  {
    id: 'kassettenrekorder',
    label: 'Kassettenrekorder',
    light: false,
    mascot: {
      sleeping: '/theme-data/kassettenrekorder/maskottchen.svg',
      awake: '/theme-data/kassettenrekorder/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/kassettenrekorder/cover-platzhalter.svg',
  },
  {
    id: 'unterwasser',
    label: 'Unterwasser',
    light: false,
    mascot: {
      sleeping: '/theme-data/unterwasser/maskottchen.svg',
      awake: '/theme-data/unterwasser/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/unterwasser/cover-platzhalter.svg',
  },
  {
    id: 'bastelpapier',
    label: 'Bastelpapier',
    light: true,
    mascot: {
      sleeping: '/theme-data/bastelpapier/maskottchen.svg',
      awake: '/theme-data/bastelpapier/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/bastelpapier/cover-platzhalter.svg',
  },
  {
    id: 'prinzessin',
    label: 'Prinzessin',
    light: true,
    mascot: {
      sleeping: '/theme-data/prinzessin/maskottchen.svg',
      awake: '/theme-data/prinzessin/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/prinzessin/cover-platzhalter.svg',
  },
  {
    id: 'einhorn',
    label: 'Einhorn',
    light: true,
    mascot: {
      sleeping: '/theme-data/einhorn/maskottchen.svg',
      awake: '/theme-data/einhorn/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/einhorn/cover-platzhalter.svg',
  },
  {
    id: 'feenschloss',
    label: 'Feenschloss',
    light: false,
    mascot: {
      sleeping: '/theme-data/feenschloss/maskottchen.svg',
      awake: '/theme-data/feenschloss/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/feenschloss/cover-platzhalter.svg',
  },
  {
    id: 'weltraum',
    label: 'Weltraum',
    light: false,
    mascot: {
      sleeping: '/theme-data/weltraum/maskottchen.svg',
      awake: '/theme-data/weltraum/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/weltraum/cover-platzhalter.svg',
  },
  {
    id: 'dinoland',
    label: 'Dinoland',
    light: false,
    mascot: {
      sleeping: '/theme-data/dinoland/maskottchen.svg',
      awake: '/theme-data/dinoland/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/dinoland/cover-platzhalter.svg',
  },
  {
    id: 'piratenbucht',
    label: 'Piratenbucht',
    light: true,
    mascot: {
      sleeping: '/theme-data/piratenbucht/maskottchen.svg',
      awake: '/theme-data/piratenbucht/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/piratenbucht/cover-platzhalter.svg',
  },
  {
    id: 'tagundnacht',
    label: 'Tag & Nacht',
    light: true,
    mascot: {
      sleeping: '/theme-data/tagundnacht/maskottchen.svg',
      awake: '/theme-data/tagundnacht/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/tagundnacht/cover-platzhalter.svg',
    coverPlaceholderNight: '/theme-data/tagundnacht/cover-platzhalter-nacht.svg',
    dayNight: {
      nightFrom: '18:00',
      nightUntil: '07:00',
      alsoDuringQuietTime: true,
      lightAtNight: false,
      mascotNight: {
        sleeping: '/theme-data/tagundnacht/maskottchen-nacht.svg',
        awake: '/theme-data/tagundnacht/maskottchen-nacht-wach.svg',
      },
    },
  },
  {
    id: 'feuerwehr',
    label: 'Feuerwehr',
    light: true,
    mascot: {
      sleeping: '/theme-data/feuerwehr/maskottchen.svg',
      awake: '/theme-data/feuerwehr/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/feuerwehr/cover-platzhalter.svg',
  },
  {
    id: 'ritterburg',
    label: 'Ritterburg',
    light: true,
    mascot: {
      sleeping: '/theme-data/ritterburg/maskottchen.svg',
      awake: '/theme-data/ritterburg/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/ritterburg/cover-platzhalter.svg',
  },
  {
    id: 'eisenbahn',
    label: 'Eisenbahn',
    light: true,
    mascot: {
      sleeping: '/theme-data/eisenbahn/maskottchen.svg',
      awake: '/theme-data/eisenbahn/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/eisenbahn/cover-platzhalter.svg',
  },
  {
    id: 'roboter',
    label: 'Roboterwerkstatt',
    light: false,
    mascot: {
      sleeping: '/theme-data/roboter/maskottchen.svg',
      awake: '/theme-data/roboter/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/roboter/cover-platzhalter.svg',
  },
  {
    id: 'heldenstadt',
    label: 'Heldenstadt',
    light: false,
    mascot: {
      sleeping: '/theme-data/heldenstadt/maskottchen.svg',
      awake: '/theme-data/heldenstadt/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/heldenstadt/cover-platzhalter.svg',
  },
  {
    id: 'safari',
    label: 'Safari',
    light: true,
    mascot: {
      sleeping: '/theme-data/safari/maskottchen.svg',
      awake: '/theme-data/safari/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/safari/cover-platzhalter.svg',
  },
  {
    id: 'eiswelt',
    label: 'Pinguin-Eiswelt',
    light: true,
    mascot: {
      sleeping: '/theme-data/eiswelt/maskottchen.svg',
      awake: '/theme-data/eiswelt/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/eiswelt/cover-platzhalter.svg',
  },
  {
    id: 'zirkus',
    label: 'Zirkus',
    light: false,
    mascot: {
      sleeping: '/theme-data/zirkus/maskottchen.svg',
      awake: '/theme-data/zirkus/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/zirkus/cover-platzhalter.svg',
  },
  {
    id: 'meerjungfrau',
    label: 'Meerjungfrau-Lagune',
    light: true,
    mascot: {
      sleeping: '/theme-data/meerjungfrau/maskottchen.svg',
      awake: '/theme-data/meerjungfrau/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/meerjungfrau/cover-platzhalter.svg',
  },
  {
    id: 'ballett',
    label: 'Ballettbühne',
    light: false,
    mascot: {
      sleeping: '/theme-data/ballett/maskottchen.svg',
      awake: '/theme-data/ballett/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/ballett/cover-platzhalter.svg',
  },
  {
    id: 'kaetzchen',
    label: 'Kätzchenzimmer',
    light: true,
    mascot: {
      sleeping: '/theme-data/kaetzchen/maskottchen.svg',
      awake: '/theme-data/kaetzchen/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/kaetzchen/cover-platzhalter.svg',
  },
  {
    id: 'zuckerland',
    label: 'Zuckerland',
    light: true,
    mascot: {
      sleeping: '/theme-data/zuckerland/maskottchen.svg',
      awake: '/theme-data/zuckerland/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/zuckerland/cover-platzhalter.svg',
  },
  {
    id: 'schmetterlinge',
    label: 'Schmetterlingsgarten',
    light: true,
    mascot: {
      sleeping: '/theme-data/schmetterlinge/maskottchen.svg',
      awake: '/theme-data/schmetterlinge/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/schmetterlinge/cover-platzhalter.svg',
  },
]

export function kmTheme(id: string | undefined): KmTheme | undefined {
  return KM_THEMES.find((theme) => theme.id === id)
}

export function isKmTheme(id: string | undefined): boolean {
  return kmTheme(id) !== undefined
}
