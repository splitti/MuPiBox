import { Injectable } from '@angular/core'
import { Animation, AnimationBuilder, createAnimation, mdTransitionAnimation } from '@ionic/angular/standalone'

interface FlipSource {
  card: HTMLElement
  rect: DOMRect
  src: string
  at: number
}

// A tapped cover turns around (like a record sleeve) and settles at the place of the cover on the
// player page; the rest of the player fades in while it does. The swiper remembers the tapped
// cover with `capture`, the page that navigates then passes `animation` to the navigation.
@Injectable({
  providedIn: 'root',
})
export class CoverFlipService {
  private static readonly DURATION_MS = 750
  private static readonly MAX_AGE_MS = 1500

  private source: FlipSource | undefined
  // The cover that was opened last: where the way back has to land.
  private opened: FlipSource | undefined

  public capture(slide: HTMLElement): void {
    const card = (slide.querySelector('ion-card') ?? slide) as HTMLElement
    const img = card.querySelector('img')
    const src = img?.currentSrc || img?.getAttribute('src') || ''
    if (!src) {
      this.source = undefined
      return
    }
    this.source = { card, rect: card.getBoundingClientRect(), src, at: Date.now() }
  }

  // The animation to use for the next navigation to the player, if a cover was just tapped.
  public get animation(): AnimationBuilder | undefined {
    if (!this.source || Date.now() - this.source.at > CoverFlipService.MAX_AGE_MS) {
      return undefined
    }
    return (_baseEl: HTMLElement, opts?: { enteringEl?: HTMLElement; leavingEl?: HTMLElement }) => this.build(opts)
  }

  private build(opts?: { enteringEl?: HTMLElement; leavingEl?: HTMLElement }): Animation {
    const source = this.source
    this.source = undefined
    this.opened = source
    const duration = CoverFlipService.DURATION_MS
    const root = createAnimation().duration(duration).easing('ease-in-out')
    const entering = opts?.enteringEl
    const leaving = opts?.leavingEl
    if (!source || !entering) {
      return root.addAnimation(createAnimation().addElement(entering ?? document.body).fromTo('opacity', '0.01', '1'))
    }

    // The new page is shown but transparent at first; it fades in during the second half.
    root.addAnimation(
      createAnimation()
        .addElement(entering)
        .beforeRemoveClass('ion-page-invisible')
        .keyframes([
          { offset: 0, opacity: '0' },
          { offset: 0.5, opacity: '0' },
          { offset: 1, opacity: '1' },
        ]),
    )
    if (leaving) {
      root.addAnimation(
        createAnimation()
          .addElement(leaving)
          .keyframes([
            { offset: 0, opacity: '1' },
            { offset: 0.3, opacity: '0' },
            { offset: 1, opacity: '0' },
          ]),
      )
    }

    let flying: HTMLElement | undefined
    // The real cover of the player page stays hidden until the turning one has arrived.
    const playerCover = entering.querySelector('.cover-card') as HTMLElement | null
    root.beforeAddWrite(() => {
      const target = this.playerCoverRect(entering)
      const backSrc = (entering.querySelector('.cover-card img') as HTMLImageElement | null)?.getAttribute('src')?.trim() || source.src
      flying = this.createFlyingCover(source, backSrc)
      document.body.appendChild(flying)
      source.card.style.visibility = 'hidden'
      if (playerCover) {
        playerCover.style.visibility = 'hidden'
      }
      const scale = target.width / source.rect.width
      const dx = target.left + target.width / 2 - (source.rect.left + source.rect.width / 2)
      const dy = target.top + target.height / 2 - (source.rect.top + source.rect.height / 2)
      flying.animate(
        [
          { transform: 'perspective(1400px) translate3d(0, 0, 0) rotateY(0deg) scale(1)' },
          { transform: `perspective(1400px) translate3d(${dx / 2}px, ${dy / 2}px, 120px) rotateY(90deg) scale(${(1 + scale) / 2})`, offset: 0.5 },
          { transform: `perspective(1400px) translate3d(${dx}px, ${dy}px, 0) rotateY(180deg) scale(${scale})` },
        ],
        { duration, easing: 'ease-in-out', fill: 'forwards' },
      )
    })
    root.onFinish(() => {
      flying?.remove()
      source.card.style.visibility = ''
      if (playerCover) {
        playerCover.style.visibility = ''
      }
    })
    return root
  }

