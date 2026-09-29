// km themes: children's themes of one design (17 looks, one layout) - see themes/km-themes.json, where this list comes
// from (ids, names, light background, mascots, day/night). Everything km-specific in the app is switched on by
// isKmTheme(); all other themes (and the old 3D "coverflow") stay as they are.

export interface KmTheme {
  id: string
  label: string
  /** light background: header text and status icons are dark */
  light: boolean
  /** an old theme of the box in the km layout (keeps its name and its place in the theme list) */
  legacy?: boolean
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
  // --- the old themes of the box in the km layout (legacy) ---
  {
    id: 'axolotl',
    label: 'axolotl',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/axolotl/maskottchen.svg',
      awake: '/theme-data/axolotl/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/axolotl/cover-platzhalter.svg',
  },
  {
    id: 'blue',
    label: 'blue',
    light: true,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/blue/maskottchen.svg',
      awake: '/theme-data/blue/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/blue/cover-platzhalter.svg',
  },
  {
    id: 'captainamerica',
    label: 'captainamerica',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/captainamerica/maskottchen.svg',
      awake: '/theme-data/captainamerica/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/captainamerica/cover-platzhalter.svg',
  },
  {
    id: 'chocolate',
    label: 'chocolate',
    light: true,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/chocolate/maskottchen.svg',
      awake: '/theme-data/chocolate/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/chocolate/cover-platzhalter.svg',
  },
  {
    id: 'cinema',
    label: 'cinema',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/cinema/maskottchen.svg',
      awake: '/theme-data/cinema/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/cinema/cover-platzhalter.svg',
  },
  {
    id: 'clone-wars',
    label: 'clone-wars',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/clone-wars/maskottchen.svg',
      awake: '/theme-data/clone-wars/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/clone-wars/cover-platzhalter.svg',
  },
  {
    id: 'comic',
    label: 'comic',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/comic/maskottchen.svg',
      awake: '/theme-data/comic/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/comic/cover-platzhalter.svg',
  },
  {
    id: 'custom',
    label: 'custom',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/custom/maskottchen.svg',
      awake: '/theme-data/custom/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/custom/cover-platzhalter.svg',
  },
  {
    id: 'danger',
    label: 'danger',
    light: true,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/danger/maskottchen.svg',
      awake: '/theme-data/danger/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/danger/cover-platzhalter.svg',
  },
  {
    id: 'dark',
    label: 'dark',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/dark/maskottchen.svg',
      awake: '/theme-data/dark/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/dark/cover-platzhalter.svg',
  },
  {
    id: 'darkred',
    label: 'darkred',
    light: true,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/darkred/maskottchen.svg',
      awake: '/theme-data/darkred/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/darkred/cover-platzhalter.svg',
  },
  {
    id: 'deepblue',
    label: 'deepblue',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/deepblue/maskottchen.svg',
      awake: '/theme-data/deepblue/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/deepblue/cover-platzhalter.svg',
  },
  {
    id: 'dinosaur',
    label: 'dinosaur',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/dinosaur/maskottchen.svg',
      awake: '/theme-data/dinosaur/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/dinosaur/cover-platzhalter.svg',
  },
  {
    id: 'earth',
    label: 'earth',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/earth/maskottchen.svg',
      awake: '/theme-data/earth/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/earth/cover-platzhalter.svg',
  },
  {
    id: 'enterprise',
    label: 'enterprise',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/enterprise/maskottchen.svg',
      awake: '/theme-data/enterprise/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/enterprise/cover-platzhalter.svg',
  },
  {
    id: 'fantasybutterflies',
    label: 'fantasybutterflies',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/fantasybutterflies/maskottchen.svg',
      awake: '/theme-data/fantasybutterflies/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/fantasybutterflies/cover-platzhalter.svg',
  },
  {
    id: 'forms',
    label: 'forms',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/forms/maskottchen.svg',
      awake: '/theme-data/forms/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/forms/cover-platzhalter.svg',
  },
  {
    id: 'green',
    label: 'green',
    light: true,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/green/maskottchen.svg',
      awake: '/theme-data/green/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/green/cover-platzhalter.svg',
  },
  {
    id: 'ironman',
    label: 'ironman',
    light: true,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/ironman/maskottchen.svg',
      awake: '/theme-data/ironman/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/ironman/cover-platzhalter.svg',
  },
  {
    id: 'light',
    label: 'light',
    light: true,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/light/maskottchen.svg',
      awake: '/theme-data/light/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/light/cover-platzhalter.svg',
  },
  {
    id: 'lines',
    label: 'lines',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/lines/maskottchen.svg',
      awake: '/theme-data/lines/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/lines/cover-platzhalter.svg',
  },
  {
    id: 'matrix',
    label: 'matrix',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/matrix/maskottchen.svg',
      awake: '/theme-data/matrix/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/matrix/cover-platzhalter.svg',
  },
  {
    id: 'mint',
    label: 'mint',
    light: true,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/mint/maskottchen.svg',
      awake: '/theme-data/mint/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/mint/cover-platzhalter.svg',
  },
  {
    id: 'mystic',
    label: 'mystic',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/mystic/maskottchen.svg',
      awake: '/theme-data/mystic/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/mystic/cover-platzhalter.svg',
  },
  {
    id: 'orange',
    label: 'orange',
    light: true,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/orange/maskottchen.svg',
      awake: '/theme-data/orange/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/orange/cover-platzhalter.svg',
  },
  {
    id: 'pikachu',
    label: 'pikachu',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/pikachu/maskottchen.svg',
      awake: '/theme-data/pikachu/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/pikachu/cover-platzhalter.svg',
  },
  {
    id: 'pink',
    label: 'pink',
    light: true,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/pink/maskottchen.svg',
      awake: '/theme-data/pink/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/pink/cover-platzhalter.svg',
  },
  {
    id: 'purple',
    label: 'purple',
    light: true,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/purple/maskottchen.svg',
      awake: '/theme-data/purple/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/purple/cover-platzhalter.svg',
  },
  {
    id: 'red',
    label: 'red',
    light: true,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/red/maskottchen.svg',
      awake: '/theme-data/red/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/red/cover-platzhalter.svg',
  },
  {
    id: 'spiderman',
    label: 'spiderman',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/spiderman/maskottchen.svg',
      awake: '/theme-data/spiderman/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/spiderman/cover-platzhalter.svg',
  },
  {
    id: 'steampunk',
    label: 'steampunk',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/steampunk/maskottchen.svg',
      awake: '/theme-data/steampunk/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/steampunk/cover-platzhalter.svg',
  },
  {
    id: 'supermario',
    label: 'supermario',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/supermario/maskottchen.svg',
      awake: '/theme-data/supermario/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/supermario/cover-platzhalter.svg',
  },
  {
    id: 'unicorn',
    label: 'unicorn',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/unicorn/maskottchen.svg',
      awake: '/theme-data/unicorn/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/unicorn/cover-platzhalter.svg',
  },
  {
    id: 'vintage',
    label: 'vintage',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/vintage/maskottchen.svg',
      awake: '/theme-data/vintage/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/vintage/cover-platzhalter.svg',
  },
  {
    id: 'wall-e',
    label: 'wall-e',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/wall-e/maskottchen.svg',
      awake: '/theme-data/wall-e/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/wall-e/cover-platzhalter.svg',
  },
  {
    id: 'wood',
    label: 'wood',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/wood/maskottchen.svg',
      awake: '/theme-data/wood/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/wood/cover-platzhalter.svg',
  },
  {
    id: 'xmas',
    label: 'xmas',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/xmas/maskottchen.svg',
      awake: '/theme-data/xmas/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/xmas/cover-platzhalter.svg',
  },
  // --- the old themes of the box in the km layout (legacy) ---
  {
    id: 'axolotl',
    label: 'axolotl',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/axolotl/maskottchen.svg',
      awake: '/theme-data/axolotl/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/axolotl/cover-platzhalter.svg',
  },
  {
    id: 'blue',
    label: 'blue',
    light: true,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/blue/maskottchen.svg',
      awake: '/theme-data/blue/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/blue/cover-platzhalter.svg',
  },
  {
    id: 'captainamerica',
    label: 'captainamerica',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/captainamerica/maskottchen.svg',
      awake: '/theme-data/captainamerica/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/captainamerica/cover-platzhalter.svg',
  },
  {
    id: 'chocolate',
    label: 'chocolate',
    light: true,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/chocolate/maskottchen.svg',
      awake: '/theme-data/chocolate/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/chocolate/cover-platzhalter.svg',
  },
  {
    id: 'cinema',
    label: 'cinema',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/cinema/maskottchen.svg',
      awake: '/theme-data/cinema/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/cinema/cover-platzhalter.svg',
  },
  {
    id: 'clone-wars',
    label: 'clone-wars',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/clone-wars/maskottchen.svg',
      awake: '/theme-data/clone-wars/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/clone-wars/cover-platzhalter.svg',
  },
  {
    id: 'comic',
    label: 'comic',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/comic/maskottchen.svg',
      awake: '/theme-data/comic/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/comic/cover-platzhalter.svg',
  },
  {
    id: 'custom',
    label: 'custom',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/custom/maskottchen.svg',
      awake: '/theme-data/custom/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/custom/cover-platzhalter.svg',
  },
  {
    id: 'danger',
    label: 'danger',
    light: true,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/danger/maskottchen.svg',
      awake: '/theme-data/danger/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/danger/cover-platzhalter.svg',
  },
  {
    id: 'dark',
    label: 'dark',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/dark/maskottchen.svg',
      awake: '/theme-data/dark/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/dark/cover-platzhalter.svg',
  },
  {
    id: 'darkred',
    label: 'darkred',
    light: true,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/darkred/maskottchen.svg',
      awake: '/theme-data/darkred/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/darkred/cover-platzhalter.svg',
  },
  {
    id: 'deepblue',
    label: 'deepblue',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/deepblue/maskottchen.svg',
      awake: '/theme-data/deepblue/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/deepblue/cover-platzhalter.svg',
  },
  {
    id: 'dinosaur',
    label: 'dinosaur',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/dinosaur/maskottchen.svg',
      awake: '/theme-data/dinosaur/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/dinosaur/cover-platzhalter.svg',
  },
  {
    id: 'earth',
    label: 'earth',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/earth/maskottchen.svg',
      awake: '/theme-data/earth/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/earth/cover-platzhalter.svg',
  },
  {
    id: 'enterprise',
    label: 'enterprise',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/enterprise/maskottchen.svg',
      awake: '/theme-data/enterprise/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/enterprise/cover-platzhalter.svg',
  },
  {
    id: 'fantasybutterflies',
    label: 'fantasybutterflies',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/fantasybutterflies/maskottchen.svg',
      awake: '/theme-data/fantasybutterflies/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/fantasybutterflies/cover-platzhalter.svg',
  },
  {
    id: 'forms',
    label: 'forms',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/forms/maskottchen.svg',
      awake: '/theme-data/forms/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/forms/cover-platzhalter.svg',
  },
  {
    id: 'green',
    label: 'green',
    light: true,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/green/maskottchen.svg',
      awake: '/theme-data/green/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/green/cover-platzhalter.svg',
  },
  {
    id: 'ironman',
    label: 'ironman',
    light: true,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/ironman/maskottchen.svg',
      awake: '/theme-data/ironman/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/ironman/cover-platzhalter.svg',
  },
  {
    id: 'light',
    label: 'light',
    light: true,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/light/maskottchen.svg',
      awake: '/theme-data/light/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/light/cover-platzhalter.svg',
  },
  {
    id: 'lines',
    label: 'lines',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/lines/maskottchen.svg',
      awake: '/theme-data/lines/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/lines/cover-platzhalter.svg',
  },
  {
    id: 'matrix',
    label: 'matrix',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/matrix/maskottchen.svg',
      awake: '/theme-data/matrix/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/matrix/cover-platzhalter.svg',
  },
  {
    id: 'mint',
    label: 'mint',
    light: true,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/mint/maskottchen.svg',
      awake: '/theme-data/mint/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/mint/cover-platzhalter.svg',
  },
  {
    id: 'mystic',
    label: 'mystic',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/mystic/maskottchen.svg',
      awake: '/theme-data/mystic/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/mystic/cover-platzhalter.svg',
  },
  {
    id: 'orange',
    label: 'orange',
    light: true,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/orange/maskottchen.svg',
      awake: '/theme-data/orange/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/orange/cover-platzhalter.svg',
  },
  {
    id: 'pikachu',
    label: 'pikachu',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/pikachu/maskottchen.svg',
      awake: '/theme-data/pikachu/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/pikachu/cover-platzhalter.svg',
  },
  {
    id: 'pink',
    label: 'pink',
    light: true,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/pink/maskottchen.svg',
      awake: '/theme-data/pink/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/pink/cover-platzhalter.svg',
  },
  {
    id: 'purple',
    label: 'purple',
    light: true,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/purple/maskottchen.svg',
      awake: '/theme-data/purple/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/purple/cover-platzhalter.svg',
  },
  {
    id: 'red',
    label: 'red',
    light: true,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/red/maskottchen.svg',
      awake: '/theme-data/red/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/red/cover-platzhalter.svg',
  },
  {
    id: 'spiderman',
    label: 'spiderman',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/spiderman/maskottchen.svg',
      awake: '/theme-data/spiderman/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/spiderman/cover-platzhalter.svg',
  },
  {
    id: 'steampunk',
    label: 'steampunk',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/steampunk/maskottchen.svg',
      awake: '/theme-data/steampunk/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/steampunk/cover-platzhalter.svg',
  },
  {
    id: 'supermario',
    label: 'supermario',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/supermario/maskottchen.svg',
      awake: '/theme-data/supermario/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/supermario/cover-platzhalter.svg',
  },
  {
    id: 'unicorn',
    label: 'unicorn',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/unicorn/maskottchen.svg',
      awake: '/theme-data/unicorn/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/unicorn/cover-platzhalter.svg',
  },
  {
    id: 'vintage',
    label: 'vintage',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/vintage/maskottchen.svg',
      awake: '/theme-data/vintage/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/vintage/cover-platzhalter.svg',
  },
  {
    id: 'wall-e',
    label: 'wall-e',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/wall-e/maskottchen.svg',
      awake: '/theme-data/wall-e/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/wall-e/cover-platzhalter.svg',
  },
  {
    id: 'wood',
    label: 'wood',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/wood/maskottchen.svg',
      awake: '/theme-data/wood/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/wood/cover-platzhalter.svg',
  },
  {
    id: 'xmas',
    label: 'xmas',
    light: false,
    legacy: true,
    mascot: {
      sleeping: '/theme-data/xmas/maskottchen.svg',
      awake: '/theme-data/xmas/maskottchen-wach.svg',
    },
    coverPlaceholder: '/theme-data/xmas/cover-platzhalter.svg',
  },
]

export function kmTheme(id: string | undefined): KmTheme | undefined {
  return KM_THEMES.find((theme) => theme.id === id)
}

export function isKmTheme(id: string | undefined): boolean {
  return kmTheme(id) !== undefined
}
