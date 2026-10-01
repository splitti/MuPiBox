import { HttpClient } from '@angular/common/http'
import { Injectable, inject, signal } from '@angular/core'
import { environment } from '../environments/environment'

// Texts of the overlays on the box display. Per text the box shows, in this order:
//   1. the parents' own text (config displayTexts, set in the parents' web app or the admin interface)
//   2. the chosen language (config displayLanguage) from assets/i18n/display-texts.json
//   3. English
// These English defaults are only used if the language file can't be read.
export const DEFAULT_DISPLAY_TEXTS = {
  blockedHeading: "That's enough music for today",
  blockedSubheading: 'More music tomorrow',
  quietHeading: 'Quiet time',
  quietSubheading: 'Music will be back soon',
  parentsTitle: 'Parent setup',
  parentsHint: 'Scan with your phone or open in a browser:',
  parentsCountdown: 'Disappears in {s} s',
  parentsClose: 'Close',
  // km themes (not editable by the parents, only translated): folder entry with titles of its own, radio live pill,
  // short close button of the track list
  ownFilesLabel: 'All tracks here',
  liveLabel: 'Live',
  connectingLabel: 'Connecting …',
  closeShort: 'Close',
  // list that could not be loaded: NAS folder / radio and podcasts without a connection
  nasUnavailable: 'NAS not reachable',
  offlineLabel: 'No connection',
  // title of the resume page (km themes; the other themes keep "Resume")
  resumeTitle: 'Continue listening',
  outputTitle: 'Listen with',
  outputBox: 'Box',
  outputBoxSub: 'Speaker',
  outputConnected: 'connected',
  outputOff: 'off',
  outputConnecting: 'switching on …',
  outputNotFound: 'Not found – is it switched on?',
}
export type DisplayTextKey = keyof typeof DEFAULT_DISPLAY_TEXTS
type TextSet = Partial<Record<DisplayTextKey, string>>

interface LanguageFile {
  languages?: Record<string, { name?: string; texts?: Record<string, unknown> }>
}

function pickTexts(raw: Record<string, unknown> | undefined): TextSet {
  const texts: TextSet = {}
  for (const key of Object.keys(DEFAULT_DISPLAY_TEXTS) as DisplayTextKey[]) {
    const value = raw?.[key]
    if (typeof value === 'string' && value.trim()) texts[key] = value.trim()
  }
  return texts
}

@Injectable({ providedIn: 'root' })
export class DisplayTextsService {
  private http = inject(HttpClient)
  private readonly custom = signal<TextSet>({})
  private readonly language = signal('en')
  private readonly languages = signal<Record<string, TextSet>>({})

  constructor() {
    this.http.get<LanguageFile>('assets/i18n/display-texts.json').subscribe({
      next: (file) => {
        const sets: Record<string, TextSet> = {}
        for (const [code, lang] of Object.entries(file?.languages ?? {})) {
          sets[code] = pickTexts(lang?.texts)
        }
        this.languages.set(sets)
      },
      error: () => {},
    })
    this.refresh()
  }

  // The preview page of the admin interface shows texts that are typed but not saved yet: from then on the
  // saved settings are no longer read (they would replace the preview).
  private previewActive = false

  /** Preview of the admin interface: shows the given language and own texts instead of the saved ones. */
  public applyPreview(language: unknown, texts: Record<string, unknown> | undefined): void {
    this.previewActive = true
    this.custom.set(pickTexts(texts))
    if (typeof language === 'string' && language) this.language.set(language)
  }

  /** Reads the settings again (called when an overlay appears, so a change shows up without a reload). */
  public refresh(): void {
    if (this.previewActive) return
    this.http
      .get<{ displayTexts?: Record<string, unknown>; displayLanguage?: unknown }>(`${environment.backend.apiUrl}/config`)
      .subscribe({
        next: (config) => {
          this.custom.set(pickTexts(config?.displayTexts))
          this.language.set(typeof config?.displayLanguage === 'string' ? config.displayLanguage : 'en')
        },
        // keep what we have (or the defaults) when the backend is not reachable
        error: () => {},
      })
  }

  /** The text for `key`; {name} placeholders are filled from `values`. Reading it inside a computed/template tracks changes. */
  public text(key: DisplayTextKey, values: Record<string, string | number> = {}): string {
    const sets = this.languages()
    const template =
      this.custom()[key] ?? sets[this.language()]?.[key] ?? sets.en?.[key] ?? DEFAULT_DISPLAY_TEXTS[key]
    return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in values ? String(values[name]) : whole))
  }
}
