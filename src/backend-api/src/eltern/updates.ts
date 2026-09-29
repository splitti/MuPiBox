// Updates of the app (admin.php's "Updates", the start page's version table and "update available"): MuPiBox from the
// official repository (splitti/MuPiBox: version.json and update/start_mupibox_update.sh, as the admin interface), the
// operating system with apt.
//
// Both run as a systemd unit of their own (mupibox-update), out of the server: the MuPiBox update stops and replaces
// the server itself. The admin interface ran them inside the PHP request, and the update script pipes its progress
// into whiptail, which quits at once without a terminal - the script's next output then ended the update after its
// first step. Here a stand-in for whiptail writes the progress to a file the app reads.

import { execFile } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { Router } from 'express'
import type { MupiboxConfig } from '../models/mupibox-config.model'
import { requireCsrf, requireSession } from './middleware'

export interface UpdatesDeps {
  getMupiboxConfig: () => MupiboxConfig | undefined
}

const REPO_RAW = 'https://raw.githubusercontent.com/splitti/MuPiBox/main'
const STATE_DIR = '/var/lib/mupibox-update'
const UNIT = 'mupibox-update'
const CHANNELS = ['stable', 'beta', 'dev'] as const
type Channel = (typeof CHANNELS)[number]

function run(cmd: string, args: string[], timeoutMs = 30000): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) =>
      resolve({ ok: !err, stdout: stdout ?? '', stderr: stderr ?? '' }),
    )
  })
}

// $1 = stable | beta | dev | os. Its state for the app in state (key=value), progress (percent, tab, step) and
// output.txt; they stay after the restart, so the app can tell how the last update went.
export const RUN_SH = `#!/bin/bash
# The app's update (backend-api eltern/updates.ts), run as the systemd unit ${UNIT}: $1 = stable | beta | dev | os
D=${STATE_DIR}
KIND="$1"
PHASE=running
STARTED=$(date +%s)
FINISHED=
write_state() {
	printf 'kind=%s\\nphase=%s\\nstarted=%s\\nfinished=%s\\n' "$KIND" "$PHASE" "$STARTED" "$FINISHED" > "$D/state.tmp" && mv "$D/state.tmp" "$D/state"
}
finish() {
	PHASE="$1"
	FINISHED=$(date +%s)
	write_state
}
progress() { printf '%s\\t%s\\n' "$1" "$2" > "$D/progress"; }
exec > "$D/output.txt" 2>&1
write_state
progress 0 "Start"

# the idle shutdown must not switch the box off in the middle of it
IDLE_WAS_ACTIVE=$(systemctl is-active mupi_idle_shutdown 2>/dev/null)
systemctl stop mupi_idle_shutdown 2>/dev/null

if [ "$KIND" = "os" ]; then
	export DEBIAN_FRONTEND=noninteractive
	APT_OPTS="-o DPkg::Lock::Timeout=600 -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold"
	progress 10 "apt-get update"
	if apt-get $APT_OPTS update; then
		progress 30 "apt-get upgrade"
		if apt-get -y --install-recommends $APT_OPTS upgrade; then
			progress 100 "OK"
			finish ok
		else
			finish failed
		fi
	else
		finish failed
	fi
	[ "$IDLE_WAS_ACTIVE" = "active" ] && systemctl start mupi_idle_shutdown
	exit 0
fi

progress 1 "Download"
if ! curl -fsSL --retry 3 --retry-delay 3 -m 120 -o "$D/start_mupibox_update.sh" "${REPO_RAW}/update/start_mupibox_update.sh" || ! bash -n "$D/start_mupibox_update.sh"; then
	echo "The update script could not be downloaded - nothing was changed."
	[ "$IDLE_WAS_ACTIVE" = "active" ] && systemctl start mupi_idle_shutdown
	finish failed
	exit 0
fi

# a copy of the settings, the library and the covers on the box (the newest three are kept)
progress 2 "Backup"
mkdir -p /home/dietpi/mupibox-backups
BACKUP="/home/dietpi/mupibox-backups/before-update-$(date +%Y-%m-%d-%H%M).zip"
zip -q -r "$BACKUP" /etc/mupibox/mupiboxconfig.json /home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json /home/dietpi/MuPiBox/media/cover
chown -R dietpi:dietpi /home/dietpi/mupibox-backups
ls -1t /home/dietpi/mupibox-backups/before-update-*.zip 2>/dev/null | tail -n +4 | xargs -r rm -f

cd /home/dietpi
PATH="$D/bin:$PATH" bash "$D/start_mupibox_update.sh" "$KIND"
RC=$?
# done: the script moves its log away at its very end (/boot/mupibox_update.log); an aborted run leaves it there
if [ "$RC" = "0" ] && [ ! -e /boot/mupibox_update.log ] && [ "$(cut -f1 "$D/progress")" = "100" ]; then
	finish rebooting
	sleep 10
	systemctl reboot
else
	finish failed
	# the display was ended by the update script: back to the box's normal state
	[ "$IDLE_WAS_ACTIVE" = "active" ] && systemctl start mupi_idle_shutdown
	# (the update stops the server early on; an aborted run may leave it stopped)
	sudo -H -u dietpi bash -c "pm2 start server"
	sudo -i -u dietpi /usr/local/bin/mupibox/restart_kiosk.sh
fi
`

