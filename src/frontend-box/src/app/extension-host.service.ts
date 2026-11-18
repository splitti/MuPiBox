import { isPlatformBrowser } from '@angular/common'
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core'
import { Router } from '@angular/router'
import { NavController } from '@ionic/angular/standalone'
import { environment } from 'src/environments/environment'
import { CoverFlipService } from './cover-flip.service'
import type { Media } from './media'

/** A tab an extension adds after the categories of the home page: no list, a tap runs `onSelect`. */
export interface ExtensionTab {
  id: string
  // the address of an SVG picture (of the extension's own files)
  src: string
  visible: boolean
  onSelect: () => void
}

interface ActiveExtension {
  id: string
  name: string
  version: string
  display?: string
  settings: Record<string, unknown>
}

/**
 * Something an extension puts into the header, right of the battery (the clock, for one). The status is on several pages (the start
 * page, the lock screen …), so `mount` is called for each place with an empty element to fill; what it returns is called when the
 * place goes away.
 */
export interface HeaderItem {
  mount(host: HTMLElement): (() => void) | void
}

/** A full-screen page an extension opens over the display (a title bar with a back button, and the content area for the extension). */
export interface OverlayPage {
  title: string
  /** Fills the content area; what it returns is called when the page is closed. */
  mount(content: HTMLElement): (() => void) | void
  /** The content area runs up to the top edge and the back button floats in the corner above it (for pages that want every pixel of height). */
  flush?: boolean
}

/** What an extension's display.js gets (docs/extensions.md, "Display"). */
export interface DisplayExtensionApi {
  id: string
  /** The address of a file of the extension. */
  url(file: string): string
  /** The address of the API (for pictures and the like). */
  apiUrl: string
  /** GET on the player (a route from `/…`); the JSON answer, or null when it does not answer. */
  fetch(path: string): Promise<unknown>
  /** GET on the extension's own API part (a route from `/…`, see api.js); the JSON answer, or null when it does not answer. */
  fetchApi(path: string): Promise<unknown>
  /** A full-screen page over the display; one at a time (a new one replaces the one that is open). */
  overlay: { open(page: OverlayPage): void; close(): void }
  /** Calls `fn` every `ms` while the page is open; an error in it is logged, never thrown. */
  every(ms: number, fn: () => void | Promise<void>): void
  settings(): Record<string, unknown>
  tabs: { set(tab: ExtensionTab): void; remove(id: string): void }
  /** Something right of the battery in the header (see HeaderItem). */
  header: { add(item: HeaderItem): void }
  winamp: { onEject(fn: () => boolean): void }
  player: {
    open(media: Media): void
    /** Albums of this folder name (`libraryPath`) are never kept for "Fortsetzen" - however they were started. */
    noResumeFolder(folder: string): void
  }
}

/**
 * The extensions of the box on the display (docs/extensions.md): the API says which are on, and the `display.js` of each is loaded
 * as a module and gets an `api` to add tabs, to take over the eject button and to start the player with an album. Whatever an
 * extension does goes through guards here: an error is logged and ends that extension's part, never the display.
 */
