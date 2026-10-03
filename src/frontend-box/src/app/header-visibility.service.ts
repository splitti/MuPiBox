import { effect, Injectable, inject, signal } from '@angular/core'
import { Router } from '@angular/router'
import { Subject } from 'rxjs'

interface Point {
  x: number
  y: number
}

/**
 * The top bar of the pages with covers (start page, the lists, the player, continue listening) can be folded away, the
 * same on all of them: two fingers swiping up hide it, two fingers swiping down show it again. With it gone, one finger
 * swiping up from the bottom edge goes one level back - what the bar's back button does (it is not there to tap).
 * The state is kept in this browser, so it stays after a page change or a reload.
 * On the start page two fingers swiping in from the right edge to the left go to the next category, from the left
 * edge to the right to the one before - round and round, the last one leads to the first and the other way (the tabs of
 * the bar are not there to tap with it folded away).
 */
@Injectable({ providedIn: 'root' })
export class HeaderVisibilityService {
  private static readonly KEY = 'mupibox.homeHeaderHidden'
  private static readonly PAGES = new Set(['/', '/home', '/medialist', '/player', '/resume'])
  // the two fingers have to move this far (px), and clearly more up or down than sideways
  private static readonly SWIPE_PX = 60
  // the back swipe starts in the lowest strip of the display and goes this far up
  private static readonly BACK_EDGE_PX = 48
  private static readonly BACK_SWIPE_PX = 80
  // the category swipe: two fingers that start this close to the edge (px, their middle) and go this far sideways
  private static readonly CATEGORY_EDGE_PX = 120
  private static readonly CATEGORY_SWIPE_PX = 100

  /** Whether the top bar is folded away (the style sheet does it, by the class on the body; the covers use it too). */
  readonly hidden = signal(HeaderVisibilityService.read())

  private readonly router = inject(Router)
  /** A category swipe on the start page: 1 = the next category, -1 = the one before. */
  readonly categorySwipe = new Subject<1 | -1>()
  private twoFingerStart: Point | null = null
  private backStart: Point | null = null

  constructor() {
    effect(() => document.body.classList.toggle('mupi-header-hidden', this.hidden()))
    const passive = { passive: true }
    document.addEventListener('touchstart', (e) => this.onStart(e), passive)
    document.addEventListener('touchmove', (e) => this.onMove(e), passive)
    document.addEventListener('touchend', () => this.reset(), passive)
    document.addEventListener('touchcancel', () => this.reset(), passive)
  }

  private static read(): boolean {
    try {
      return localStorage.getItem(HeaderVisibilityService.KEY) === '1'
    } catch {
      return false
    }
  }

  private static center(e: TouchEvent): Point {
    const [a, b] = [e.touches[0], e.touches[1]]
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
  }

  private set(hidden: boolean): void {
    if (this.hidden() === hidden) return
    this.hidden.set(hidden)
    try {
      localStorage.setItem(HeaderVisibilityService.KEY, hidden ? '1' : '0')
    } catch {
      // no storage: it stays for this page load
    }
  }

  private path(): string {
    return this.router.url.split(/[?#]/)[0] || '/'
  }

  private reset(): void {
    this.twoFingerStart = null
    this.backStart = null
  }

  private onStart(e: TouchEvent): void {
    this.reset()
    const path = this.path()
    if (!HeaderVisibilityService.PAGES.has(path)) return
    if (e.touches.length === 2) {
      this.twoFingerStart = HeaderVisibilityService.center(e)
      return
    }
    // One finger from the bottom edge: only with the bar folded away, and not on the start page (nothing above it)
    const touch = e.touches[0]
    if (e.touches.length === 1 && this.hidden() && path !== '/' && path !== '/home') {
      if (touch.clientY >= window.innerHeight - HeaderVisibilityService.BACK_EDGE_PX) {
        this.backStart = { x: touch.clientX, y: touch.clientY }
      }
    }
  }

  private onMove(e: TouchEvent): void {
    if (this.twoFingerStart && e.touches.length === 2) {
      const now = HeaderVisibilityService.center(e)
      const dx = now.x - this.twoFingerStart.x
      const dy = now.y - this.twoFingerStart.y
      // sideways, from the right or the left edge: another category (on the start page)
      if (Math.abs(dx) >= HeaderVisibilityService.CATEGORY_SWIPE_PX && Math.abs(dx) >= Math.abs(dy) * 1.5) {
        const start = this.twoFingerStart
        this.twoFingerStart = null
        const path = this.path()
        if (path !== '/' && path !== '/home') return
        if (dx < 0 && start.x >= window.innerWidth - HeaderVisibilityService.CATEGORY_EDGE_PX)
          this.categorySwipe.next(1)
        else if (dx > 0 && start.x <= HeaderVisibilityService.CATEGORY_EDGE_PX) this.categorySwipe.next(-1)
        return
      }
      if (Math.abs(dy) < HeaderVisibilityService.SWIPE_PX || Math.abs(dy) < Math.abs(dx) * 1.5) return
      // once per gesture: up hides, down shows
      this.twoFingerStart = null
      this.set(dy < 0)
      return
    }
    if (this.backStart && e.touches.length === 1) {
      const dx = e.touches[0].clientX - this.backStart.x
      const dy = e.touches[0].clientY - this.backStart.y
      if (dy > -HeaderVisibilityService.BACK_SWIPE_PX || Math.abs(dy) < Math.abs(dx) * 1.5) return
      this.backStart = null
      this.goBack()
    }
  }

  /** The back button of the page that is on screen: a click on it does what a tap would (also with the bar folded). */
  private goBack(): void {
    const pages = Array.from(document.querySelectorAll<HTMLElement>('ion-router-outlet > .ion-page')).reverse()
    const page = pages.find(
      (p) => !p.classList.contains('ion-page-hidden') && !p.classList.contains('ion-page-invisible'),
    )
    const button =
      page?.querySelector<HTMLElement>('ion-header ion-back-button') ??
      page?.querySelector<HTMLElement>('ion-header ion-buttons[slot="start"] ion-button')
    button?.click()
  }
}
