#!/bin/bash
#
# After an update that did not get to its end - the power cut or the box switched off while it ran. The update copies
# the user data (library, resume points, covers ...) to userdata.upd-bak, moves the old installation aside to
# Sonos-Kids-Controller-master.upd-bak (moved, not copied: its data stays in it as it was), unpacks the new one, sets
# it up and brings the data back (update/start_mupibox_update.sh). Stopped in between, the box started with an empty
# library - or, cut off while unpacking, with a broken installation.
#
# The update marks it (update-state, written next to it, checked, on the card before it goes on):
#   unpacking   from before it moves the old installation aside until everything is installed, set up and back
#   done        the update got to its end - written before it clears up (the old installation, the backup)
#   rollback    written here, before going back (below)
# Found here: "done" - only what is left over goes, nothing goes back. "rollback" - the way back goes on where it
# stopped. Anything else (an empty mark too) - the one way back that is always whole: the old installation comes back,
# with its own data as it was before the update, and its player (the new one is kept as .broken, the backup as
# userdata.upd-bak.kept-<time>). The update can then simply be run again. Nothing is put together from halves: an
# installation half set up, user data half brought back. The mark goes only when the way back is complete.
#
# Updates before this mark existed (no mark, an old installation left aside): it comes back when the new one lacks
# server.js or index.html; the user data comes back from the backup when the library is empty and the backup has one.
#
# Run by mupi_update_recover.service at every start - before pm2 starts the app's server and the player and before
# the network check (check_network.sh writes an empty library where it finds none) - and at the beginning of every
# update, before its own backup: an update that stopped before is undone first. While the installation is exchanged
# or files are put back nothing else writes the library or the resume list: the app's server and the player stopped,
# cron held (get_network.sh), the scripts that write them waited for, the shared locks (/tmp/.data.lock,
# /tmp/.resume.lock) taken as the backend takes them. Exit 1 when it could not be undone or
# finished: the update then stops before it touches anything. The app's server and the player are stopped first when
# they run (and started again after). Runs as root.
#   --no-restart   kept for the callers of before; the apps are only started again when this script stopped them
# SKC / USERDATA_BAK / UPDATE_STATE / PLAYER_DIR / LOCK_DIR for a test on copies, NO_PM2=1 leaves the running apps
# and cron alone (NO_CRON=0 holds cron all the same), TEST_PAUSE=<s> waits there between the two moves.

SKC="${SKC:-/home/dietpi/.mupibox/Sonos-Kids-Controller-master}"
OLD="${SKC}.upd-bak"
USERDATA_BAK="${USERDATA_BAK:-/home/dietpi/.mupibox/userdata.upd-bak}"
UPDATE_STATE="${UPDATE_STATE:-/home/dietpi/.mupibox/update-state}"
PLAYER_DIR="${PLAYER_DIR:-/home/dietpi/.mupibox/spotifycontroller-main}"
JQ=/usr/bin/jq
[ -x "${JQ}" ] || JQ=jq
STAMP=$(date +%Y%m%d-%H%M%S)
BROKEN="${SKC}.broken"
STATE=""
STOPPED=0
RESULT=0
# the locks the library and the resume list share with the backend and the shell scripts (see backend-api
# file-lock.ts): created without overwriting, "<pid> <token>" inside, touched while held, only our own removed
LOCK_DIR="${LOCK_DIR:-/tmp}"
DATA_LOCK="${LOCK_DIR}/.data.lock"
RESUME_LOCK="${LOCK_DIR}/.resume.lock"
LOCK_TOKEN="restore-${STAMP}"
LOCKED=0
TOUCHER=""
CRON_STOPPED=0

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

