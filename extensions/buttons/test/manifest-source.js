// The manifest of the extension is long and regular (six buttons and two twin buttons with the same fields each): it is written
// from here -  node extensions/buttons/test/manifest-source.js --write  - and the test checks that manifest.json is what this gives.
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { BUTTONS, TWINS, ACTIONS } = require('../inputs.js')

const VERSION = '1.5.0'

const ACTION_LABELS = {
  none: 'Keine Aktion',
  toggle: 'Play/Pause',
  next: 'Nächster Titel',
  prev: 'Vorheriger Titel',
  replay: 'Von vorn beginnen',
  volUp: 'Lauter',
  volDown: 'Leiser',
  ffwd: '30 Sekunden vor',
  rewind: '30 Sekunden zurück',
  shuffle: 'Zufallswiedergabe an/aus',
  repeat: 'Repeat all/one/off',
  output: 'Ausgabe wechseln',
  address: 'Adresse der Box zeigen',
  stop: 'Stopp',
  shutdown: 'Box ausschalten',
}
const HOLD = [0.5, 1, 1.5, 2, 3]
const STEPS = [1, 2, 3, 5, 10]

// what a button does when its pin is chosen and nothing else is set: [short, long, repeat]
const BUTTON_DEFAULTS = [
  ['toggle', 'none', false],
  ['next', 'none', false],
  ['prev', 'replay', false],
  ['volUp', 'none', true],
  ['volDown', 'none', true],
  ['output', 'none', false],
]
// (the volume steps to choose from, and the one that is chosen until the user says otherwise)
const STEP = 5
// ... and a twin: [short A, short B, short A+B, long A, long B, long A+B]
const TWIN_DEFAULTS = [
  ['prev', 'next', 'toggle', 'volDown', 'volUp', 'output'],
  ['rewind', 'ffwd', 'toggle', 'prev', 'next', 'replay'],
]