// stands in for whiptail --gauge (no terminal): "XXX / percent / step / XXX" blocks from the update script
export const WHIPTAIL_SH = `#!/bin/bash
# stand-in for whiptail --gauge during the app's update (backend-api eltern/updates.ts): the progress to a file
P=${STATE_DIR}/progress
while IFS= read -r line; do
	[ "$line" = "XXX" ] || continue
	IFS= read -r pct
	# the step: up to the closing XXX
	text=""
	while IFS= read -r l && [ "$l" != "XXX" ]; do text="\${text:+$text }$l"; done
	case "$pct" in '' | *[!0-9]*) pct=$(cut -f1 "$P" 2>/dev/null) ;; esac
	printf '%s\\t%s\\n' "\${pct:-0}" "$text" > "$P"
done
exit 0
`

interface Release {
  version: string
  info: string
}
let versionCache: { at: number; json: Record<string, unknown> } | null = null
let devDateCache: { at: number; date: string } | null = null

async function officialVersions(): Promise<Record<Channel, Release | null> | null> {
  if (!versionCache || Date.now() - versionCache.at > 3600_000) {
    try {
      const r = await fetch(`${REPO_RAW}/version.json`, { signal: AbortSignal.timeout(8000) })
      if (r.ok) versionCache = { at: Date.now(), json: (await r.json()) as Record<string, unknown> }
    } catch {
      // no internet: the last answer, if any
    }
  }
  const release = (versionCache?.json?.release ?? null) as Record<string, { version?: string; releaseinfo?: string }[]> | null
  if (!release) return null
  const latest = (c: Channel): Release | null => {
    const list = Array.isArray(release[c]) ? release[c] : []
    const last = list[list.length - 1]
    return last?.version ? { version: String(last.version), info: String(last.releaseinfo ?? '') } : null
  }
  return { stable: latest('stable'), beta: latest('beta'), dev: latest('dev') }
}