# A lock that may be taken over, as the backend decides it (file-lock.ts staleReason): gone, its holder's process no
# longer runs (or did not touch it for 10 min), or an empty one of a script not touched for 30 s
lock_stale() {
	local content age pid
	[ -e "$1" ] || return 0
	content=$(cat "$1" 2>/dev/null)
	age=$(( $(date +%s) - $(stat -c %Y "$1" 2>/dev/null || date +%s) ))
	pid=$(printf '%s' "${content}" | sed -nE 's/^([0-9]+) [^ ]+$/\1/p')
	if [ -n "${pid}" ]; then
		kill -0 "${pid}" 2>/dev/null || return 0
		[ "${age}" -gt 600 ]
		return
	fi
	[ "${age}" -gt 30 ]
}
take_lock() {
	local i
	for i in $(seq 1 120); do
		if ( set -C; printf '%s %s\n' "$$" "${LOCK_TOKEN}" > "$1" ) 2>/dev/null; then
			# (the backend runs as dietpi: it has to be able to read it and, should this script die, take it over)
			chown dietpi:dietpi "$1" 2>/dev/null
			return 0
		fi
		lock_stale "$1" && rm -f "$1"
		sleep 0.5
	done
	return 1
}
own_lock() { [ "$(cat "$1" 2>/dev/null)" = "$$ ${LOCK_TOKEN}" ]; }

# Nothing else writes the library or the resume list while the installation is exchanged or files are put back: cron
# (get_network.sh writes an empty library where it finds none) held, the scripts that write them waited for, and the
# shared locks taken - held, and taken again should a script that began before remove them, until all of it is done
quiet_writers() {
	[ "${LOCKED}" = 1 ] && return 0
	if [ "${NO_CRON:-${NO_PM2:-0}}" != 1 ] && systemctl is-active --quiet cron 2>/dev/null; then
		systemctl stop cron && CRON_STOPPED=1
	fi
	local i
	for i in $(seq 1 60); do
		pgrep -f 'mupibox/(\./)?(get_network|m3u_generator|add_index)\.sh' >/dev/null 2>&1 || break
		sleep 0.5
	done
	take_lock "${DATA_LOCK}" && take_lock "${RESUME_LOCK}" || { log "the library is locked by another program - try again later"; release_writers; return 1; }
	LOCKED=1
	# The helper keeps the locks while this script lives - and only then: should the script be killed outright (its
	# EXIT trap does not run then), the helper notices within a second, removes the locks that are ours, starts cron
	# again when it was held here, and ends. Otherwise the library scans (m3u_generator.sh, add_index.sh) would stop at
	# "Data-file locked." until the next start of the box.
	local main=$$ cron_held=${CRON_STOPPED}
	(
		while kill -0 "${main}" 2>/dev/null; do
			sleep 1
			kill -0 "${main}" 2>/dev/null || break
			for l in "${DATA_LOCK}" "${RESUME_LOCK}"; do
				if own_lock "${l}"; then touch "${l}"; else ( set -C; printf '%s %s\n' "${main}" "${LOCK_TOKEN}" > "${l}" ) 2>/dev/null; fi
			done
		done
		for l in "${DATA_LOCK}" "${RESUME_LOCK}"; do
			own_lock "${l}" && rm -f "${l}"
		done
		[ "${cron_held}" = 1 ] && systemctl start cron
	) &
	TOUCHER=$!
	return 0
}
release_writers() {
	[ -n "${TOUCHER}" ] && kill "${TOUCHER}" 2>/dev/null && wait "${TOUCHER}" 2>/dev/null
	TOUCHER=""
	for l in "${DATA_LOCK}" "${RESUME_LOCK}"; do
		own_lock "${l}" && rm -f "${l}"
	done
	LOCKED=0
	[ "${CRON_STOPPED}" = 1 ] && systemctl start cron
	CRON_STOPPED=0
}
trap release_writers EXIT

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

# the mark written as the update writes it: next to it, checked, on the card (1 when any of it failed)
write_state() {
	local next="${UPDATE_STATE}.new"
	rm -f "${next}"
	if printf '%s\n' "$1" > "${next}" && [ "$(head -n 1 "${next}" 2>/dev/null)" = "$1" ] \
		&& { sync "${next}" 2>/dev/null || sync; } && mv -f "${next}" "${UPDATE_STATE}" && sync; then
		return 0
	fi
	rm -f "${next}"
	return 1
}
clear_state() {
	rm -f "${UPDATE_STATE}" "${UPDATE_STATE}.new"
	sync
}

