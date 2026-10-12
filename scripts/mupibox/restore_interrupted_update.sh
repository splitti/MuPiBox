#!/bin/bash
#
# After an update that did not get to its end - the power cut or the box switched off while it ran. The update copies
# the user data (library, resume points, covers ...) to userdata.upd-bak, moves the old installation aside to
# Sonos-Kids-Controller-master.upd-bak (moved, not copied: its data stays in it as it was), unpacks the new one, sets
# it up and brings the data back (update/start_mupibox_update.sh). Stopped in between, the box started with an empty
# library - or, cut off while unpacking, with a broken installation.
#
# The update marks it (update-state, written next to it, then exchanged, on the card before it goes on) from before
# it moves the old installation aside until its very last step - only then the old installation and the backup go.
# Whatever the mark finds here, there is one way back that is always whole: the old installation comes back, with its
# own data as it was before the update (the new one is kept as .broken-<time>, the backup as userdata.upd-bak.kept-
# <time>). The update can then simply be run again. Nothing is put together from halves: an installation half set up,
# user data half brought back.
#
# Updates before this mark existed (no mark, an old installation left aside): it comes back when the new one lacks
# server.js or index.html; the user data comes back from the backup when the library is empty and the backup has one.
#
# Run by mupi_update_recover.service at every start - before pm2 starts the app's server and the player and before
# the network check (check_network.sh writes an empty library where it finds none) - and at the beginning of every
# update, before its own backup: an update that stopped before is undone first. Exit 1 when it could not be undone or
# finished: the update then stops before it touches anything. The app's server and the player are stopped first when
# they run (and started again after). Runs as root.
#   --no-restart   kept for the callers of before; the apps are only started again when this script stopped them
# SKC / USERDATA_BAK / UPDATE_STATE / PLAYER_DIR for a test on copies, NO_PM2=1 leaves the running apps alone.

SKC="${SKC:-/home/dietpi/.mupibox/Sonos-Kids-Controller-master}"
OLD="${SKC}.upd-bak"
USERDATA_BAK="${USERDATA_BAK:-/home/dietpi/.mupibox/userdata.upd-bak}"
UPDATE_STATE="${UPDATE_STATE:-/home/dietpi/.mupibox/update-state}"
PLAYER_DIR="${PLAYER_DIR:-/home/dietpi/.mupibox/spotifycontroller-main}"
JQ=/usr/bin/jq
[ -x "${JQ}" ] || JQ=jq
STAMP=$(date +%Y%m%d-%H%M%S)
STOPPED=0
RESULT=0

log() { echo "restore_interrupted_update: $*"; }

# entries of a library file: 0 for a missing, unreadable or empty one
entries() {
	[ -s "$1" ] || { echo 0; return; }
	"${JQ}" 'if type == "array" then length else 0 end' "$1" 2>/dev/null | head -n 1 | grep -E '^[0-9]+$' || echo 0
}

# the app's server and the player: stopped while files are put back (only when they run - at the start they do not yet)
stop_apps() {
	[ "${STOPPED}" = 1 ] && return
	[ "${NO_PM2:-0}" = 1 ] && return
	# (pm2 asked only when its daemon runs: asking would start it, ahead of pm2-dietpi.service)
	pgrep -u dietpi -f 'PM2 v[0-9]' >/dev/null 2>&1 || return
	if sudo -H -u dietpi bash -c 'pm2 jlist 2>/dev/null' | grep -q '"status":"online"'; then
		log "stopping the app's server and the player meanwhile"
		sudo -H -u dietpi bash -c 'pm2 stop server spotify-control >/dev/null 2>&1'
		STOPPED=1
	fi
}
start_apps() {
	[ "${STOPPED}" = 1 ] || return
	sudo -H -u dietpi bash -c 'pm2 start server spotify-control >/dev/null 2>&1'
}

# $1 in place of $2, through a copy next to it: a file is exchanged in one step (never missing in between), a folder
# replaced once its copy is complete
put_back() {
	local next="${2}.mupibox-restore"
	rm -rf "${next}"
	cp -a "$1" "${next}" || { rm -rf "${next}"; return 1; }
	if [ -d "${next}" ] && [ ! -L "${next}" ]; then
		rm -rf "$2" && mv "${next}" "$2"
	else
		mv -f "${next}" "$2"
	fi
}