@Injectable({ providedIn: 'root' })
export class ExtensionHostService {
  /** The tabs the extensions have added (in the order of the extensions). */
  readonly tabs = signal<ExtensionTab[]>([])
  /** What the extensions put into the header (in the order of the extensions). */
  readonly headerItems = signal<{ id: string; item: HeaderItem }[]>([])
  private readonly ejectHandlers: { id: string; fn: () => boolean }[] = []
  private readonly navController = inject(NavController)
  private readonly router = inject(Router)
  private readonly coverFlip = inject(CoverFlipService)
  private readonly noResumeFolders = new Set<string>()
  private started = false

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return
    void this.start()
  }

  /** A tab was tapped. */
  select(id: string): void {
    this.guard(id, 'tab', () => this.tabs().find((t) => t.id === id)?.onSelect())
  }

  /** An album an extension provides, that is not kept for "Fortsetzen" (the disc may be gone, or another in the drive, when it is picked). */
  noResume(media: Media | null | undefined): boolean {
    return !!media && (media.noResume === true || (!!media.libraryPath && this.noResumeFolders.has(media.libraryPath)))
  }

  /** The eject button of the Winamp window: true when an extension handled it. */
  eject(): boolean {
    for (const handler of this.ejectHandlers) {
      if (this.guard(handler.id, 'eject', handler.fn) === true) return true
    }
    return false
  }

  /** Fills a place in the header with an item of an extension; returns what undoes it. An error in the item ends only that item. */
  mountHeader(entry: { id: string; item: HeaderItem }, host: HTMLElement): () => void {
    const cleanup = this.guard(entry.id, 'header', () => entry.item.mount(host))
    return () => {
      if (typeof cleanup === 'function') this.guard(entry.id, 'header', cleanup)
    }
  }

  private overlayClose: (() => void) | null = null

  /** Opens an extension's full-screen page; the back button (or `close`) takes it away again. */
  openOverlay(id: string, page: OverlayPage): void {
    this.closeOverlay()
    const root = document.createElement('div')
    root.dataset['extOverlay'] = id
    root.style.cssText =
      'position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;box-sizing:border-box;background:var(--ion-background-color,#121212);color:var(--ion-text-color,#fff);font-family:var(--ion-font-family,inherit)'
    const bar = document.createElement('div')
    // (only the arrow in the corner: the page says what it is by itself, and the room goes to the page)
    bar.style.cssText = page.flush
      ? 'position:absolute;top:0;left:0;z-index:1;display:flex;align-items:center;height:60px;padding:0 12px'
      : 'flex:none;display:flex;align-items:center;height:60px;padding:0 12px'
    root.setAttribute('aria-label', page.title)
    const back = document.createElement('button')
    back.type = 'button'
    back.setAttribute('aria-label', 'Zurück')
    back.style.cssText = 'flex:none;width:44px;height:44px;border:0;border-radius:50%;display:grid;place-items:center;background:rgba(127,127,127,.22);color:inherit;cursor:pointer'
    back.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5.5L8.5 12l6.5 6.5"/></svg>'
    bar.append(back)
    const content = document.createElement('div')
    content.style.cssText = 'flex:1;min-height:0;position:relative;overflow:hidden'
    root.append(bar, content)
    document.body.append(root)
    const cleanup = this.guard(id, 'overlay', () => page.mount(content))
    this.overlayClose = () => {
      this.overlayClose = null
      if (typeof cleanup === 'function') this.guard(id, 'overlay', cleanup)
      root.remove()
    }
    back.onclick = () => this.closeOverlay()
  }

  closeOverlay(): void {
    this.overlayClose?.()
  }

  private guard<T>(id: string, where: string, fn: () => T): T | undefined {
    try {
      return fn()
    } catch (error) {
      console.warn(`[Extension ${id}] error in ${where}:`, error)
      return undefined
    }
  }

  private async start(): Promise<void> {
    if (this.started) return
    this.started = true
    let active: ActiveExtension[]
    try {
      const response = await fetch(`${environment.backend.apiUrl}/ext/active`)
      active = response.ok ? await response.json() : []
    } catch {
      return
    }
    const origin = new URL(environment.backend.apiUrl).origin
    for (const ext of active) {
      if (!ext.display) continue
      try {
        // (a file read at run time from the box, not part of this bundle)
        const mod = await import(/* @vite-ignore */ `${origin}${ext.display}?v=${encodeURIComponent(ext.version)}`)
        if (typeof mod.activate !== 'function') throw new Error('display.js has no activate()')
        mod.activate(this.apiFor(ext, origin))
      } catch (error) {
        console.warn(`[Extension ${ext.id}] could not start its display part:`, error)
      }
    }
  }

  private apiFor(ext: ActiveExtension, origin: string): DisplayExtensionApi {
    const id = ext.id
    return {
      id,
      url: (file) => `${origin}/ext/${id}/${file}`,
      apiUrl: environment.backend.apiUrl,
      fetch: async (path) => {
        try {
          // (the player answers only the box's own pages, and those say so with this header - see backend-player/src/request-guard.js)
          const response = await fetch(`${environment.backend.playerUrl}${path}`, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
          return response.ok ? await response.json() : null
        } catch {
          return null
        }
      },
      every: (ms, fn) => {
        const run = () => {
          try {
            void Promise.resolve(fn()).catch((error) => console.warn(`[Extension ${id}] error:`, error))
          } catch (error) {
            console.warn(`[Extension ${id}] error:`, error)
          }
        }
        run()
        setInterval(run, ms)
      },
      settings: () => ext.settings,
      tabs: {
        set: (tab) => {
          const tabs = this.tabs()
          const full = { ...tab, id: `${id}:${tab.id}` }
          const at = tabs.findIndex((t) => t.id === full.id)
          this.tabs.set(at >= 0 ? tabs.map((t, i) => (i === at ? full : t)) : [...tabs, full])
        },
        remove: (tabId) => this.tabs.set(this.tabs().filter((t) => t.id !== `${id}:${tabId}`)),
      },
      fetchApi: async (path) => {
        try {
          const response = await fetch(`${environment.backend.apiUrl}/ext/${id}${path}`)
          return response.ok ? await response.json() : null
        } catch {
          return null
        }
      },
      overlay: { open: (page) => this.openOverlay(id, page), close: () => this.closeOverlay() },
      header: { add: (item) => this.headerItems.set([...this.headerItems(), { id, item }]) },
      winamp: { onEject: (fn) => void this.ejectHandlers.push({ id, fn }) },
      player: {
        open: (media) => {
          const start = (): void => {
            void this.navController.navigateForward(['/player'], { state: { media }, animation: this.coverFlip.animation })
          }
          // (the player page takes its medium when it is created: with the player page open already, a second start would do nothing -
          // the page is left first, so the new medium gets a fresh one)
          if (this.router.url.split(/[?#]/)[0] === '/player') void this.navController.navigateRoot(['/home'], { animated: false }).then(start)
          else start()
        },
        noResumeFolder: (folder) => void this.noResumeFolders.add(folder),
      },
    }
  }
}