# The old installation back in place of the new one. Marked "rollback" first: stopped anywhere in between (a power
# cut again), the next run takes it up where it stopped - the new installation aside (as .broken), the old one back
# (once that is done there is no .upd-bak any more: with "rollback" that means it is in place), its player. The mark
# goes only when all of it is done. 0 when it is.
roll_back() {
	if [ "${STATE}" != "rollback" ]; then
		write_state rollback || { log "could not write the mark for the way back (card full?)"; return 1; }
	fi
	stop_apps
	quiet_writers || return 1
	if [ -d "${OLD}" ]; then
		if [ -e "${SKC}" ]; then
			# (one of an earlier way back keeps its place under a dated name)
			[ -e "${BROKEN}" ] && { mv "${BROKEN}" "${BROKEN}-${STAMP}" || return 1; }
			mv "${SKC}" "${BROKEN}" || { log "could not move the new installation aside"; return 1; }
		fi
		[ -n "${TEST_PAUSE:-}" ] && sleep "${TEST_PAUSE}"
		mv "${OLD}" "${SKC}" || { log "could not move the previous installation back"; return 1; }
		sync
	elif [ ! -s "${SKC}/server.js" ]; then
		log "neither the previous installation nor one in place - nothing to go back to"
		return 1
	fi
	# its player (the update copies the new one there): has to be in place too, or the way back is not done
	if [ -s "${SKC}/spotify-control.js" ] && [ -d "${PLAYER_DIR}" ]; then
		if ! cmp -s "${SKC}/spotify-control.js" "${PLAYER_DIR}/spotify-control.js"; then
			cp "${SKC}/spotify-control.js" "${PLAYER_DIR}/spotify-control.js.mupibox-restore" \
				&& { sync "${PLAYER_DIR}/spotify-control.js.mupibox-restore" 2>/dev/null || sync; } \
				&& mv -f "${PLAYER_DIR}/spotify-control.js.mupibox-restore" "${PLAYER_DIR}/spotify-control.js" \
				|| { rm -f "${PLAYER_DIR}/spotify-control.js.mupibox-restore"; log "could not put the previous player back (card full?)"; return 1; }
		fi
	fi
	# the update's backup: kept, under a name an update does not take for its own
	if [ -d "${USERDATA_BAK}" ]; then
		mv "${USERDATA_BAK}" "${USERDATA_BAK}.kept-${STAMP}" || return 1
	fi
	chown -R dietpi:dietpi "${SKC}" 2>/dev/null
	sync
	clear_state
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

# The update keeps services from starting while it installs Samba, FTP and VNC (a policy-rc.d of its own): left behind
# by an update that stopped there, it kept every service of every package installed later from starting
if [ -z "${SKIP_POLICY_RC:-}" ] && grep -qs "written by the MuPiBox update" /usr/sbin/policy-rc.d; then
	rm -f /usr/sbin/policy-rc.d && log "removed the policy-rc.d an update left behind"
fi

if [ -e "${UPDATE_STATE}" ]; then
	STATE=$(head -n 1 "${UPDATE_STATE}" 2>/dev/null | tr -d '[:space:]')
	case "${STATE}" in
		done)
			# the update got to its end; stopped while it cleared up: only what is left over goes, nothing goes back
			log "an update finished, clearing up what it left"
			rm -rf "${USERDATA_BAK}" "${OLD}" && clear_state || RESULT=1
			;;
		rollback)
			log "a way back to the previous installation stopped halfway - it goes on"
			roll_back || RESULT=1
			;;
		*)
			# stopped between moving the old installation aside and its end (an empty mark too: it was written before
			# anything was touched)
			if [ -d "${OLD}" ]; then
				log "an update stopped halfway - the previous installation comes back"
				roll_back || RESULT=1
			else
				# (moving it aside is one rename: without it the update stopped before - the old one is untouched)
				log "an update stopped before it moved the installation aside - nothing to undo"
				clear_state
			fi
			;;
	esac
elif [ -d "${OLD}" ] && [ -s "${OLD}/server.js" ] && { [ ! -s "${SKC}/server.js" ] || [ ! -s "${SKC}/www/index.html" ]; }; then
	log "the installation is incomplete (an update stopped while unpacking) - the previous one comes back"
	STATE=""
	roll_back || RESULT=1
elif [ -d "${USERDATA_BAK}/config" ] && [ "$(entries "${USERDATA_BAK}/config/data.json")" -gt 0 ] && [ "$(entries "${SKC}/server/config/data.json")" -eq 0 ]; then
	log "the library is empty, the backup of an update has $(entries "${USERDATA_BAK}/config/data.json") entries - the user data comes back"
	stop_apps
	if quiet_writers && restore_userdata; then
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
release_writers
start_apps
exit ${RESULT}
