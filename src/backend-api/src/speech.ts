/**
 * Die Sprachausgabe der Box (Einstellungen › Audio › Sprachausgabe):
 *   - Piper (offline, auf der Box): das Programm und die Stimmen werden bei Bedarf geladen (github.com/rhasspy/piper,
 *     huggingface.co/rhasspy/piper-voices); je Sprache eine aktive Stimme. Ohne Stimme für die Sprache der Box: Google
 *     (online) oder stumm, wie eingestellt.
 *   - Ansagen: automatische (Restzeit der Spielzeit, Beginn einer Ruhezeit, Ende des Schlaftimers) und Durchsagen der
 *     Eltern (Vorlagen oder eigener Text, aus der App oder per Telegram /sag). Mit Gong vorher; die Wiedergabe wird
 *     dafür angehalten und läuft danach weiter, oder nur leiser.
 * Gespielt über PulseAudio (paplay/mplayer) - also auch über Bluetooth-Kopfhörer, und nie lauter als die Box gerade
 * ist (der Hörschutz gilt für die Box selbst).
 */

import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promises as fsp, existsSync, createWriteStream } from 'node:fs'
import * as path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const PIPER_DIR = '/home/dietpi/.mupibox/piper'
const PIPER_BIN = `${PIPER_DIR}/piper/piper`
const VOICE_DIR = `${PIPER_DIR}/voices`
const CATALOG_FILE = `${PIPER_DIR}/voices.json`
const CACHE_DIR = '/home/dietpi/MuPiBox/tts_files/piper'
const HF = 'https://huggingface.co/rhasspy/piper-voices/resolve/main'
const PIPER_RELEASE = 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2'

/**
 * The languages the box speaks, with the family Piper files their voices under (Norwegian: "no"): the app's and four
 * more Google speaks (the box's language for reading out names had them before)
 */
export const SPEECH_LANGS: Record<string, string> = {
  de: 'de', en: 'en', fr: 'fr', es: 'es', it: 'it', nl: 'nl', da: 'da', sv: 'sv', nb: 'no', fi: 'fi', pl: 'pl', cs: 'cs', tr: 'tr', pt: 'pt', el: 'el', ru: 'ru', uk: 'uk',
  ar: 'ar', zh: 'zh', hi: 'hi', ja: 'ja',
}

export type SpeechEngine = 'piper' | 'google' | 'off'
export interface SpeechTexts {
  rest: string
  bedtime: string
  sleepEnd: string
}
export interface SpeechConfig {
  engine: SpeechEngine
  /** without a Piper voice for the box's language */
  fallback: 'google' | 'off'
  /** the voice used per language (the app's code: de, en, nb, …) */
  voices: Record<string, string>
  rest: { on: boolean; minutes: number }
  bedtime: { on: boolean }
  sleepEnd: { on: boolean }
  /** how loud against the box: 0.4 quiet, 0.7 medium, 1 as the music */
  level: number
  parents: { on: boolean; gong: boolean; pause: boolean }
  /** own texts per language (missing: the language's default) */
  texts: Record<string, Partial<SpeechTexts>>
  templates: Record<string, string[]>
}

