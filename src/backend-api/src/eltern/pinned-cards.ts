// Start › "Angepinnt": cards of the settings pages pinned to the start page - as a link to the card or, for the cards
// that have one, as their own small version (the app's LIVE_CARDS). Kept in the box (mupibox.pinnedCards), so every
// phone shows the same. A card is known by its page and an id of its own (not its heading, which is translated).
// Idea and first version: Andreas (Lippsson), wowa1990/MuPiBox#11.

import type { Router } from 'express'
import type { MupiboxConfig } from '../models/mupibox-config.model'
import { requireCsrf, requireSession } from './middleware'

export interface PinnedCardsDeps {
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
}

export interface PinnedCard {
  page: string
  card: string
  /** the heading when it was pinned (shown on a link) */
  title: string
  view: 'card' | 'link'
}

const MAX_PINNED = 30
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/

function cleanPin(v: unknown): PinnedCard | null {
  const p = v as Record<string, unknown> | null
  if (!p || typeof p !== 'object') return null
  if (typeof p.page !== 'string' || !ID.test(p.page) || typeof p.card !== 'string' || !ID.test(p.card)) return null
  const title = typeof p.title === 'string' ? p.title.trim().slice(0, 80) : ''
  return { page: p.page, card: p.card, title, view: p.view === 'link' ? 'link' : 'card' }
}

/** The pinned cards, well-formed and each once */
export function pinnedCardsOf(cfg: unknown): PinnedCard[] {
  const list = (cfg as { mupibox?: { pinnedCards?: unknown } } | undefined)?.mupibox?.pinnedCards
  const out: PinnedCard[] = []
  for (const v of Array.isArray(list) ? list : []) {
    const p = cleanPin(v)
    if (p && !out.some((o) => o.page === p.page && o.card === p.card)) out.push(p)
    if (out.length >= MAX_PINNED) break
  }
  return out
}

export function registerPinnedCardRoutes(router: Router, deps: PinnedCardsDeps): void {
  /** GET /api/app/pinned-cards - {items: [{page, card, title, view}]} in their order */
  router.get('/pinned-cards', requireSession, (_req, res) => {
    res.json({ items: pinnedCardsOf(deps.getMupiboxConfig()) })
  })

  /**
   * POST /api/app/pinned-cards - a change, made on the list as the box has it (another phone may have changed it
   * meanwhile - the whole list from an app open for a while undid that):
   *   {add: {page, card, title, view}}  pinned (at the end; again: its view and title changed)
   *   {remove: {page, card}}            taken off
   *   {items}                           the whole list (order, views) - after the app read it just before
   */
  router.post('/pinned-cards', requireSession, requireCsrf, async (req, res) => {
    const body = (req.body as { add?: unknown; remove?: unknown; items?: unknown } | undefined) ?? {}
    const add = body.add !== undefined ? cleanPin(body.add) : null
    const remove = body.remove as { page?: unknown; card?: unknown } | undefined
    if (body.add !== undefined && !add) {
      res.status(400).json({ error: 'invalid_pin' })
      return
    }
    if (body.items !== undefined && (!Array.isArray(body.items) || body.items.length > MAX_PINNED)) {
      res.status(400).json({ error: 'invalid_items' })
      return
    }
    let result: PinnedCard[] = []
    await deps.updateMupiboxConfig((cfg) => {
      let list = pinnedCardsOf(cfg)
      if (Array.isArray(body.items)) list = pinnedCardsOf({ mupibox: { pinnedCards: body.items } })
      if (remove && typeof remove === 'object') list = list.filter((p) => !(p.page === remove.page && p.card === remove.card))
      if (add) {
        const at = list.findIndex((p) => p.page === add.page && p.card === add.card)
        if (at >= 0) list[at] = add
        else if (list.length < MAX_PINNED) list.push(add)
      }
      result = list
      cfg.mupibox = { ...((cfg.mupibox as Record<string, unknown>) ?? {}), pinnedCards: list }
    })
    res.json({ items: result })
  })
}
