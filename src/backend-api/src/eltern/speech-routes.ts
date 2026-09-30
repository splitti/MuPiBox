// Einstellungen › Audio › Sprachausgabe: the voices (Piper), the automatic announcements and the parents' ones
// (speech.ts). Telegram's /sag and the player's reading out of names come from the box itself (localOnly).

import { promises as fsp } from 'node:fs'
import { Readable } from 'node:stream'
import type { Router } from 'express'
import type { MupiboxConfig } from '../models/mupibox-config.model'
import { localOnly } from '../request-guard'
import {
  SPEECH_LANGS,
  activeVoice,
  announce,
  boxLanguage,
  currentVoiceJob,
  installVoice,
  installedVoices,
  listVoices,
  onVoiceInstalled,
  prepareNames,
  parseSpeech,
  piperWav,
  removeVoice,
  sampleUrl,
  speechOf,
  speechTexts,
  voiceCatalogKnown,
  voiceLicense,
} from '../speech'
import { requireCsrf, requireSession } from './middleware'

export interface SpeechDeps {
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
}

const MAX_SAY = 300

export function registerSpeechRoutes(router: Router, deps: SpeechDeps): void {
  // a new voice (or another chosen): the library's names made with it in the background
  // (2 minutes after the voice was last chosen or loaded: clicking through the voices starts nothing yet)
  let prepareTimer: NodeJS.Timeout | null = null
  const prepare = async () => {
    if (prepareTimer) clearTimeout(prepareTimer)
    prepareTimer = setTimeout(() => {
      prepareTimer = null
      void prepareNames(deps.getMupiboxConfig).catch(() => undefined)
    }, 2 * 60e3)
  }
  onVoiceInstalled(prepare)
  const langParam = (v: unknown) => (typeof v === 'string' && v in SPEECH_LANGS ? v : null)

  /** GET /api/app/speech - the setting, the voice the box speaks with now, the texts of a language (?lang=, else
   *  the box's), per language how many voices are loaded, the space they take. */
  router.get('/speech', requireSession, async (req, res) => {
    const cfg = deps.getMupiboxConfig()
    const sp = speechOf(cfg)
    const box = boxLanguage(cfg)
    const lang = langParam(req.query.lang) ?? box
    const installed = await installedVoices()
    const active = await activeVoice(sp, box)
    const free = await fsp.statfs('/home/dietpi').then((s) => s.bavail * s.bsize).catch(() => null)
    // set up: saved once on the page, not silent, the parents' announcements on, and with Piper a voice (or Google
    // as the way out) - until then the start page's "Durchsage" leads to the page
    const saved = !!(cfg as { mupibox?: { speech?: unknown } } | undefined)?.mupibox?.speech
    const configured = saved && sp.engine !== 'off' && sp.parents.on && (sp.engine !== 'piper' || !!active || sp.fallback === 'google')
    res.json({
      configured,
      config: { engine: sp.engine, fallback: sp.fallback, voices: sp.voices, rest: sp.rest, bedtime: sp.bedtime, sleepEnd: sp.sleepEnd, level: sp.level, parents: sp.parents },
      boxLanguage: box,
      lang,
      // (the announcements' texts: the box's language; the sentence to try a voice with: the language of the list)
      texts: speechTexts(sp, box),
      hello: speechTexts(sp, lang).hello,
      active,
      installed: installed.byLang,
      bytes: installed.bytes,
      free,
      job: currentVoiceJob(),
    })
  })

  /** GET /api/app/speech/voices?lang= - Piper's voices of a language (from its list, kept on the box a day). */
  router.get('/speech/voices', requireSession, async (req, res) => {
    const lang = langParam(req.query.lang)
    if (!lang) {
      res.status(400).json({ error: 'invalid lang' })
      return
    }
    // (known: the list of Piper's voices could be read - without, an empty list says nothing about the language)
    res.json({ voices: await listVoices(lang), known: await voiceCatalogKnown() })
  })

  /** GET /api/app/speech/license?key= - where a voice's recordings come from and their licence (its model card). */
  router.get('/speech/license', requireSession, async (req, res) => {
    res.json((await voiceLicense(String(req.query.key ?? ''))) ?? {})
  })

  /** GET /api/app/speech/sample?key= - a voice's sample (MP3 from piper-voices), to listen on the phone. */
  router.get('/speech/sample', requireSession, async (req, res) => {
    const url = await sampleUrl(String(req.query.key ?? ''))
    const r = url ? await fetch(url, { signal: AbortSignal.timeout(15000) }).catch(() => null) : null
    if (!r?.ok || !r.body) {
      res.status(404).end()
      return
    }
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Cache-Control', 'private, max-age=86400')
    Readable.fromWeb(r.body as never).pipe(res)
  })

  /** POST /api/app/speech/voice/install {key} - loads a voice (Piper too the first time); GET /speech/job follows it. */
  router.post('/speech/voice/install', requireSession, requireCsrf, async (req, res) => {
    const ok = await installVoice(String((req.body as { key?: unknown } | undefined)?.key ?? ''))
    res.status(ok ? 202 : 409).json({ ok, job: currentVoiceJob() })
  })
  router.get('/speech/job', requireSession, (_req, res) => {
    res.json({ job: currentVoiceJob() })
  })

  /** POST /api/app/speech/voice/remove {key} */
  router.post('/speech/voice/remove', requireSession, requireCsrf, async (req, res) => {
    const key = String((req.body as { key?: unknown } | undefined)?.key ?? '')
    await removeVoice(key)
    // (a language's chosen voice gone: another loaded one of it counts, see activeVoice)
    await deps.updateMupiboxConfig((cfg) => {
      const mb = (cfg.mupibox ?? {}) as Record<string, unknown>
      const speech = (mb.speech ?? {}) as { voices?: Record<string, string> }
      for (const [lang, v] of Object.entries(speech.voices ?? {})) if (v === key) delete speech.voices?.[lang]
    })
    res.json({ ok: true })
  })

  /** POST /api/app/speech {engine?, fallback?, level?, rest?, bedtime?, sleepEnd?, parents?, voice?: {lang, key},
   *  lang + texts? / templates?} - what is sent is changed, the rest stays. */
  router.post('/speech', requireSession, requireCsrf, async (req, res) => {
    const next = parseSpeech(req.body, speechOf(deps.getMupiboxConfig()))
    if (!next) {
      res.status(400).json({ error: 'invalid speech setting' })
      return
    }
    await deps.updateMupiboxConfig((cfg) => {
      cfg.mupibox = { ...((cfg.mupibox as Record<string, unknown>) ?? {}), speech: next }
    })
    res.json({ ok: true })
    const body = (req.body ?? {}) as Record<string, unknown>
    if (body.engine !== undefined || body.voice !== undefined) void prepare().catch(() => undefined)
  })

  // a text to say now (the parents: a template or their own; a test of a text or a voice)
  const say = async (text: unknown, res: import('express').Response, opts: { gong?: boolean; pause?: boolean; voice?: string } = {}) => {
    const t = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : ''
    if (!t || t.length > MAX_SAY) {
      res.status(400).json({ error: 'invalid text' })
      return
    }
    const sp = speechOf(deps.getMupiboxConfig())
    if (sp.engine === 'off' && !opts.voice) {
      res.status(409).json({ error: 'speech_off' })
      return
    }
    // (said in the background: the answer does not wait for the gong and the voice)
    announce(deps.getMupiboxConfig, t, opts).then((ok) => {
      if (!ok) console.warn(`${new Date().toLocaleString()}: [speech] nothing to say it with`)
    })
    res.json({ ok: true })
  }

  /** POST /api/app/speech/say {text, test?} - the box says it now (test: a sample of a text, without gong). */
  router.post('/speech/say', requireSession, requireCsrf, async (req, res) => {
    const body = (req.body ?? {}) as { text?: unknown; test?: unknown; voice?: unknown }
    const sp = speechOf(deps.getMupiboxConfig())
    if (body.test !== true && !sp.parents.on) {
      res.status(409).json({ error: 'announcements_off' })
      return
    }
    // (test: a text, or one loaded voice - voice: its key)
    await say(body.text, res, body.test === true ? { gong: false, pause: false, ...(typeof body.voice === 'string' ? { voice: body.voice } : {}) } : {})
  })

  /** POST /api/app/speech/say-local {text} - from the box itself: Telegram's /sag. */
  router.post('/speech/say-local', localOnly, async (req, res) => {
    if (!speechOf(deps.getMupiboxConfig()).parents.on) {
      res.status(409).json({ error: 'announcements_off' })
      return
    }
    await say((req.body as { text?: unknown } | undefined)?.text, res)
  })

  /** POST /api/app/speech/render {text} - from the box's player: a name to read out as a WAV of the Piper voice.
   *  {file: null} → the player asks Google as before; {off: true} → nothing is read out. */
  router.post('/speech/render', localOnly, async (req, res) => {
    const cfg = deps.getMupiboxConfig()
    const sp = speechOf(cfg)
    const text = String((req.body as { text?: unknown } | undefined)?.text ?? '').slice(0, MAX_SAY)
    if (sp.engine === 'off') {
      res.json({ off: true })
      return
    }
    const voice = sp.engine === 'piper' ? await activeVoice(sp, boxLanguage(cfg)) : null
    if (sp.engine === 'piper' && !voice && sp.fallback === 'off') {
      res.json({ off: true })
      return
    }
    res.json({ file: voice && text ? await piperWav(text, voice) : null })
  })
}