  // The way back: the same movement in reverse order. Used by the player's back button; without
  // a remembered cover (e.g. the player was opened from somewhere else) the normal animation runs.
  public readonly returnAnimation: AnimationBuilder = (baseEl: HTMLElement, opts?: { enteringEl?: HTMLElement; leavingEl?: HTMLElement }) => {
    const opened = this.opened
    if (!opened || !opts?.enteringEl || !opts.leavingEl) {
      return mdTransitionAnimation(baseEl, opts as never)
    }
    this.opened = undefined
    return this.buildReturn(opened, opts.enteringEl, opts.leavingEl)
  }

  private buildReturn(source: FlipSource, entering: HTMLElement, leaving: HTMLElement): Animation {
    const duration = CoverFlipService.DURATION_MS
    const root = createAnimation().duration(duration).easing('ease-in-out')
    // The player fades out first; the list (which fills in a moment after it is shown) fades in later.
    root.addAnimation(
      createAnimation()
        .addElement(leaving)
        .keyframes([
          { offset: 0, opacity: '1' },
          { offset: 0.3, opacity: '0' },
          { offset: 1, opacity: '0' },
        ]),
    )
    root.addAnimation(
      createAnimation()
        .addElement(entering)
        .beforeRemoveClass('ion-page-invisible')
        .keyframes([
          { offset: 0, opacity: '0' },
          { offset: 0.5, opacity: '0' },
          { offset: 1, opacity: '1' },
        ]),
    )
    const playerCover = leaving.querySelector('.cover-card') as HTMLElement | null
    let flying: HTMLElement | undefined
    root.beforeAddWrite(() => {
      const from = playerCover?.getBoundingClientRect()
      const playerImg = (playerCover?.querySelector('img') as HTMLImageElement | null)?.getAttribute('src')?.trim() || source.src
      // The turning cover sits at the list position and starts out moved, turned and enlarged.
      flying = this.createFlyingCover(source, playerImg)
      document.body.appendChild(flying)
      if (playerCover) {
        playerCover.style.visibility = 'hidden'
      }
      const scale = from && from.width > 0 ? from.width / source.rect.width : 1
      const dx = from ? from.left + from.width / 2 - (source.rect.left + source.rect.width / 2) : 0
      const dy = from ? from.top + from.height / 2 - (source.rect.top + source.rect.height / 2) : 0
      flying.animate(
        [
          { transform: `perspective(1400px) translate3d(${dx}px, ${dy}px, 0) rotateY(180deg) scale(${scale})` },
          { transform: `perspective(1400px) translate3d(${dx / 2}px, ${dy / 2}px, 120px) rotateY(90deg) scale(${(1 + scale) / 2})`, offset: 0.5 },
          { transform: 'perspective(1400px) translate3d(0, 0, 0) rotateY(0deg) scale(1)' },
        ],
        { duration, easing: 'ease-in-out', fill: 'forwards' },
      )
    })
    root.onFinish(() => {
      if (playerCover) {
        playerCover.style.visibility = ''
      }
      // The covers of the list appear a moment after the page is shown: the turned cover
      // stays for that moment and then gives way.
      const done = flying
      if (done) {
        done.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 250, fill: 'forwards' }).finished.then(
          () => done.remove(),
          () => done.remove(),
        )
      }
    })
    return root
  }

  // Where the cover of the player page is (or, if the page is not laid out yet, would be).
  private playerCoverRect(entering: HTMLElement): { left: number; top: number; width: number; height: number } {
    const card = entering.querySelector('.cover-card') as HTMLElement | null
    const rect = card?.getBoundingClientRect()
    if (rect && rect.width > 0) {
      return rect
    }
    const size = 350
    // The cover sits in the middle of the left half of the page.
    return { left: (window.innerWidth / 2 - size) / 2, top: 90, width: size, height: size }
  }

  private createFlyingCover(source: FlipSource, backSrc: string): HTMLElement {
    const box = document.createElement('div')
    Object.assign(box.style, {
      position: 'fixed',
      left: `${source.rect.left}px`,
      top: `${source.rect.top}px`,
      width: `${source.rect.width}px`,
      height: `${source.rect.height}px`,
      zIndex: '100000',
      pointerEvents: 'none',
      transformStyle: 'preserve-3d',
      willChange: 'transform',
    })
    const face = (src: string, back: boolean): HTMLImageElement => {
      const img = document.createElement('img')
      img.src = src
      Object.assign(img.style, {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        backfaceVisibility: 'hidden',
        transform: back ? 'rotateY(180deg)' : 'none',
      })
      return img
    }
    box.append(face(source.src, false), face(backSrc, true))
    return box
  }
}