// The texts the box starts with, per language ({min}: the minutes, {name}: the quiet window's name)
export const SPEECH_DEFAULTS: Record<string, SpeechTexts & { templates: string[] }> = {
  de: { rest: 'Noch {min} Minuten, dann ist für heute Schluss.', bedtime: 'Gute Nacht! Jetzt ist {name}.', sleepEnd: 'Gleich ist Schluss. Schlaf gut!', templates: ['Essen ist fertig!', 'Zähne putzen, bitte.', 'In 10 Minuten geht’s los.', 'Aufräumen, bitte.'] },
  en: { rest: '{min} more minutes, then that’s it for today.', bedtime: 'Good night! It’s {name} now.', sleepEnd: 'Almost done. Sleep well!', templates: ['Dinner is ready!', 'Time to brush your teeth, please.', 'We’re leaving in 10 minutes.', 'Time to tidy up, please.'] },
  fr: {rest: "Encore {min} minutes, et après c’est fini pour aujourd’hui.",bedtime: "Bonne nuit ! C’est l’heure : {name}.",sleepEnd: "C’est bientôt fini. Dors bien !",templates: ["Le repas est prêt !","Va te brosser les dents, s’il te plaît.","On part dans 10 minutes.","Range tes affaires, s’il te plaît."]},
  es: {rest: "Quedan {min} minutos y luego se acaba por hoy.",bedtime: "¡Buenas noches! Ahora toca: {name}.",sleepEnd: "Ya casi se acaba. ¡Que duermas bien!",templates: ["¡La comida está lista!","A lavarte los dientes, por favor.","Nos vamos en 10 minutos.","A recoger, por favor."]},
  it: {rest: "Ancora {min} minuti, poi per oggi basta.",bedtime: "Buonanotte! Adesso è ora di: {name}.",sleepEnd: "Tra poco è finita. Dormi bene!",templates: ["La cena è pronta!","Lavati i denti, per favore.","Tra 10 minuti si parte.","Metti in ordine, per favore."]},
  nl: {rest: "Nog {min} minuten, dan is het klaar voor vandaag.",bedtime: "Welterusten! Het is nu tijd voor: {name}.",sleepEnd: "Zo is het afgelopen. Slaap lekker!",templates: ["Het eten is klaar!","Tanden poetsen, alsjeblieft.","Over 10 minuten gaan we weg.","Opruimen, alsjeblieft."]},
  da: {rest: "Nu er der {min} minutter tilbage, så er det slut for i dag.",bedtime: "Godnat! Nu er det tid til: {name}.",sleepEnd: "Snart er det slut. Sov godt!",templates: ["Maden er klar!","Nu skal du børste tænder.","Vi tager afsted om 10 minutter.","Nu skal du rydde op."]},
  sv: {rest: "Nu är det {min} minuter kvar, sen är det slut för i dag.",bedtime: "God natt! Nu är det dags för: {name}.",sleepEnd: "Snart är det slut. Sov gott!",templates: ["Maten är klar!","Dags att borsta tänderna.","Vi går om 10 minuter.","Dags att plocka undan."]},
  nb: {rest: "Nå er det {min} minutter igjen, så er det slutt for i dag.",bedtime: "God natt! Nå er det tid for: {name}.",sleepEnd: "Snart er det slutt. Sov godt!",templates: ["Maten er klar!","Nå er det tid for å pusse tennene.","Vi drar om 10 minutter.","Nå er det tid for å rydde."]},
  fi: {rest: "Vielä {min} minuuttia, sitten on tältä päivältä valmista.",bedtime: "Hyvää yötä! Nyt on aika: {name}.",sleepEnd: "Kohta loppuu. Nuku hyvin!",templates: ["Ruoka on valmista!","Hampaiden pesulle, kiitos.","Lähdetään 10 minuutin päästä.","Nyt siivotaan, kiitos."]},
  pl: {rest: "Jeszcze {min} minut i na dziś koniec.",bedtime: "Dobranoc! Teraz czas na: {name}.",sleepEnd: "Zaraz koniec. Śpij słodko!",templates: ["Jedzenie gotowe!","Umyj zęby, proszę.","Wychodzimy za 10 minut.","Posprzątaj, proszę."]},
  cs: {rest: "Ještě {min} minut a pro dnešek je konec.",bedtime: "Dobrou noc! Teď je čas na: {name}.",sleepEnd: "Za chvilku je konec. Dobře se vyspi!",templates: ["Jídlo je hotové!","Vyčisti si zuby, prosím.","Za 10 minut vyrážíme.","Ukliď si, prosím."]},
  tr: {rest: "{min} dakika daha, sonra bugünlük bu kadar.",bedtime: "İyi geceler! Şimdi sırada: {name}.",sleepEnd: "Birazdan bitiyor. İyi uykular!",templates: ["Yemek hazır!","Hadi dişlerini fırçala, lütfen.","10 dakika sonra çıkıyoruz.","Hadi ortalığı toplayalım, lütfen."]},
  pt: {rest: "Mais {min} minutos e por hoje acabou.",bedtime: "Boa noite! Agora é hora de: {name}.",sleepEnd: "Está quase no fim. Bons sonhos!",templates: ["A comida está pronta!","Hora de escovar os dentes, por favor.","Vamos sair em 10 minutos.","Hora de arrumar, por favor."]},
  el: {rest: "Ακόμα {min} λεπτά και μετά τελειώνουμε για σήμερα.",bedtime: "Καληνύχτα! Τώρα είναι ώρα για: {name}.",sleepEnd: "Σε λίγο τελειώνει. Όνειρα γλυκά!",templates: ["Το φαγητό είναι έτοιμο!","Πλύνε τα δόντια σου, σε παρακαλώ.","Φεύγουμε σε 10 λεπτά.","Μάζεψε τα πράγματά σου, σε παρακαλώ."]},
  ru: {rest: "Ещё {min} минут, и на сегодня всё.",bedtime: "Спокойной ночи! Теперь время для: {name}.",sleepEnd: "Скоро конец. Спи сладко!",templates: ["Еда готова!","Почисти зубки, пожалуйста.","Выходим через 10 минут.","Приберись, пожалуйста."]},
  uk: {rest: "Ще {min} хвилин, і на сьогодні все.",bedtime: "На добраніч! Тепер час для: {name}.",sleepEnd: "Скоро кінець. Солодких снів!",templates: ["Їжа готова!","Почисть зубки, будь ласка.","Виходимо через 10 хвилин.","Прибери, будь ласка."]},
  ar: {rest: "بقيت {min} دقائق، ثم ينتهي الوقت لهذا اليوم.",bedtime: "تصبح على خير! حان الآن وقت: {name}.",sleepEnd: "سننتهي بعد قليل. نومًا هنيئًا!",templates: ["الطعام جاهز!","نظّف أسنانك من فضلك.","سنخرج بعد 10 دقائق.","رتّب أغراضك من فضلك."]},
  zh: {rest: "还有 {min} 分钟，今天就到这里了。",bedtime: "晚安！现在是{name}时间。",sleepEnd: "马上就结束了。睡个好觉！",templates: ["饭做好了！","请去刷牙。","我们 10 分钟后出发。","请收拾一下东西。"]},
  hi: {rest: "बस {min} मिनट और, फिर आज के लिए बस।",bedtime: "शुभ रात्रि! अब {name} का समय है।",sleepEnd: "बस थोड़ी देर में खत्म। अच्छे से सोना!",templates: ["खाना तैयार है!","कृपया दाँत साफ़ करो।","हम 10 मिनट में निकल रहे हैं।","कृपया सामान समेट लो।"]},
  ja: {rest: "あと {min} 分で、きょうはおしまいだよ。",bedtime: "おやすみなさい！{name}の時間だよ。",sleepEnd: "もうすぐおしまい。ぐっすりおやすみ！",templates: ["ごはんができたよ！","歯をみがいてね。","10 分後に出かけるよ。","おかたづけしてね。"]},
}

export const SPEECH_DEFAULT_CONFIG: SpeechConfig = {
  engine: 'google',
  fallback: 'google',
  voices: {},
  rest: { on: false, minutes: 5 },
  bedtime: { on: false },
  sleepEnd: { on: false },
  level: 1,
  parents: { on: true, gong: true, pause: true },
  texts: {},
  templates: {},
}
const LEVELS = [0.4, 0.7, 1]
const REST_MINUTES = [2, 5, 10, 15]