function build() {
  const settings = {}
  const items = []
  const actionSetting = (def) => ({ type: 'string', default: def, options: ACTIONS })
  const actionChoices = ACTIONS.map((value) => ({ value, label: ACTION_LABELS[value] }))
  // an action to choose - and beside it, while it is "louder" or "quieter", by how much: every action has its own step
  const actionItem = (key, label, dep) => {
    settings[`${key}Step`] = { type: 'number', default: STEP, options: STEPS }
    return { key, label, dep, choices: actionChoices, extra: { key: `${key}Step`, label: 'Lautstärke-Schritt', when: ['volUp', 'volDown'], choices: STEPS.map((v) => ({ value: v, label: `${v} %` })) } }
  }
  const holdSetting = { type: 'number', default: 1, options: HOLD }
  const holdChoices = HOLD.map((v) => ({ value: v, label: `${String(v).replace('.', ',')} s` }))

  for (let n = 1; n <= BUTTONS; n++) {
    const [short, long, repeat] = BUTTON_DEFAULTS[n - 1]
    const k = `b${n}`
    // (the name the user gives the button, and - from the second on - whether it was added: only button 1 is there from the start)
    settings[`${k}Name`] = { type: 'string', default: '' }
    if (n > 1) settings[`${k}On`] = { type: 'boolean', default: false }
    settings[`${k}Pin`] = { type: 'gpio', default: 0 }
    settings[`${k}Short`] = actionSetting(short)
    settings[`${k}Long`] = actionSetting(long)
    settings[`${k}Hold`] = { ...holdSetting }
    settings[`${k}Repeat`] = { type: 'boolean', default: repeat }
    items.push(
      {
        type: 'heading',
        card: true,
        label: 'Taster',
        rename: `${k}Name`,
        ...(n > 1 ? { optional: `${k}On` } : {}),
        ...(n === 1 ? { help: 'Ein Taster für kurzes und langes Drücken. Ohne lange Aktion wirkt die kurze sofort beim Drücken. Mit langer Aktion wirkt die kurze beim Loslassen und die lange, sobald die Haltezeit erreicht ist.' } : {}),
      },
      { key: `${k}Pin`, label: 'GPIO-Pin' },
      actionItem(`${k}Short`, 'Kurz drücken', `${k}Pin`),
      actionItem(`${k}Long`, 'Lang drücken', `${k}Pin`),
      { key: `${k}Hold`, label: 'Haltezeit', dep: `${k}Pin`, choices: holdChoices },
      { key: `${k}Repeat`, label: 'Beim Halten wiederholen', dep: `${k}Pin`, help: 'Die Aktion wiederholt sich, solange der Taster gedrückt bleibt – zum Beispiel für die Lautstärke.' },
    )
  }
  for (let n = 1; n <= TWINS; n++) {
    const d = TWIN_DEFAULTS[n - 1]
    const k = `t${n}`
    settings[`${k}Name`] = { type: 'string', default: '' }
    settings[`${k}On`] = { type: 'boolean', default: false }
    settings[`${k}PinA`] = { type: 'gpio', default: 0 }
    settings[`${k}PinB`] = { type: 'gpio', default: 0 }
    const parts = [
      ['ShortA', 'A kurz'],
      ['ShortB', 'B kurz'],
      ['ShortAB', 'A und B kurz'],
      ['LongA', 'A lang'],
      ['LongB', 'B lang'],
      ['LongAB', 'A und B lang'],
    ]
    parts.forEach(([part], i) => {
      settings[`${k}${part}`] = actionSetting(d[i])
    })
    settings[`${k}Hold`] = { ...holdSetting }
    settings[`${k}Repeat`] = { type: 'boolean', default: true }
    items.push(
      {
        type: 'heading',
        card: true,
        label: 'Doppeltaster',
        rename: `${k}Name`,
        optional: `${k}On`,
        ...(n === 1 ? { help: 'Zwei Taster, sechs Aktionen: jeder allein und beide zusammen, jeweils kurz oder lang gedrückt. Die kurzen Aktionen wirken beim Loslassen.' } : {}),
      },
      { key: `${k}PinA`, label: 'GPIO-Pin Taster A' },
      { key: `${k}PinB`, label: 'GPIO-Pin Taster B', dep: `${k}PinA` },
      ...parts.map(([part, label]) => actionItem(`${k}${part}`, label, `${k}PinA`)),
      { key: `${k}Hold`, label: 'Haltezeit', dep: `${k}PinA`, choices: holdChoices },
      { key: `${k}Repeat`, label: 'Beim Halten wiederholen', dep: `${k}PinA`, help: 'Gilt für A oder B allein, nie für beide zusammen.' },
    )
  }
  return {
    id: 'buttons',
    name: 'Buttons & GPIO Input',
    version: VERSION,
    description:
      'Physische Taster an den GPIO-Pins steuern die Box: Play/Pause, Titel, Lautstärke und mehr. Mit Tastern für kurzes und langes Drücken (Dual Action) und Doppeltastern mit sechs Funktionen. Die Einstellungen stehen unter Einstellungen › Buttons & GPIO Input.',
    hostApi: 5,
    resources: {},
    api: 'api.js',
    icon: 'icon.svg',
    settings,
    ui: {
      title: 'Buttons & GPIO Input',
      heading: 'Buttons',
      help: 'Jeder Taster verbindet seinen GPIO-Pin mit GND (Masse); ein Widerstand ist nicht nötig. Wähle für jeden Taster einen freien Pin und was er tun soll. Pins, die schon belegt sind (Netzschalter, LED, Lüfter, Soundkarte, Drehregler, andere Erweiterungen), lassen sich nicht wählen.',
      place: 'system',
      adopt: ['rotary'],
      items,
    },
  }
}

const file = path.join(__dirname, '..', 'manifest.json')
const text = () => `${JSON.stringify(build(), null, 2)}\n`

if (require.main === module) {
  if (process.argv.includes('--write')) {
    fs.writeFileSync(file, text())
    console.log(`written: ${file}`)
  } else process.stdout.write(text())
}

module.exports = { build, text, file, ACTION_LABELS }
