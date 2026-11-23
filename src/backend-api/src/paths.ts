import path from 'node:path'

/**
 * Where the box keeps its program, its data and its cache - the one place for these paths in the server.
 *
 * Since 5.1 everything lies below ~/.mupibox in four folders (scripts/mupibox/migrate_layout.sh moves a box over;
 * before, program, data and cache were mixed in Sonos-Kids-Controller-master and spotifycontroller-main, which stay
 * as links to server/ and player/):
 *   server/   the program - an update replaces it; its config/ holds what the box writes for it (config.json,
 *             monitor.json, network.json, wlan.json)
 *   player/   the player - an update replaces it
 *   data/     what the box keeps - an update never touches it: library/ (data.json, resume.json, the offline lists,
 *             the episode positions ...), covers/ (of the local albums), logs/, the app's sessions, the hidden covers,
 *             the NAS folder index, the play time of the day
 *   cache/    what can be fetched or made again - may be emptied at any time
 * In development and the tests everything lies below the working directory, as before: config/ and cache/.
 */
const production = !['test', 'development'].includes(process.env.NODE_ENV ?? '')

export const MUPI_HOME = '/home/dietpi/.mupibox'

export const SERVER_DIR = production ? `${MUPI_HOME}/server` : process.cwd()
export const SERVER_CONFIG_DIR = production ? `${SERVER_DIR}/config` : path.resolve('config')
export const WWW_DIR = `${SERVER_DIR}/www`
export const PLAYER_DIR = `${MUPI_HOME}/player`

export const DATA_DIR = production ? `${MUPI_HOME}/data` : path.resolve('config')
export const LIBRARY_DIR = production ? `${DATA_DIR}/library` : DATA_DIR
export const COVERS_DIR = `${DATA_DIR}/covers`
export const LOGS_DIR = production ? `${DATA_DIR}/logs` : DATA_DIR

export const CACHE_DIR = production ? `${MUPI_HOME}/cache` : path.resolve('cache')

/** The installed extensions (their files, state.json, settings/ and data/) - what the box keeps, so below data/. Before the
 *  layout of 5.1 they lay in ~/.mupibox/extensions (EXTENSIONS_DIR_BEFORE; extensions.ts moves them over once). */
export const EXTENSIONS_DIR = `${DATA_DIR}/extensions`
export const EXTENSIONS_DIR_BEFORE = `${MUPI_HOME}/extensions`