/** The setting as stored (mupibox.speech), completed with the defaults. */
export function speechOf(cfg: unknown): SpeechConfig {
  const raw = ((cfg as { mupibox?: { speech?: unknown } } | undefined)?.mupibox?.speech ?? {}) as Partial<SpeechConfig>
  const d = SPEECH_DEFAULT_CONFIG
  const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
  const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def)
  const rest = obj(raw.rest)
  const parents = obj(raw.parents)
  return {
    engine: raw.engine === 'piper' || raw.engine === 'off' || raw.engine === 'google' ? raw.engine : d.engine,
    fallback: raw.fallback === 'off' ? 'off' : 'google',
    voices: Object.fromEntries(Object.entries(obj(raw.voices)).filter(([l, v]) => l in SPEECH_LANGS && typeof v === 'string' && VOICE_KEY.test(v))) as Record<string, string>,
    rest: { on: bool(rest.on, d.rest.on), minutes: REST_MINUTES.includes(rest.minutes as number) ? (rest.minutes as number) : d.rest.minutes },
    bedtime: { on: bool(obj(raw.bedtime).on, d.bedtime.on) },
    sleepEnd: { on: bool(obj(raw.sleepEnd).on, d.sleepEnd.on) },
    level: LEVELS.includes(raw.level as number) ? (raw.level as number) : d.level,
    parents: { on: bool(parents.on, d.parents.on), gong: bool(parents.gong, d.parents.gong), pause: bool(parents.pause, d.parents.pause) },
    texts: obj(raw.texts) as Record<string, Partial<SpeechTexts>>,
    templates: obj(raw.templates) as Record<string, string[]>,
  }
}

const VOICE_KEY = /^[a-z]{2,3}_[A-Z]{2}-[A-Za-z0-9_]+-(x_low|low|medium|high)$/
const MAX_TEXT = 300

/** A setting from the app, checked (only what it sends); null when something is not right. */
export function parseSpeech(body: unknown, current: SpeechConfig): SpeechConfig | null {
  const b = (body ?? {}) as Record<string, unknown>
  const next: SpeechConfig = JSON.parse(JSON.stringify(current))
  if (b.engine !== undefined) {
    if (b.engine !== 'piper' && b.engine !== 'google' && b.engine !== 'off') return null
    next.engine = b.engine
  }
  if (b.fallback !== undefined) {
    if (b.fallback !== 'google' && b.fallback !== 'off') return null
    next.fallback = b.fallback
  }
  if (b.level !== undefined) {
    if (!LEVELS.includes(b.level as number)) return null
    next.level = b.level as number
  }
  const flags = (v: unknown, keys: string[]) => (v && typeof v === 'object' ? Object.entries(v as Record<string, unknown>).filter(([k]) => keys.includes(k)) : [])
  for (const [part, keys] of [
    ['rest', ['on']],
    ['bedtime', ['on']],
    ['sleepEnd', ['on']],
    ['parents', ['on', 'gong', 'pause']],
  ] as const) {
    for (const [k, v] of flags(b[part], keys as unknown as string[])) {
      if (typeof v !== 'boolean') return null
      ;(next[part] as Record<string, unknown>)[k] = v
    }
  }
  const rest = b.rest as Record<string, unknown> | undefined
  if (rest?.minutes !== undefined) {
    if (!REST_MINUTES.includes(rest.minutes as number)) return null
    next.rest.minutes = rest.minutes as number
  }
  // the texts and templates of one language
  if (b.lang !== undefined) {
    if (typeof b.lang !== 'string' || !(b.lang in SPEECH_LANGS)) return null
    const lang = b.lang
    const texts = b.texts as Record<string, unknown> | undefined
    if (texts !== undefined) {
      if (!texts || typeof texts !== 'object') return null
      const own = { ...(next.texts[lang] ?? {}) }
      for (const k of ['rest', 'bedtime', 'sleepEnd'] as const) {
        if (texts[k] === undefined) continue
        const t = String(texts[k]).replace(/\s+/g, ' ').trim()
        if (t.length > MAX_TEXT) return null
        if (t) own[k] = t
        else delete own[k]
      }
      next.texts[lang] = own
    }
    if (b.templates !== undefined) {
      if (!Array.isArray(b.templates) || b.templates.length > 20) return null
      const list = b.templates.map((t) => String(t).replace(/\s+/g, ' ').trim()).filter(Boolean)
      if (list.some((t) => t.length > MAX_TEXT)) return null
      next.templates[lang] = list
    }
  }
  if (b.voice !== undefined) {
    const v = b.voice as Record<string, unknown>
    if (!v || typeof v.lang !== 'string' || !(v.lang in SPEECH_LANGS) || typeof v.key !== 'string' || !VOICE_KEY.test(v.key)) return null
    next.voices[v.lang] = v.key
  }
  return next
}

/** The texts of a language: the parents' own, else the language's defaults (English for a language without). */
// A sentence to try a voice with, per language
export const SPEECH_HELLO: Record<string, string> = {
  de: 'Hallo! Ich bin deine MuPiBox. Schön, dass du da bist.',
  en: 'Hello! I am your MuPiBox. Nice to have you here.',
  fr: 'Bonjour ! Je suis ta MuPiBox. Contente que tu sois là.',
  es: '¡Hola! Soy tu MuPiBox. Qué bien que estés aquí.',
  it: 'Ciao! Sono la tua MuPiBox. Che bello che tu sia qui.',
  nl: 'Hallo! Ik ben je MuPiBox. Fijn dat je er bent.',
  da: 'Hej! Jeg er din MuPiBox. Dejligt, at du er her.',
  sv: 'Hej! Jag är din MuPiBox. Vad roligt att du är här.',
  nb: 'Hei! Jeg er din MuPiBox. Så fint at du er her.',
  fi: 'Hei! Olen sinun MuPiBoxisi. Kiva, että olet täällä.',
  pl: 'Cześć! Jestem twoim MuPiBoxem. Fajnie, że jesteś.',
  cs: 'Ahoj! Jsem tvůj MuPiBox. Jsem rád, že jsi tady.',
  tr: 'Merhaba! Ben senin MuPiBox’ınım. İyi ki buradasın.',
  pt: 'Olá! Sou a tua MuPiBox. Que bom que estás aqui.',
  el: 'Γεια σου! Είμαι το MuPiBox σου. Χαίρομαι που είσαι εδώ.',
  ru: 'Привет! Я твой MuPiBox. Как хорошо, что ты здесь.',
  uk: 'Привіт! Я твій MuPiBox. Як добре, що ти тут.',
  ar: 'مرحبًا! أنا صندوق MuPiBox الخاص بك. يسعدني أنك هنا.',
  zh: '你好！我是你的 MuPiBox。很高兴你在这里。',
  hi: 'नमस्ते! मैं तुम्हारा MuPiBox हूँ। अच्छा लगा कि तुम यहाँ हो।',
  ja: 'こんにちは！ぼくはきみの MuPiBox だよ。来てくれてうれしいな。',
}

