// Extensions in the player (see docs/extensions.md): files of ~/.mupibox/data/extensions/<id>/ that an extension brings along are
// loaded here when the player starts - its `player.js` gets a `host` to add routes, listen to what the player does, and be a
// source of albums that are no folders (an audio CD). Everything an extension does goes through guards: an error in it is
// logged and switches that extension off for the session; the player and the other extensions go on.

const fs = require('node:fs')
const path = require('node:path')

// (the same as the API's, app-api/extensions.ts - test/compat.test.js checks it: an extension the API installed for a newer host lost its player part here)
const HOST_API = 13
// Since 5.1 below data/ (what the box keeps); a box that came over from before has them in ~/.mupibox/extensions: moved once
// (the API's extensions.ts does the same - whoever is first wins). In development the player's config folder.
const MUPI_HOME = '/home/dietpi/.mupibox'
const EXT_DIR = process.env.MUPIBOX_EXT_DIR || (process.env.NODE_ENV === 'development' ? path.resolve('../config/extensions') : `${MUPI_HOME}/data/extensions`)
if (!process.env.MUPIBOX_EXT_DIR && process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
  try {
    if (fs.existsSync(`${MUPI_HOME}/extensions`) && !fs.existsSync(EXT_DIR)) {
      fs.mkdirSync(path.dirname(EXT_DIR), { recursive: true })
      fs.renameSync(`${MUPI_HOME}/extensions`, EXT_DIR)
    }
  } catch {
    // (the other process was faster, or it is not possible)
  }
}
const ID = /^[a-z][a-z0-9-]{1,30}$/
const EVENTS = new Set(['stop', 'finished', 'track', 'config'])
// what an extension may set in what the player says of the playback
const META_FIELDS = new Set(['album', 'path', 'totalTracks', 'currentTracknr', 'currentTrackname'])
const MAX_ERRORS = 5

// keys whose values are secrets (as the box's API leaves them out of /api/config): not given to extensions
const SECRET_KEYS = /^(password|pass|pwd|pw|psk|secret|clientsecret|token|accesstoken|refreshtoken|hash|salt|sid|apikey|api_key|username|user|cookie)$/i

/** A copy of a configuration without the secrets, at any depth. */
function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [key, child] of Object.entries(value)) if (!SECRET_KEYS.test(key)) out[key] = redactSecrets(child)
    return out
  }
  return value
}

const tooNewSaid = new Set()

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

/** The manifest of an installed extension, or null when it is missing, broken or for a newer host. */
function readManifest(extDir, id) {
  if (!ID.test(id)) return null
  const manifest = readJson(path.join(extDir, id, 'manifest.json'), null)
  if (!manifest || manifest.id !== id || typeof manifest.version !== 'string') return null
  if (!Number.isInteger(manifest.hostApi) || manifest.hostApi < 1) return null
  if (manifest.hostApi > HOST_API) {
    // (said once per extension and version: the player part of an extension for a newer host is left out, and no one would see why)
    const key = `${id}@${manifest.version}`
    if (!tooNewSaid.has(key)) {
      tooNewSaid.add(key)
      console.warn(`${new Date().toLocaleString()}: [Extensions] ${id} ${manifest.version} is made for host API ${manifest.hostApi}, this player has ${HOST_API} - its player part is not loaded`)
    }
    return null
  }
  return manifest
}

/** The extensions that are installed and switched on: [{ id, dir, manifest }]. */
function enabledExtensions(extDir = EXT_DIR) {
  const state = readJson(path.join(extDir, 'state.json'), {})
  return Object.entries(state)
    .filter(([, s]) => s?.enabled !== false)
    .map(([id]) => ({ id, dir: path.join(extDir, id), manifest: readManifest(extDir, id) }))
    .filter((e) => e.manifest)
}

// (hostApi 13) the settings every user has for himself are in the same file under this key, by the id of the user (see
// the server's extensions.ts); the user in place is in the users' file next to the extensions
const PER_USER = '@users'
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v)

