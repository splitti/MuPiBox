#!/bin/bash
#
# After an update that did not get to its end - the power cut or the box switched off while it ran. The update copies
# the user data (library, resume points, covers ...) to userdata.upd-bak, moves the old installation aside to
# Sonos-Kids-Controller-master.upd-bak, unpacks the new one and only then brings the data back
# (update/start_mupibox_update.sh, "Backup Userdata" / "Restore Userdata"). Stopped in between, the box started with an
# empty library - or, cut off while unpacking, with a broken installation - and the data waited in the backup.
#
# The update says where it is in update-state (written next to it, then exchanged, on the card before it goes on):
#   unpacking   the old installation is aside, the new one is being unpacked - not known to be complete
#   unpacked    the new one is complete (unpacked, checked, on the card); the user data is not back yet
#   (no file)   the update got to its end, or never began
# Here (mupi_update_recover.service at every start, before pm2 starts the app's server and the player; and at the
# beginning of every update, before its own backup):
#   unpacking   the old installation comes back, with its data (the new one is kept as .broken-<time>)
#   unpacked    the user data comes back from the backup - all of it, as often as it takes: the mark goes only when
#               all of it is back and the library is readable - and the old installation's cache with it (the Spotify
#               block too: of two the longer one)
# Updates before this mark existed: the old installation comes back when the new one lacks server.js or index.html,
# the user data when the library is empty and the backup has one.
# Whatever the app's server or the player would write meanwhile: they are stopped first when they run (and started
# again after), so nothing they write is replaced by the backup or the other way round. Every file comes back through a
# copy next to it, then exchanged. Runs as root.
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

# $1 (a file or folder) in place of $2: copied next to it, then exchanged
put_back() {
	local next="${2}.mupibox-restore"
	rm -rf "${next}"
	cp -a "$1" "${next}" || { rm -rf "${next}"; return 1; }
	rm -rf "$2"
	mv "${next}" "$2"
}

# the update's marks gone (written as the update writes them)
clear_state() {
	rm -f "${UPDATE_STATE}" "${UPDATE_STATE}.new"
	sync
}

# the old installation back in place of an incomplete one
roll_back() {
	stop_apps
	[ -e "${SKC}" ] && mv "${SKC}" "${SKC}.broken-${STAMP}"
	if ! mv "${OLD}" "${SKC}"; then
		log "could not move the previous installation back"
		return 1
	fi
	# (the update copied the new player there already; the old installation brings its own)
	if [ -s "${SKC}/spotify-control.js" ] && [ -d "${PLAYER_DIR}" ]; then
		cp "${SKC}/spotify-control.js" "${PLAYER_DIR}/spotify-control.js.mupibox-restore" &&
			mv -f "${PLAYER_DIR}/spotify-control.js.mupibox-restore" "${PLAYER_DIR}/spotify-control.js"
	fi
	# the update's backup belongs to it: kept, under a name an update does not take for its own
	[ -d "${USERDATA_BAK}" ] && mv "${USERDATA_BAK}" "${USERDATA_BAK}.kept-${STAMP}"
	chown -R dietpi:dietpi "${SKC}" 2>/dev/null
	log "the previous installation is back"
	return 0
}

# the user data from the update's backup, all of it (as "Restore Userdata" in the update); 0 when everything is back
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
	# theme-data: the installation's files stay, what the user added comes back
	if [ -d "${USERDATA_BAK}/www/theme-data" ]; then
		mkdir -p "${SKC}/www/theme-data" && cp -an "${USERDATA_BAK}/www/theme-data/." "${SKC}/www/theme-data/" || ok=1
	fi
	chown -R dietpi:dietpi "${SKC}/server/config" 2>/dev/null
	# the library has to be readable again (an empty one is fine only when the backup's was empty too)
	"${JQ}" -e . "${SKC}/server/config/data.json" >/dev/null 2>&1 || [ ! -e "${USERDATA_BAK}/config/data.json" ] || ok=1
	return ${ok}
}

# until when a Spotify block file holds (0: none)
block_until() {
	[ -s "$1" ] || { echo 0; return; }
	"${JQ}" -r '.until // 0 | floor' "$1" 2>/dev/null | grep -E '^[0-9]+$' || echo 0
}

# the old installation's caches (Spotify answers, covers, the NAS index), as the update moves them; of two Spotify
# blocks the one that holds longer
merge_cache() {
	[ -d "${OLD}/cache" ] || return 0
	local item name target
	mkdir -p "${SKC}/cache"
	for item in "${OLD}"/cache/* "${OLD}"/cache/.[!.]*; do
		[ -e "${item}" ] || continue
		name=$(basename "${item}")
		target="${SKC}/cache/${name}"
		if [ "${name}" = "spotify-block.json" ]; then
			[ "$(block_until "${item}")" -gt "$(block_until "${target}")" ] && put_back "${item}" "${target}"
		elif [ ! -e "${target}" ]; then
			mv "${item}" "${target}"
		fi
	done
	chown -R dietpi:dietpi "${SKC}/cache" 2>/dev/null
	return 0
}

STATE=$(head -n 1 "${UPDATE_STATE}" 2>/dev/null | tr -d '[:space:]')
DATA="${SKC}/server/config/data.json"

if [ "${STATE}" = "unpacking" ]; then
	# 1. cut off while unpacking: whatever is there may be incomplete - the old installation back
	if [ -d "${OLD}" ]; then
		log "an update stopped while unpacking - the previous installation comes back"
		roll_back && clear_state
	else
		# (moving it aside is one rename: without it the update stopped before - the old installation is untouched)
		log "an update stopped before it moved the installation aside - nothing to undo"
		clear_state
	fi
elif [ "${STATE}" = "unpacked" ]; then
	# 2. the new installation complete, the user data not (all) back: all of it again
	if [ -d "${USERDATA_BAK}/config" ]; then
		log "an update stopped before the user data was back - it comes back now"
		stop_apps
		if restore_userdata; then
			merge_cache
			sync
			rm -rf "${USERDATA_BAK}" "${OLD}"
			clear_state
			log "user data restored"
		else
			log "the user data could not be restored completely - tried again at the next start (backup in ${USERDATA_BAK})"
		fi
	else
		log "an update stopped after unpacking, without a backup of the user data - nothing to bring back"
		clear_state
	fi
elif [ -z "${STATE}" ]; then
	# updates from before the marks
	if [ -d "${OLD}" ] && [ -s "${OLD}/server.js" ] && { [ ! -s "${SKC}/server.js" ] || [ ! -s "${SKC}/www/index.html" ]; }; then
		log "the installation is incomplete (an update stopped while unpacking) - the previous one comes back"
		roll_back
	elif [ -d "${USERDATA_BAK}/config" ] && [ "$(entries "${USERDATA_BAK}/config/data.json")" -gt 0 ] && [ "$(entries "${DATA}")" -eq 0 ]; then
		log "the library is empty, the backup of an update has $(entries "${USERDATA_BAK}/config/data.json") entries - the user data comes back"
		stop_apps
		if restore_userdata; then
			merge_cache
			sync
			# kept, under a name the update does not use (it would take an old backup for the one of its own run)
			mv "${USERDATA_BAK}" "${USERDATA_BAK}.restored-${STAMP}"
			log "user data restored"
		else
			log "the user data could not be restored completely - the backup stays in ${USERDATA_BAK}"
		fi
	fi
fi

sync
start_apps
exit 0