export function speechTexts(sp: SpeechConfig, lang: string): SpeechTexts & { templates: string[]; hello: string } {
  const def = SPEECH_DEFAULTS[lang] ?? SPEECH_DEFAULTS.en
  const own = sp.texts[lang] ?? {}
  return { rest: own.rest || def.rest, bedtime: own.bedtime || def.bedtime, sleepEnd: own.sleepEnd || def.sleepEnd, templates: sp.templates[lang] ?? def.templates, hello: SPEECH_HELLO[lang] ?? SPEECH_HELLO.en }
}

/* ---------- the voices ---------- */

export interface VoiceInfo {
  key: string
  name: string
  lang: string
  region: string
  quality: string
  size: number
  installed: boolean
  files: string[]
}

let catalog: Record<string, { key: string; name: string; language: { family: string; code: string; country_english?: string }; quality: string; files: Record<string, { size_bytes: number }> }> | null = null
let catalogAt = 0

// The list of Piper's voices (voices.json of piper-voices), kept on the box for a day
async function loadCatalog(): Promise<NonNullable<typeof catalog>> {
  if (catalog && Date.now() - catalogAt < 24 * 3600e3) return catalog
  try {
    const r = await fetch(`${HF}/voices.json`, { signal: AbortSignal.timeout(15000) })
    if (!r.ok) throw new Error(`voices.json ${r.status}`)
    const text = await r.text()
    catalog = JSON.parse(text)
    catalogAt = Date.now()
    await fsp.mkdir(PIPER_DIR, { recursive: true })
    await fsp.writeFile(CATALOG_FILE, text).catch(() => undefined)
  } catch (err) {
    // (offline: the copy on the box)
    if (!catalog) catalog = JSON.parse(await fsp.readFile(CATALOG_FILE, 'utf8').catch(() => '{}'))
    // (tried again in 5 minutes, not at every request - each attempt can wait 15 s)
    catalogAt = Date.now() - 24 * 3600e3 + 5 * 60e3
    console.warn(`${new Date().toLocaleString()}: [speech] voices list: ${(err as Error).message}`)
  }
  return catalog ?? {}
}

const voiceFile = (key: string) => `${VOICE_DIR}/${key}.onnx`

// The Piper on the box (2023.11) speaks voices whose sounds come from eSpeak (or plain text). Some newer voices of
// Chinese and Japanese need their own (pinyin, japanese) and stay silent with it: those are left out, found in each
// voice's .onnx.json (kept once read; not readable now: offered, the install checks again).
const OWN_PHONEMES = new Set(['zh', 'ja'])
const phonemeTypes = new Map<string, string>()
const PLAYABLE_PHONEMES = ['espeak', 'text']

async function phonemeType(jsonFile: string): Promise<string | null> {
  const known = phonemeTypes.get(jsonFile)
  if (known) return known
  try {
    const r = await fetch(`${HF}/${jsonFile}`, { signal: AbortSignal.timeout(10000) })
    if (!r.ok) return null
    const type = String(((await r.json()) as { phoneme_type?: unknown }).phoneme_type ?? 'espeak')
    phonemeTypes.set(jsonFile, type)
    return type
  } catch {
    return null
  }
}

/** Whether the list of Piper's voices could be read (from the internet or the copy on the box) */
export async function voiceCatalogKnown(): Promise<boolean> {
  return Object.keys(await loadCatalog()).length > 0
}