/** An extension's settings: its own file, with the defaults of the manifest behind it (those per user: the user's in place). */
function createSettings(extDir, id, manifest) {
  const file = path.join(extDir, 'settings', `${id}.json`)
  const defaults = Object.fromEntries(Object.entries(manifest.settings ?? {}).filter(([, d]) => 'default' in d).map(([k, d]) => [k, d.default]))
  const perUser = Object.entries(manifest.settings ?? {}).filter(([, d]) => d?.perUser === true).map(([k]) => k)
  // (as the server's users.ts reads it: the user in place when he is in the list, else the first of the list - no users' file
  // yet, or a broken one: the one user "main")
  const current = () => {
    const users = readJson(path.join(extDir, '..', 'users', 'users.json'), {})
    const ids = (Array.isArray(users?.users) ? users.users : []).map((u) => u?.id).filter((id) => typeof id === 'string' && /^[a-z0-9]{2,12}$/.test(id))
    if (ids.length === 0) return 'main'
    return ids.includes(users.current) ? users.current : ids[0]
  }
  const all = () => {
    const { [PER_USER]: byUser, ...shared } = readJson(file, {})
    if (perUser.length === 0 || !isObj(byUser)) return { ...defaults, ...shared }
    const who = current()
    const mine = isObj(byUser[who]) ? byUser[who] : {}
    return { ...defaults, ...shared, ...Object.fromEntries(perUser.filter((k) => Object.hasOwn(mine, k)).map((k) => [k, mine[k]])) }
  }
  return {
    get: (key, fallback) => (key in all() ? all()[key] : fallback),
    all,
    set(key, value) {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      const have = readJson(file, {})
      if (perUser.includes(key)) {
        // (a setting per user: the user's in place)
        const byUser = isObj(have[PER_USER]) ? { ...have[PER_USER] } : {}
        const who = current()
        byUser[who] = { ...(isObj(byUser[who]) ? byUser[who] : {}), [key]: value }
        fs.writeFileSync(file, JSON.stringify({ ...have, [PER_USER]: byUser }))
      } else fs.writeFileSync(file, JSON.stringify({ ...have, [key]: value }))
    },
  }
}

/**
 * The host of the player's extensions. `deps`: app (express), log, getConfig(), getMeta() (the player's currentMeta), engine
 * (the playback: command, playEntries, setVolume, trackIndex), stop(), generation(), extDir. `load()` starts the enabled extensions; the player
 * asks `albumFor(folder)` where it has a folder, and tells the events with `emit`.
 */
