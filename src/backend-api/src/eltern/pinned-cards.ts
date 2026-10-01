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

  /** POST /api/app/pinned-cards {items} - the whole list (order, view) as the app has it now */
  router.post('/pinned-cards', requireSession, requireCsrf, async (req, res) => {
    const items = (req.body as { items?: unknown } | undefined)?.items
    if (!Array.isArray(items) || items.length > MAX_PINNED) {
      res.status(400).json({ error: 'invalid_items' })
      return
    }
    const clean = pinnedCardsOf({ mupibox: { pinnedCards: items } })
    await deps.updateMupiboxConfig((cfg) => {
      cfg.mupibox = { ...((cfg.mupibox as Record<string, unknown>) ?? {}), pinnedCards: clean }
    })
    res.json({ items: clean })
  })
}