/** The voices of a language (the app's code), the installed ones marked. */
export async function listVoices(lang: string): Promise<VoiceInfo[]> {
  const family = SPEECH_LANGS[lang]
  if (!family) return []
  const cat = await loadCatalog()
  const order = ['high', 'medium', 'low', 'x_low']
  const voices = Object.values(cat).filter((v) => v.language?.family === family && VOICE_KEY.test(v.key))
  const playable = new Set<string>()
  await Promise.all(
    voices.map(async (v) => {
      const json = Object.keys(v.files).find((f) => f.endsWith('.onnx.json'))
      const type = OWN_PHONEMES.has(family) && json ? await phonemeType(json) : null
      if (type === null || PLAYABLE_PHONEMES.includes(type)) playable.add(v.key)
    }),
  )
  return voices
    .filter((v) => playable.has(v.key))
    .map((v) => ({
      key: v.key,
      name: v.name,
      lang,
      region: v.language.code.split('_')[1] ?? '',
      quality: v.quality,
      size: Object.entries(v.files).filter(([f]) => f.endsWith('.onnx')).reduce((s, [, f]) => s + f.size_bytes, 0),
      installed: existsSync(voiceFile(v.key)),
      files: Object.keys(v.files),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || order.indexOf(a.quality) - order.indexOf(b.quality))
}

/** The installed voices of every language: {lang: [keys]} and the space they take. */
export async function installedVoices(): Promise<{ byLang: Record<string, string[]>; bytes: number }> {
  const files = await fsp.readdir(VOICE_DIR).catch(() => [] as string[])
  const byLang: Record<string, string[]> = {}
  let bytes = 0
  for (const f of files.filter((x) => x.endsWith('.onnx'))) {
    const key = f.slice(0, -5)
    const family = key.slice(0, key.indexOf('_'))
    const lang = Object.entries(SPEECH_LANGS).find(([, fam]) => fam === family)?.[0]
    if (lang) (byLang[lang] ??= []).push(key)
    bytes += (await fsp.stat(`${VOICE_DIR}/${f}`).catch(() => ({ size: 0 }))).size
  }
  return { byLang, bytes }
}

// Where a sample of a voice lies (piper-voices: samples/speaker_0.mp3 next to the voice)
export async function sampleUrl(key: string): Promise<string | null> {
  const v = (await loadCatalog())[key]
  const onnx = v && Object.keys(v.files).find((f) => f.endsWith('.onnx'))
  return onnx ? `${HF}/${path.posix.dirname(onnx)}/samples/speaker_0.mp3` : null
}

/** The voice's model card: where its recordings come from and their licence. */
export async function voiceLicense(key: string): Promise<{ license: string; url: string } | null> {
  const v = (await loadCatalog())[key]
  const card = v && Object.keys(v.files).find((f) => f.endsWith('MODEL_CARD'))
  if (!card) return null
  const r = await fetch(`${HF}/${card}`, { signal: AbortSignal.timeout(8000) }).catch(() => null)
  if (!r?.ok) return null
  const text = await r.text()
  return { license: /License:\s*(.+)/i.exec(text)?.[1]?.trim() ?? '', url: /URL:\s*(\S+)/i.exec(text)?.[1]?.trim() ?? '' }
}

// A download from Hugging Face / GitHub into a file (a temporary one, renamed when complete)
async function download(url: string, file: string, onBytes?: (n: number) => void): Promise<void> {
  const r = await fetch(url, { signal: AbortSignal.timeout(15 * 60e3) })
  if (!r.ok || !r.body) throw new Error(`download ${r.status}`)
  const tmp = `${file}.part`
  let n = 0
  const counted = Readable.fromWeb(r.body as never).on('data', (c: Buffer) => {
    n += c.length
    onBytes?.(n)
  })
  await pipeline(counted, createWriteStream(tmp))
  await fsp.rename(tmp, file)
}

// The Piper program itself, once (with its espeak-ng data and libraries: about 26 MB, 70 MB unpacked)
async function ensurePiper(): Promise<void> {
  if (existsSync(PIPER_BIN)) return
  const arch = process.arch === 'arm64' ? 'aarch64' : process.arch === 'arm' ? 'armv7l' : process.arch === 'x64' ? 'x86_64' : ''
  if (!arch) throw new Error(`no piper for ${process.arch}`)
  await fsp.mkdir(PIPER_DIR, { recursive: true })
  const tgz = `${PIPER_DIR}/piper.tar.gz`
  await download(`${PIPER_RELEASE}/piper_linux_${arch}.tar.gz`, tgz)
  await run('tar', ['-xzf', tgz, '-C', PIPER_DIR], 120000)
  await fsp.rm(tgz, { force: true })
  if (!existsSync(PIPER_BIN)) throw new Error('piper not unpacked')
}

export interface VoiceJob {
  key: string
  state: 'running' | 'done' | 'failed'
  bytes: number
  total: number
  error?: string
}
let voiceJob: VoiceJob | null = null
export const currentVoiceJob = (): VoiceJob | null => voiceJob
// (what runs when a voice is there: the names made in advance, see speech-routes.ts)
let afterInstall: (() => Promise<void>) | null = null
export const onVoiceInstalled = (fn: () => Promise<void>): void => {
  afterInstall = fn
}

/** Loads a voice (and Piper, the first time) in the background; the app follows it with currentVoiceJob(). */
export async function installVoice(key: string): Promise<boolean> {
  if (voiceJob?.state === 'running') return false
  const v = (await loadCatalog())[key]
  if (!v || !VOICE_KEY.test(key)) return false
  const onnx = Object.keys(v.files).find((f) => f.endsWith('.onnx'))
  const json = Object.keys(v.files).find((f) => f.endsWith('.onnx.json'))
  if (!onnx || !json) return false
  const job: VoiceJob = { key, state: 'running', bytes: 0, total: v.files[onnx].size_bytes }
  voiceJob = job
  void (async () => {
    try {
      await ensurePiper()
      await fsp.mkdir(VOICE_DIR, { recursive: true })
      await download(`${HF}/${json}`, `${voiceFile(key)}.json`)
      // (a voice the Piper on the box cannot speak: not loaded, see PLAYABLE_PHONEMES)
      const type = String((JSON.parse(await fsp.readFile(`${voiceFile(key)}.json`, 'utf8')) as { phoneme_type?: unknown }).phoneme_type ?? 'espeak')
      if (!PLAYABLE_PHONEMES.includes(type)) {
        await fsp.rm(`${voiceFile(key)}.json`, { force: true })
        throw new Error(`phoneme type ${type} not supported`)
      }
      await download(`${HF}/${onnx}`, voiceFile(key), (n) => (job.bytes = n))
      job.state = 'done'
      if (afterInstall) void afterInstall().catch(() => undefined)
    } catch (err) {
      job.state = 'failed'
      job.error = (err as Error).message
      await fsp.rm(`${voiceFile(key)}.part`, { force: true }).catch(() => undefined)
      console.warn(`${new Date().toLocaleString()}: [speech] voice ${key}: ${job.error}`)
    }
  })()
  return true
}

/** Deletes a voice (and what was said with it). */
export async function removeVoice(key: string): Promise<void> {
  if (!VOICE_KEY.test(key)) return
  workers.get(key)?.stop()
  workers.delete(key)
  await fsp.rm(voiceFile(key), { force: true })
  await fsp.rm(`${voiceFile(key)}.json`, { force: true })
  await fsp.rm(`${CACHE_DIR}/${key}`, { recursive: true, force: true })
}

/* ---------- speaking ---------- */

function run(cmd: string, args: string[], timeout = 30000, input?: string): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    const child = execFile(cmd, args, { timeout, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => resolve({ ok: !err, stdout: String(stdout ?? '') }))
    if (input !== undefined) {
      child.stdin?.end(input)
    }
  })
}

