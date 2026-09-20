import { Injectable } from '@angular/core'
import { Animation, AnimationBuilder, createAnimation } from '@ionic/angular/standalone'

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
