// The CD drive: is there an audio CD in it, and how many tracks? The display shows a "CD" category while there is one.
//
// The drive is asked with the kernel's own ioctls (through a few lines of Python, as Node has no ioctl): the state of
// the drive (CDROM_DRIVE_STATUS) is a cheap question that does not spin the disc up, so it is asked every few seconds;
// what is on the disc (type and number of tracks, which reads the table of contents) only once when a disc has come in.
// The watcher itself is plain logic over a `probe` function, so it runs in a test without a drive.

const { execFile } = require('node:child_process')

const DEVICE = process.env.MUPIBOX_CD_DEVICE || '/dev/sr0'
const POLL_MS = 3000

// CDROM_DRIVE_STATUS 0x5326: 1 no disc, 2 tray open, 3 not ready (spinning up), 4 disc ok;
// CDROM_DISC_STATUS 0x5327: 100 audio, 101-104 data, 105 mixed; CDROMREADTOCHDR 0x5305: first and last track
const PROBE_PY = `
import fcntl, json, os, struct, sys
dev, full = sys.argv[1], sys.argv[2] == "1"
try:
    fd = os.open(dev, os.O_RDONLY | os.O_NONBLOCK)
except FileNotFoundError:
    print(json.dumps({"drive": "nodrive"})); sys.exit(0)
except PermissionError:
    print(json.dumps({"drive": "noaccess"})); sys.exit(0)
except OSError as e:
    print(json.dumps({"drive": "error", "errno": e.errno})); sys.exit(0)
status = fcntl.ioctl(fd, 0x5326, 0)
out = {"drive": {1: "none", 2: "open", 3: "notready", 4: "ok"}.get(status, "error")}
if full and status == 4:
    disc = fcntl.ioctl(fd, 0x5327, 0)
    out["disc"] = "audio" if disc == 100 else "mixed" if disc == 105 else "data" if 101 <= disc <= 104 else "unknown"
    if out["disc"] == "audio":
        hdr = fcntl.ioctl(fd, 0x5305, bytes(2))
        out["first"], out["last"] = hdr[0], hdr[1]
        out["tracks"] = hdr[1] - hdr[0] + 1
        # where each track starts (seconds from the start of the first track; the last entry is the end of the disc) -
        # mpv plays the disc as one file with a chapter per track and tells the time of the whole disc
        def lba(track):
            buf = bytearray(12)
            buf[0] = track
            buf[2] = 1  # CDROM_LBA
            return struct.unpack_from("<i", fcntl.ioctl(fd, 0x5306, bytes(buf)), 4)[0]
        try:
            marks = [lba(t) for t in range(hdr[0], hdr[1] + 1)] + [lba(0xAA)]
            out["starts"] = [round((m - marks[0]) / 75.0, 3) for m in marks]
            out["lbas"] = marks  # (for the disc's id: musicbrainz, see cd-lookup.js)
        except OSError:
            pass
        # the media catalog number (the barcode, when the disc carries it)
        try:
            mcn = fcntl.ioctl(fd, 0x5311, bytes(14))[:13].decode("ascii", "ignore").strip(chr(0) + " ")
            if mcn.isdigit() and int(mcn) != 0:
                out["mcn"] = mcn
        except (OSError, ValueError):
            pass
print(json.dumps(out))
`

/** One question to the drive; resolves to what the script printed ({ drive, disc?, tracks? }), never rejects. */
function probeDevice(device = DEVICE, full = false) {
  return new Promise((resolve) => {
    execFile('python3', ['-c', PROBE_PY, device, full ? '1' : '0'], { timeout: 8000 }, (err, stdout) => {
      if (err) return resolve({ drive: 'error' })
      try {
        resolve(JSON.parse(String(stdout).trim()))
      } catch {
        resolve({ drive: 'error' })
      }
    })
  })
}

// A command to the drive: "stop" lets the disc stop spinning (CDROMSTOP is the START STOP UNIT command with the motor off),
// "eject" opens the tray - or closes it when it is open (CDROMEJECT 0x5309, CDROMCLOSETRAY 0x5319; the door lock is taken off first)
const COMMAND_PY = `
import fcntl, json, os, sys, time
dev, cmd = sys.argv[1], sys.argv[2]
try:
    fd = os.open(dev, os.O_RDONLY | os.O_NONBLOCK)
    if cmd == "stop":
        fcntl.ioctl(fd, 0x5307, 0)
    elif cmd == "eject":
        opened = fcntl.ioctl(fd, 0x5326, 0) == 2
        try:
            fcntl.ioctl(fd, 0x5329, 0)
        except OSError:
            pass
        fcntl.ioctl(fd, 0x5319 if opened else 0x5309, 0)
        if opened:
            # (many slim USB drives refuse to close their tray by command - the kernel says nothing: is it closed?)
            for _ in range(8):
                time.sleep(0.75)
                if fcntl.ioctl(fd, 0x5326, 0) != 2:
                    print(json.dumps({"ok": True, "closing": True})); sys.exit(0)
            print(json.dumps({"ok": False, "closing": True, "error": "tray stays open"})); sys.exit(0)
        print(json.dumps({"ok": True, "closing": False})); sys.exit(0)
    print(json.dumps({"ok": True}))
except OSError as e:
    print(json.dumps({"ok": False, "errno": e.errno}))
`