function createExtensionHost(deps) {
  const extDir = deps.extDir ?? EXT_DIR
  const albums = new Map() // folder -> { id, provider }
  const listeners = new Map() // event -> [{ id, fn }]
  const errors = new Map()
  const stopped = new Set()
  const active = []

  const fail = (id, where, error) => {
    const n = (errors.get(id) ?? 0) + 1
    errors.set(id, n)
    deps.log.warn(`[Extension ${id}] error in ${where}: ${error?.stack ?? error}`)
    if (n >= MAX_ERRORS && !stopped.has(id)) {
      stopped.add(id)
      deps.log.warn(`[Extension ${id}] switched off for this session after ${n} errors`)
    }
  }
  const alive = (id) => !stopped.has(id)

  // a function of an extension, called by the player: errors are caught, a stopped extension is not called
  const guard = (id, where, fn, fallback) => (...args) => {
    if (!alive(id)) return fallback
    try {
      const result = fn(...args)
      if (result && typeof result.then === 'function') return result.catch((error) => (fail(id, where, error), fallback))
      return result
    } catch (error) {
      fail(id, where, error)
      return fallback
    }
  }

  function makeHost(ext) {
    const { id, dir, manifest } = ext
    const settings = createSettings(extDir, id, manifest)
    // a folder of the extension's own that stays when it is updated (caches, what it keeps)
    const dataDir = path.join(extDir, 'data', id)
    try {
      fs.mkdirSync(dataDir, { recursive: true })
    } catch {
      // read-only: the extension finds out when it writes
    }
    return {
      id,
      dir,
      dataDir,
      version: manifest.version,
      log: {
        debug: (text) => deps.log.debug(`[Extension ${id}] ${text}`),
        info: (text) => deps.log.info?.(`[Extension ${id}] ${text}`),
        warn: (text) => deps.log.warn(`[Extension ${id}] ${text}`),
      },
      settings,
      config: () => deps.getConfig(),
      route(method, subpath, handler) {
        const verb = String(method).toLowerCase()
        if (!['get', 'post'].includes(verb) || !String(subpath).startsWith('/')) throw new Error('route: method get or post, path from "/"')
        deps.app[verb](`/ext/${id}${subpath}`, (req, res, next) => {
          if (!alive(id)) return res.status(503).json({ ok: false, error: 'extension stopped' })
          try {
            const result = handler(req, res, next)
            if (result && typeof result.catch === 'function') result.catch((error) => (fail(id, `route ${subpath}`, error), !res.headersSent && res.status(500).json({ ok: false })))
          } catch (error) {
            fail(id, `route ${subpath}`, error)
            if (!res.headersSent) res.status(500).json({ ok: false })
          }
        })
      },
      on(event, fn) {
        if (!EVENTS.has(event)) throw new Error(`unknown event: ${event}`)
        listeners.set(event, [...(listeners.get(event) ?? []), { id, fn: guard(id, `event ${event}`, fn) }])
      },
      engine: deps.engine,
      // the playback as a whole: stop it, and which playback it is (counts up with every start and stop - for "is it still the one I mean")
      playback: { stop: () => deps.stop(), generation: () => deps.generation() },
      meta: () => deps.getMeta(),
      setMeta(patch) {
        const meta = deps.getMeta()
        for (const [key, value] of Object.entries(patch ?? {})) if (META_FIELDS.has(key)) meta[key] = value
      },
      albums: {
        register(provider) {
          if (!provider || typeof provider.folder !== 'string' || !provider.folder || typeof provider.play !== 'function') throw new Error('albums.register: a provider needs a folder and play()')
          if (albums.has(provider.folder)) throw new Error(`albums.register: ${provider.folder} is taken`)
          const wrapped = { folder: provider.folder }
          for (const name of ['play', 'tracklist', 'trackName', 'progress', 'seek', 'onStop', 'onFinished']) {
            if (typeof provider[name] === 'function') wrapped[name] = guard(id, `album ${name}`, provider[name].bind(provider), undefined)
          }
          albums.set(provider.folder, { id, provider: wrapped })
        },
      },
    }
  }

  return {
    /** Starts the extensions that are on. Returns the ids that are running. */
    load() {
      for (const ext of enabledExtensions(extDir)) {
        const file = ext.manifest.player
        if (!file) continue
        try {
          const target = path.resolve(ext.dir, file)
          if (!target.startsWith(path.resolve(ext.dir) + path.sep)) throw new Error('player file outside the extension')
          // (a file that is read at run time, not part of this bundle)
          const mod = eval('require')(target)
          if (typeof mod.activate !== 'function') throw new Error('player.js has no activate()')
          mod.activate(makeHost(ext))
          active.push(ext.id)
          deps.log.info?.(`[Extension ${ext.id}] ${ext.manifest.version} started`)
        } catch (error) {
          fail(ext.id, 'start', error)
          stopped.add(ext.id)
        }
      }
      return [...active]
    },
    /** The provider of the albums of this folder name, or undefined. */
    albumFor(folder) {
      const entry = albums.get(String(folder))
      return entry && alive(entry.id) ? entry.provider : undefined
    },
    emit(event, ...args) {
      for (const l of listeners.get(event) ?? []) l.fn(...args)
    },
    get running() {
      return active.filter(alive)
    },
  }
}

module.exports = { HOST_API, EXT_DIR, redactSecrets, readManifest, enabledExtensions, createSettings, createExtensionHost }