/** The Piper voice the box speaks with in a language: the chosen one if it is there, else any installed one. */
export async function activeVoice(sp: SpeechConfig, lang: string): Promise<string | null> {
  if (!existsSync(PIPER_BIN)) return null
  const chosen = sp.voices[lang]
  if (chosen && existsSync(voiceFile(chosen))) return chosen
  return (await installedVoices()).byLang[lang]?.[0] ?? null
}

/** A text as a WAV of a Piper voice (kept: the same text is not worked out again). */
export async function piperWav(text: string, key: string, background = false): Promise<string | null> {
  const file = piperCacheFile(text, key)
  if (existsSync(file)) return file
  await fsp.mkdir(path.dirname(file), { recursive: true })
  return (await piperWorker(key).say(text, file, background)) ? file : null
}

const piperCacheFile = (text: string, key: string) => `${CACHE_DIR}/${key}/${createHash('sha1').update(text).digest('hex').slice(0, 16)}.wav`

/**
 * A Piper that stays loaded: loading a voice takes 1-2 s on a Pi 4, speaking a name then well under a second. One
 * text after the other (the display's names before the ones made in advance); it ends after 10 minutes without work,
 * and its memory is free again.
 */
class PiperWorker {
  private child: import('node:child_process').ChildProcessWithoutNullStreams | null = null
  private jobs: { text: string; file: string; done: (ok: boolean) => void }[] = []
  private current: { file: string; done: (ok: boolean) => void; timer: NodeJS.Timeout } | null = null
  private idle: NodeJS.Timeout | null = null
  private out = ''

  constructor(readonly key: string) {}

  say(text: string, file: string, background: boolean): Promise<boolean> {
    this.lastUsed = Date.now()
    return new Promise((done) => {
      const job = { text: text.replace(/\s+/g, ' '), file, done }
      if (background) this.jobs.push(job)
      else this.jobs.unshift(job)
      this.next()
    })
  }

  stop(): void {
    this.child?.kill()
    this.child = null
    // (what was still waiting is not said: whoever waits for it hears so)
    for (const job of this.jobs.splice(0)) job.done(false)
  }

  /** Whether it has a text to say now or waiting. */
  get busy(): boolean {
    return !!this.current || this.jobs.length > 0
  }

  lastUsed = Date.now()

  private start(): void {
    const child = spawn('nice', ['-n', '5', PIPER_BIN, '--model', voiceFile(this.key), '--json-input', '--output_dir', CACHE_DIR], { stdio: 'pipe' })
    this.child = child
    this.out = ''
    // (Piper names each file it wrote on a line of its own)
    child.stdout.on('data', (c: Buffer) => {
      this.out += c.toString()
      let nl = this.out.indexOf('\n')
      while (nl >= 0) {
        const line = this.out.slice(0, nl).trim()
        this.out = this.out.slice(nl + 1)
        if (this.current && line === this.current.file) this.finish(existsSync(line))
        nl = this.out.indexOf('\n')
      }
    })
    child.stderr.on('data', () => undefined)
    child.on('exit', () => {
      if (this.child === child) this.child = null
      if (this.current) this.finish(false)
    })
    child.on('error', () => undefined)
  }

  private finish(ok: boolean): void {
    if (!this.current) return
    clearTimeout(this.current.timer)
    this.current.done(ok)
    this.current = null
    this.next()
  }

  private next(): void {
    if (this.current) return
    const job = this.jobs.shift()
    if (this.idle) clearTimeout(this.idle)
    if (!job) {
      this.idle = setTimeout(() => this.stop(), 10 * 60e3)
      return
    }
    if (!this.child) this.start()
    // (a text that hangs: Piper again for the next one)
    this.current = { file: job.file, done: job.done, timer: setTimeout(() => this.stop(), 30000) }
    this.child?.stdin.write(`${JSON.stringify({ text: job.text, output_file: job.file })}\n`)
  }
}

const workers = new Map<string, PiperWorker>()
function piperWorker(key: string): PiperWorker {
  let w = workers.get(key)
  if (!w) {
    // Two voices loaded at most (the box's and one being tried, e.g.): the one used longest ago ends - never one that
    // still has a text to say (a test broke off the names made in advance, and the other way round)
    const idle = [...workers.values()].filter((x) => !x.busy).sort((a, b) => a.lastUsed - b.lastUsed)
    while (workers.size >= 2 && idle.length) {
      const old = idle.shift() as PiperWorker
      old.stop()
      workers.delete(old.key)
    }
    w = new PiperWorker(key)
    workers.set(key, w)
  }
  return w
}

// The names made with voices not in use for a week (another voice chosen, a voice only tried): deleted, the voices
// themselves stay loaded. Switching back and forth keeps them; a voice chosen again gets its names made again.
// (.chosen in a voice's folder: when it was last the chosen one; without it the folder's own time - a test's)
const UNUSED_MS = 7 * 24 * 3600e3
async function clearUnusedNames(sp: SpeechConfig, active: string): Promise<void> {
  const keep = new Set([active, ...Object.values(sp.voices)])
  for (const voice of keep) {
    await fsp.mkdir(`${CACHE_DIR}/${voice}`, { recursive: true }).catch(() => undefined)
    await fsp.writeFile(`${CACHE_DIR}/${voice}/.chosen`, '').catch(() => undefined)
  }
  for (const dir of await fsp.readdir(CACHE_DIR).catch(() => [] as string[])) {
    if (keep.has(dir) || workers.get(dir)?.busy) continue
    const at = (await fsp.stat(`${CACHE_DIR}/${dir}/.chosen`).catch(() => fsp.stat(`${CACHE_DIR}/${dir}`)).catch(() => null))?.mtimeMs ?? 0
    if (Date.now() - at < UNUSED_MS) continue
    await fsp.rm(`${CACHE_DIR}/${dir}`, { recursive: true, force: true }).catch(() => undefined)
  }
}

