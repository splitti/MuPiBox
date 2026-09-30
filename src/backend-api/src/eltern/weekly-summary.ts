// The week in a Telegram message, Sunday evening: how long the box played, on how many days, and what the most (the
// numbers of the app's history, eltern/playlog.ts). Once per week; switched off in the app (Telegram › Wochenrückblick).

import { spawn } from 'node:child_process'
import type { MupiboxConfig } from '../models/mupibox-config.model'
import { playlogSummary } from './playlog'

const TELEGRAM_SCRIPT = '/usr/local/bin/mupibox/telegram_send_message.py'
// Sunday, from this hour on (and before 20 o'clock: a box that was off on Sunday evening sends nothing for that week)
const SEND_HOUR = 18

interface Deps {
  getMupiboxConfig: () => MupiboxConfig | undefined
  updateMupiboxConfig: (mutate: (cfg: Record<string, unknown>) => void) => Promise<void>
  currentPlayLogStart?: () => number | null
}

type Telegram = Record<string, unknown>

/** on unless switched off (only with the bot active: telegram_send_message.py sends nothing else) */
export function weeklySummaryOn(cfg: MupiboxConfig | undefined): boolean {
  return (cfg?.telegram as Telegram | undefined)?.weeklySummary !== false
}

const duration = (minutes: number) => {
  // (rounded first: 119.7 minutes are "2 h 0 min", not "1 h 60 min")
  const total = Math.round(minutes)
  const h = Math.floor(total / 60)
  const m = total % 60
  return h ? `${h} h ${m} min` : `${m} min`
}

const dayOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function telegram(key: string, values: Record<string, string | number> = {}): void {
  try {
    const child = spawn(
      '/usr/bin/python3',
      [TELEGRAM_SCRIPT, '--key', key, ...Object.entries(values).map(([k, v]) => `${k}=${v}`)],
      { stdio: 'ignore' },
    )
    child.on('error', () => undefined)
  } catch {
    // (no Telegram set up)
  }
}

export function startWeeklySummary(deps: Deps): void {
  const check = async () => {
    const now = new Date()
    if (now.getDay() !== 0 || now.getHours() < SEND_HOUR || now.getHours() >= 20) return
    const cfg = deps.getMupiboxConfig()
    const tg = (cfg?.telegram as Telegram | undefined) ?? {}
    if (tg.active !== true || !weeklySummaryOn(cfg)) return
    const today = dayOf(now)
    if (tg.weeklySentFor === today) return
    // (marked first: a failing send is not tried again every hour)
    await deps.updateMupiboxConfig((c) => {
      c.telegram = { ...((c.telegram as Telegram | undefined) ?? {}), weeklySentFor: today }
    })
    const week = await playlogSummary('week', deps.currentPlayLogStart)
    const days = week.timeline.filter((d) => d.minutes >= 1).length
    if (week.totalMinutes < 1) {
      telegram('n_weekly_summary_none')
    } else {
      // (what has no artist, a radio stream or a file without tags, is not named)
      const top = week.topArtists
        .filter((a) => a.name && a.minutes >= 1)
        .slice(0, 3)
        .map((a) => `• ${a.name} – ${duration(a.minutes)}`)
        .join('\n')
      const values = { total: duration(week.totalMinutes), days, avg: duration(week.totalMinutes / 7) }
      telegram(top ? 'n_weekly_summary' : 'n_weekly_summary_short', top ? { ...values, top } : values)
    }
    console.log(
      `${new Date().toLocaleString()}: [weekly] summary sent: ${Math.round(week.totalMinutes)} min on ${days} days`,
    )
  }
  const tick = () =>
    void check().catch((err) => console.warn(`${new Date().toLocaleString()}: [weekly] ${(err as Error).message}`))
  setTimeout(tick, 120_000).unref()
  setInterval(tick, 15 * 60_000).unref()
}