/** "stop" or "eject" to the drive; resolves to { ok, closing?, errno?, error? }, never rejects. */
function driveCommand(command, device = DEVICE) {
  return new Promise((resolve) => {
    execFile('python3', ['-c', COMMAND_PY, device, command], { timeout: 15000 }, (err, stdout) => {
      if (err) return resolve({ ok: false })
      try {
        resolve(JSON.parse(String(stdout).trim()))
      } catch {
        resolve({ ok: false })
      }
    })
  })
}

/** What the display is told: an audio CD with its tracks, or nothing. */
const NO_CD = Object.freeze({ present: false, tracks: 0, id: 0 })
// (a state also carries `starts`: the start of each track in seconds and the end of the disc, when the drive told them)

/**
 * Watches the drive. `probe(full)` answers as probeDevice does; `onChange(state)` gets { present, tracks, id } whenever it
 * changes (id counts up with every disc that comes in, so a swapped disc is a new one). `fixAccess()` is called when the
 * drive cannot be opened (a drive that is not readable by this user); it may make it readable, the next question tells.
 */
// A disc that was in stays "in" this long while the drive is gone or cannot be read: a drive on a USB port that resets (a weak
// power supply) is away for a few seconds and comes back with the same disc - the display should not flicker meanwhile.
const GRACE_MS = 120000
// The drive comes back with the rights of a new device (root only): they are opened again at once, not once in a while
const FIX_EVERY_MS = 3000

function createCdWatcher({ probe = (full) => probeDevice(DEVICE, full), onChange = () => {}, intervalMs = POLL_MS, fixAccess = () => {}, now = Date.now } = {}) {
  let state = NO_CD
  let lastOkAt = 0
  let lastToc = ''
  let seen = false // (a drive that was seen once is asked as often as ever when it is gone)
  let lastDrive = 'unknown'
  let discs = 0
  let timer = null
  let busy = false
  let lastFix = 0
  let skipped = 0

  const set = (next) => {
    if (next.present === state.present && next.tracks === state.tracks && next.id === state.id) return
    state = next
    onChange(state)
  }

  async function tick() {
    if (busy) return
    // (a box without a drive, or without Python: asked only every tenth time - a drive may be plugged in later)
    if (!seen && (lastDrive === 'nodrive' || lastDrive === 'error') && ++skipped % 10 !== 0) return
    busy = true
    try {
      const quick = await probe(false)
      if (quick.drive === 'noaccess') {
        if (now() - lastFix > FIX_EVERY_MS) {
          lastFix = now()
          fixAccess()
        }
      }
      if (quick.drive !== 'ok') {
        lastDrive = quick.drive
        if (quick.drive === 'none' || quick.drive === 'open') {
          // the disc is out for sure
          lastToc = ''
          set(NO_CD)
        } else if (state.present && now() - lastOkAt > GRACE_MS) {
          // the drive has been gone, unreadable or spinning up for too long: it is no CD any more
          set(NO_CD)
        }
        return
      }
      seen = true
      lastOkAt = now()
      // a disc is in: its contents are read when it has just come in (or when the drive was not seen before)
      if (lastDrive !== 'ok') {
        const full = await probe(true)
        lastDrive = full.drive
        if (full.drive === 'ok' && full.disc === 'audio' && full.tracks > 0) {
          const toc = JSON.stringify(full.lbas ?? full.tracks)
          // the same disc after the drive was away for a moment: nothing changes (the same id - no new lookup)
          if (state.present && toc === lastToc) return
          lastToc = toc
          discs++
          set({
            present: true,
            tracks: full.tracks,
            id: discs,
            ...(Array.isArray(full.starts) ? { starts: full.starts } : {}),
            ...(Array.isArray(full.lbas) ? { lbas: full.lbas, first: full.first } : {}),
            ...(full.mcn ? { mcn: full.mcn } : {}),
          })
        } else if (full.drive === 'ok') {
          // a data disc, a blank one: nothing this player plays (it is asked again only when the disc is changed)
          set(NO_CD)
        }
      }
    } finally {
      busy = false
    }
  }

  return {
    start() {
      if (timer) return
      timer = setInterval(() => void tick(), intervalMs)
      timer.unref?.()
      void tick()
    },
    stop() {
      if (timer) clearInterval(timer)
      timer = null
    },
    tick,
    get state() {
      return state
    },
    /** There is a CD drive on the box (seen once, or there now) - also without a disc in it. */
    get drive() {
      return seen || (lastDrive !== 'unknown' && lastDrive !== 'nodrive' && lastDrive !== 'error')
    },
    /** The tray was opened by us: no disc any more, at once (the next question finds the tray open anyway). */
    ejected() {
      lastToc = ''
      lastDrive = 'open'
      set(NO_CD)
    },
  }
}

module.exports = { createCdWatcher, probeDevice, driveCommand, NO_CD, DEVICE, POLL_MS }