# the old installation back in place of the new one
roll_back() {
	stop_apps
	if [ -e "${SKC}" ] && ! mv "${SKC}" "${SKC}.broken-${STAMP}"; then
		log "could not move the incomplete installation aside"
		return 1
	fi
	if ! mv "${OLD}" "${SKC}"; then
		log "could not move the previous installation back"
		return 1
	fi
	# (the update copies its player there; the old installation brings its own)
	if [ -s "${SKC}/spotify-control.js" ] && [ -d "${PLAYER_DIR}" ]; then
		cp "${SKC}/spotify-control.js" "${PLAYER_DIR}/spotify-control.js.mupibox-restore" &&
			mv -f "${PLAYER_DIR}/spotify-control.js.mupibox-restore" "${PLAYER_DIR}/spotify-control.js"
	fi
	# the update's backup: kept, under a name an update does not take for its own
	[ -d "${USERDATA_BAK}" ] && mv "${USERDATA_BAK}" "${USERDATA_BAK}.kept-${STAMP}"
	chown -R dietpi:dietpi "${SKC}" 2>/dev/null
	sync
	log "the previous installation is back, with its data - the update can be run again"
	return 0
}

# (updates from before the mark) the user data from the update's backup; 0 when all of it is back
restore_userdata() {
	local ok=0 item name
	mkdir -p "${SKC}/server/config" "${SKC}/www" || return 1
	# (not what the installation brings itself, nor the links the box makes anew)
	for item in "${USERDATA_BAK}"/config/* "${USERDATA_BAK}"/config/.[!.]*; do
		[ -e "${item}" ] || continue
		name=$(basename "${item}")
		case "${name}" in
			config.json | monitor.json | active_data.json | active_resume.json | network.json) continue ;;
		esac
		[ -L "${item}" ] && continue
		put_back "${item}" "${SKC}/server/config/${name}" || ok=1
	done
	for item in cover active_theme.css rss-covers; do
		[ -e "${USERDATA_BAK}/www/${item}" ] || continue
		put_back "${USERDATA_BAK}/www/${item}" "${SKC}/www/${item}" || ok=1
	done
	if [ -d "${USERDATA_BAK}/www/theme-data" ]; then
		mkdir -p "${SKC}/www/theme-data" && cp -an "${USERDATA_BAK}/www/theme-data/." "${SKC}/www/theme-data/" || ok=1
	fi
	chown -R dietpi:dietpi "${SKC}/server/config" 2>/dev/null
	# a Spotify block the old installation still holds (copied - the old installation stays as it is): of two the
	# longer one, so the box does not ask Spotify again while it has to wait
	local old_block="${OLD}/cache/spotify-block.json" new_block="${SKC}/cache/spotify-block.json"
	if [ -s "${old_block}" ] && [ "$(block_until "${old_block}")" -gt "$(block_until "${new_block}")" ]; then
		mkdir -p "${SKC}/cache" && put_back "${old_block}" "${new_block}" && chown -R dietpi:dietpi "${SKC}/cache" || ok=1
	fi
	[ "$(entries "${SKC}/server/config/data.json")" -gt 0 ] || ok=1
	return ${ok}
}

# until when a Spotify block file holds (0: none)
block_until() {
	[ -s "$1" ] || { echo 0; return; }
	"${JQ}" -r '.until // 0 | floor' "$1" 2>/dev/null | grep -E '^[0-9]+$' || echo 0
}

if [ -e "${UPDATE_STATE}" ]; then
	# An update stopped between moving the old installation aside and its last step (whatever the mark says - an empty
	# one too: it was written before anything was touched)
	if [ -d "${OLD}" ]; then
		log "an update stopped halfway - the previous installation comes back"
		if roll_back; then
			rm -f "${UPDATE_STATE}" "${UPDATE_STATE}.new"
			sync
		else
			RESULT=1
		fi
	else
		# (moving it aside is one rename: without it the update stopped before - the old installation is untouched)
		log "an update stopped before it moved the installation aside - nothing to undo"
		rm -f "${UPDATE_STATE}" "${UPDATE_STATE}.new"
		sync
	fi
elif [ -d "${OLD}" ] && [ -s "${OLD}/server.js" ] && { [ ! -s "${SKC}/server.js" ] || [ ! -s "${SKC}/www/index.html" ]; }; then
	log "the installation is incomplete (an update stopped while unpacking) - the previous one comes back"
	roll_back || RESULT=1
elif [ -d "${USERDATA_BAK}/config" ] && [ "$(entries "${USERDATA_BAK}/config/data.json")" -gt 0 ] && [ "$(entries "${SKC}/server/config/data.json")" -eq 0 ]; then
	log "the library is empty, the backup of an update has $(entries "${USERDATA_BAK}/config/data.json") entries - the user data comes back"
	stop_apps
	if restore_userdata; then
		sync
		# kept, under a name the update does not use (it would take an old backup for the one of its own run)
		mv "${USERDATA_BAK}" "${USERDATA_BAK}.restored-${STAMP}"
		log "user data restored"
	else
		log "the user data could not be restored completely - the backup stays in ${USERDATA_BAK}"
		RESULT=1
	fi
fi

sync
start_apps
exit ${RESULT}