// the day of the last change in the official repository (what the admin interface shows as "DEV <date>")
async function devDate(): Promise<string | null> {
  if (!devDateCache || Date.now() - devDateCache.at > 3600_000) {
    try {
      const r = await fetch('https://api.github.com/repos/splitti/MuPiBox', { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/vnd.github+json' } })
      if (r.ok) devDateCache = { at: Date.now(), date: String(((await r.json()) as { pushed_at?: string }).pushed_at ?? '').slice(0, 10) }
    } catch {
      // no internet
    }
  }
  return devDateCache?.date || null
}

/** "4.2.4 stable", "3.2.5 BETA", "DEV 5.0.2 2026-09-01" -> its number and channel */
export function parseInstalled(v: string): { number: string | null; channel: Channel } {
  const number = /\d+(?:\.\d+)+/.exec(v)?.[0] ?? null
  const channel: Channel = /\bdev/i.test(v) ? 'dev' : /\bbeta\b/i.test(v) ? 'beta' : 'stable'
  return { number, channel }
}

/** -1, 0, 1 for version numbers like 4.2.10 against 4.2.9 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d > 0 ? 1 : -1
  }
  return 0
}

async function jobState() {
  const read = (f: string) => fsp.readFile(path.join(STATE_DIR, f), 'utf8').catch(() => '')
  const [stateText, progressText, output] = await Promise.all([read('state'), read('progress'), read('output.txt')])
  if (!stateText) return null
  const state = Object.fromEntries(
    stateText
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  )
  const [percent, step] = progressText.trim().split('\t')
  // the unit may have ended without a word (a crash, the box switched off): then it is not running any more
  const active = (await run('systemctl', ['is-active', UNIT], 5000)).stdout.trim()
  // (and "rebooting" is done once the box is up again)
  let phase = state.phase
  const alive = active === 'active' || active === 'activating'
  if (phase === 'running' && !alive) phase = 'failed'
  if (phase === 'rebooting' && !alive) phase = 'ok'
  return {
    kind: state.kind,
    phase, // running | rebooting | ok | failed
    started: Number(state.started) * 1000 || null,
    finished: Number(state.finished) * 1000 || null,
    percent: Number(percent) || 0,
    step: step ?? '',
    // the last lines, without the terminal's control characters
    output: output
      .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
      .split(/\r?\n|\r/)
      .filter((l) => l.trim())
      .slice(-40)
      .join('\n'),
  }
}

export function registerUpdateRoutes(router: Router, deps: UpdatesDeps): void {
  /** GET /api/app/updates - the installed version, the official ones, whether there is a newer one, the last job */
  router.get('/updates', requireSession, async (_req, res) => {
    const installed = String((deps.getMupiboxConfig()?.mupibox as Record<string, unknown> | undefined)?.version ?? '')
    const [latest, date, job] = await Promise.all([officialVersions(), devDate(), jobState()])
    const mine = parseInstalled(installed)
    const newer = latest?.[mine.channel]
    res.json({
      installed,
      channel: mine.channel,
      latest,
      devDate: date,
      update: newer && mine.number && compareVersions(newer.version, mine.number) > 0 ? { channel: mine.channel, version: newer.version } : null,
      job,
    })
  })

  /** GET /api/app/updates/job - the running (or last) update, for the progress */
  router.get('/updates/job', requireSession, async (_req, res) => {
    res.json({ job: await jobState() })
  })

  /** POST /api/app/updates/start {kind: stable|beta|dev|os} */
  router.post('/updates/start', requireSession, requireCsrf, async (req, res) => {
    const kind = String((req.body ?? {}).kind ?? '')
    if (![...CHANNELS, 'os'].includes(kind)) {
      res.status(400).json({ error: 'invalid kind' })
      return
    }
    const active = (await run('systemctl', ['is-active', UNIT], 5000)).stdout.trim()
    if (active === 'active' || active === 'activating') {
      res.status(409).json({ error: 'an update is running' })
      return
    }
    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'mupibox-update-'))
    try {
      await fsp.writeFile(path.join(tmp, 'run.sh'), RUN_SH)
      await fsp.writeFile(path.join(tmp, 'whiptail'), WHIPTAIL_SH)
      const install = await run('sudo', [
        'sh',
        '-c',
        `install -d -m 755 ${STATE_DIR} ${STATE_DIR}/bin && install -m 755 '${tmp}/run.sh' ${STATE_DIR}/run.sh && install -m 755 '${tmp}/whiptail' ${STATE_DIR}/bin/whiptail && rm -f ${STATE_DIR}/state ${STATE_DIR}/progress ${STATE_DIR}/output.txt`,
      ])
      if (!install.ok) {
        res.status(500).json({ error: 'could not prepare the update' })
        return
      }
    } finally {
      await fsp.rm(tmp, { recursive: true, force: true })
    }
    const r = await run('sudo', ['systemd-run', `--unit=${UNIT}`, '--collect', '--quiet', '--working-directory=/home/dietpi', '/bin/bash', `${STATE_DIR}/run.sh`, kind], 15000)
    if (!r.ok) {
      res.status(500).json({ error: `could not start the update ${r.stderr.slice(0, 200)}` })
      return
    }
    res.json({ ok: true })
  })
}