// The names the display reads out (the library's artists and albums), made in advance in the background: then they
// come as fast as before with Google's saved files. After the start, after a voice was loaded or chosen, and whenever
// the library changed (added in the app or the admin interface, an index update, the Smart-Sync): only the new names.
const LIBRARY_FILE = '/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json'
let preparing = false
let prepareAgain = false
export async function prepareNames(getConfig: () => unknown): Promise<void> {
  // (asked again meanwhile - the library changed while the names were made: once more afterwards)
  if (preparing) {
    prepareAgain = true
    return
  }
  const cfg = getConfig()
  const sp = speechOf(cfg)
  if (sp.engine !== 'piper') return
  const voice = await activeVoice(sp, boxLanguage(cfg))
  if (!voice) return
  preparing = true
  try {
    await clearUnusedNames(sp, voice)
    const list = JSON.parse(await fsp.readFile(LIBRARY_FILE, 'utf8').catch(() => '[]')) as { artist?: unknown; title?: unknown }[]
    // (as the player gets them: a "/" becomes a space, see spotify-control.js)
    const names = [...new Set(list.flatMap((e) => [e.artist, e.title]).filter((n): n is string => typeof n === 'string' && n.trim() !== '').map((n) => n.replace(/\//g, ' ')))]
    let made = 0
    for (const name of names.slice(0, 3000)) {
      if (existsSync(piperCacheFile(name, voice))) continue
      if (speechOf(getConfig()).engine !== 'piper') break
      if (await piperWav(name, voice, true)) made++
    }
    if (made) console.log(`${new Date().toLocaleString()}: [speech] ${made} names made in advance with ${voice}`)
  } finally {
    preparing = false
  }
  if (prepareAgain) {
    prepareAgain = false
    await prepareNames(getConfig)
  }
}

/** A text as an MP3 of Google's voice (online; at most 200 characters, as translate_tts takes it). */
async function googleMp3(text: string, lang: string): Promise<string | null> {
  const tl = lang === 'nb' ? 'no' : lang
  const file = `/tmp/mupi-say-google-${createHash('sha1').update(`${tl}|${text}`).digest('hex').slice(0, 16)}.mp3`
  if (existsSync(file)) return file
  const r = await fetch(`https://translate.google.com/translate_tts?${new URLSearchParams({ ie: 'UTF-8', q: text.slice(0, 200), tl, client: 'tw-ob' })}`, {
    signal: AbortSignal.timeout(10000),
  }).catch(() => null)
  if (!r?.ok) return null
  await fsp.writeFile(file, Buffer.from(await r.arrayBuffer()))
  return file
}

/** The sound of a text in the box's setting: Piper, else Google or nothing (as chosen). */
export async function speechFile(sp: SpeechConfig, text: string, lang: string): Promise<string | null> {
  if (sp.engine === 'off') return null
  if (sp.engine === 'piper') {
    const voice = await activeVoice(sp, lang)
    if (voice) return piperWav(text, voice)
    if (sp.fallback === 'off') return null
  }
  return googleMp3(text, lang)
}

// The gong before an announcement: two soft tones, made once
const GONG_FILE = '/tmp/mupi-gong.wav'
async function gong(): Promise<string> {
  if (existsSync(GONG_FILE)) return GONG_FILE
  const rate = 22050
  const tones = [
    [880, 0, 0.9],
    [660, 0.35, 1.3],
  ]
  const n = Math.round(rate * 1.4)
  const data = Buffer.alloc(n * 2)
  for (let i = 0; i < n; i++) {
    const t = i / rate
    let s = 0
    for (const [f, start, end] of tones) if (t >= start && t < end) s += Math.sin(2 * Math.PI * f * (t - start)) * Math.exp(-4 * (t - start)) * 0.35
    data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(s * 32767))), i * 2)
  }
  const head = Buffer.alloc(44)
  head.write('RIFF', 0)
  head.writeUInt32LE(36 + data.length, 4)
  head.write('WAVEfmt ', 8)
  head.writeUInt32LE(16, 16)
  head.writeUInt16LE(1, 20)
  head.writeUInt16LE(1, 22)
  head.writeUInt32LE(rate, 24)
  head.writeUInt32LE(rate * 2, 28)
  head.writeUInt16LE(2, 32)
  head.writeUInt16LE(16, 34)
  head.write('data', 36)
  head.writeUInt32LE(data.length, 40)
  await fsp.writeFile(GONG_FILE, Buffer.concat([head, data]))
  return GONG_FILE
}

// Plays a file over PulseAudio (a WAV with paplay, an MP3 with mplayer), `level` of the box's volume
function playFile(file: string, level: number): Promise<void> {
  const args = file.endsWith('.wav')
    ? ['paplay', [`--volume=${Math.round(level * 65536)}`, file]]
    : ['mplayer', ['-really-quiet', '-nolirc', '-ao', 'pulse', '-softvol', '-volume', String(Math.round(level * 100)), file]]
  return new Promise((resolve) => {
    const child = spawn(args[0] as string, args[1] as string[], { stdio: 'ignore' })
    const timer = setTimeout(() => child.kill(), 60000)
    child.on('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

// What plays now (the box's player): true while something plays
async function playingNow(): Promise<boolean> {
  try {
    const r = await fetch('http://127.0.0.1:5005/playing', { signal: AbortSignal.timeout(3000) })
    return ((await r.json()) as { playing?: boolean }).playing === true
  } catch {
    return false
  }
}
const player = (action: 'pause' | 'play') => fetch(`http://127.0.0.1:5005/${action}?src=eltern`, { signal: AbortSignal.timeout(3000) }).catch(() => undefined)

// The other sounds quieter while the box speaks (PulseAudio's streams), and back
async function duck(): Promise<() => Promise<void>> {
  const list = await run('pactl', ['-f', 'json', 'list', 'sink-inputs'], 5000)
  let inputs: { index: number; volume: Record<string, { value_percent: string }> }[] = []
  try {
    inputs = JSON.parse(list.stdout)
  } catch {
    return async () => undefined
  }
  const before = inputs.map((i) => [i.index, Object.values(i.volume)[0]?.value_percent ?? '100%'] as const)
  for (const [id, vol] of before) await run('pactl', ['set-sink-input-volume', String(id), `${Math.round(Number.parseInt(vol, 10) * 0.25)}%`], 3000)
  return async () => {
    for (const [id, vol] of before) await run('pactl', ['set-sink-input-volume', String(id), vol], 3000)
  }
}

let queue: Promise<unknown> = Promise.resolve()

/**
 * Says a text on the box now (one after the other): gong, the music paused (or quieter), the text, the music again.
 * false when there is nothing to say it with (stumm, no voice and no Google).
 */
export async function announce(getConfig: () => unknown, text: string, opts: { gong?: boolean; pause?: boolean; voice?: string } = {}): Promise<boolean> {
  const cfg = getConfig()
  const sp = speechOf(cfg)
  const lang = boxLanguage(cfg)
  // (a test of one loaded voice: that one, whatever the box speaks with otherwise)
  const file = opts.voice ? (VOICE_KEY.test(opts.voice) && existsSync(voiceFile(opts.voice)) && existsSync(PIPER_BIN) ? await piperWav(text.slice(0, MAX_TEXT), opts.voice) : null) : await speechFile(sp, text.slice(0, MAX_TEXT), lang)
  if (!file) return false
  queue = queue.then(async () => {
    const wasPlaying = await playingNow()
    const pause = opts.pause ?? sp.parents.pause
    let restore: (() => Promise<void>) | null = null
    if (wasPlaying && pause) {
      await player('pause')
      await new Promise((r) => setTimeout(r, 400))
    } else if (wasPlaying) restore = await duck()
    if (opts.gong ?? sp.parents.gong) await playFile(await gong(), sp.level)
    await playFile(file, sp.level)
    if (restore) await restore()
    if (wasPlaying && pause) await player('play')
  })
  await queue.catch(() => undefined)
  return true
}

/** The language the box speaks in (mupibox.ttsLanguage, as the names it reads out). */
export function boxLanguage(cfg: unknown): string {
  // (Google names Norwegian "no", the app "nb")
  const raw = (cfg as { mupibox?: { ttsLanguage?: unknown } } | undefined)?.mupibox?.ttsLanguage
  const l = raw === 'no' ? 'nb' : raw
  return typeof l === 'string' && l in SPEECH_LANGS ? l : 'de'
}

/* ---------- the automatic announcements ---------- */

const said = { rest: '', bedtimeWindow: false, sleepRun: 0 }

async function tick(getConfig: () => unknown): Promise<void> {
  const cfg = getConfig()
  const sp = speechOf(cfg)
  if (sp.engine === 'off' || !(sp.rest.on || sp.bedtime.on || sp.sleepEnd.on)) return
  const lang = boxLanguage(cfg)
  const texts = speechTexts(sp, lang)
  let pt: { playtime?: { enabled?: boolean; state?: string; date?: string; remainingSeconds?: number }; quiet?: { inWindow?: boolean; label?: string } } = {}
  try {
    pt = JSON.parse(await fsp.readFile('/tmp/playtime.json', 'utf8'))
  } catch {
    // no playtime state yet
  }
  const playing = await playingNow()
  // the rest of today's playing time, once a day, while something plays
  const left = pt.playtime?.remainingSeconds ?? -1
  if (sp.rest.on && pt.playtime?.enabled && pt.playtime.state === 'normal' && playing && left > 0 && left <= sp.rest.minutes * 60) {
    const mark = `${pt.playtime.date}|${sp.rest.minutes}`
    if (said.rest !== mark && left > sp.rest.minutes * 60 - 90) {
      said.rest = mark
      await announce(getConfig, texts.rest.replace(/\{min\}/g, String(Math.max(1, Math.round(left / 60)))), { gong: true })
    }
  }
  // a quiet window begins while something plays
  const inWindow = pt.quiet?.inWindow === true
  if (sp.bedtime.on && inWindow && !said.bedtimeWindow && playing) {
    await announce(getConfig, texts.bedtime.replace(/\{name\}/g, pt.quiet?.label || ''), { gong: true })
  }
  said.bedtimeWindow = inWindow
  // the sleep timer ends in about a minute
  if (sp.sleepEnd.on) {
    const remaining = Number.parseInt(await fsp.readFile('/tmp/.time2sleep', 'utf8').catch(() => ''), 10)
    if (Number.isFinite(remaining) && remaining > 40 && remaining <= 70) {
      const run = Math.round((Date.now() + remaining * 1000) / 60000)
      if (said.sleepRun !== run) {
        said.sleepRun = run
        await announce(getConfig, texts.sleepEnd, { gong: false, pause: false })
      }
    }
  }
}

/** Every 15 seconds, from the start of the server; the names made in advance after a minute and when the library
 *  changed (its file's time, looked at every minute - once it stayed the same for half a minute). */
export function startSpeech(getConfig: () => unknown): void {
  setInterval(() => void tick(getConfig).catch(() => undefined), 15000).unref()
  setTimeout(() => void prepareNames(getConfig).catch(() => undefined), 60000).unref()
  let seen = 0
  let changedAt = 0
  setInterval(async () => {
    const mtime = (await fsp.stat(LIBRARY_FILE).catch(() => null))?.mtimeMs ?? 0
    if (!seen) seen = mtime
    else if (mtime !== seen) {
      seen = mtime
      changedAt = Date.now()
    } else if (changedAt && Date.now() - changedAt >= 30000) {
      changedAt = 0
      void prepareNames(getConfig).catch(() => undefined)
    }
  }, 30000).unref()
}
