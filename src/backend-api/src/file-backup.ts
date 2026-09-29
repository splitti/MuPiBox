import fs from 'node:fs'
import path from 'node:path'

/**
 * Keeps the version a write is about to replace, so a bad save can be undone:
 *   - <file>.bak: the version before the last write
 *   - backup/<name>-YYYY-MM-DD<ext>: the version before the first write of each day, the last `keepDays` days
 * A failing backup only logs: it must never stop the write itself.
 */
export function backupBeforeWrite(file: string, keepDays = 7): void {
  try {
    if (!fs.existsSync(file)) return
    fs.copyFileSync(file, `${file}.bak`)
    const { dir, name, ext } = path.parse(file)
    const backupDir = path.join(dir, 'backup')
    const now = new Date()
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const daily = path.join(backupDir, `${name}-${day}${ext}`)
    if (fs.existsSync(daily)) return
    fs.mkdirSync(backupDir, { recursive: true })
    fs.copyFileSync(file, daily)
    const dated = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d{4}-\\d{2}-\\d{2}${ext.replace('.', '\\.')}$`)
    const old = fs
      .readdirSync(backupDir)
      .filter((f) => dated.test(f))
      .sort()
      .reverse()
      .slice(keepDays)
    for (const f of old) fs.rmSync(path.join(backupDir, f), { force: true })
  } catch (err) {
    console.warn(`${new Date().toLocaleString()}: [MuPiBox-Server] backup of ${file} failed: ${(err as Error).message}`)
  }
}

/**
 * The same for a root-owned file (/etc/mupibox/mupiboxconfig.json), as a shell snippet for `sh -c` with the file in
 * "$2": both the backend and the admin interface replace that file with sudo. Never fails.
 */
export const SUDO_BACKUP_SNIPPET =
  '{ f="$2"; d="$(dirname "$f")/backup"; n="$(basename "$f" .json)"; day="$(date +%F)";' +
  ' sudo cp -p "$f" "$f.bak";' +
  ' if [ ! -e "$d/$n-$day.json" ]; then sudo mkdir -p "$d" && sudo cp -p "$f" "$d/$n-$day.json"' +
  ' && ls -1 "$d/$n"-????-??-??.json | sort -r | tail -n +8 | xargs -r sudo rm -f; fi; } 2>/dev/null || true'
