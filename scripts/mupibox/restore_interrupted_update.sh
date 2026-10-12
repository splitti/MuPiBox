#!/bin/bash
#
# After an update that did not get to its end - the power cut or the box switched off while it ran. The update copies
# the user data (library, resume points, covers ...) to userdata.upd-bak, moves the old installation aside to
# Sonos-Kids-Controller-master.upd-bak, unpacks the new one and only then brings the data back
# (update/start_mupibox_update.sh, "Backup Userdata" / "Restore Userdata"). Stopped in between, the box started with an
# empty library - or, cut off while unpacking, with a broken installation - and the data waited in the backup until
# someone fetched it by hand. And an update started again then saved the empty library and used that.
#
# Run at the box's start (mupi_startup.sh) and at the beginning of every update (before its own backup):
#   1. the installation is incomplete (no server.js or www/index.html) and the old one is still there: the old one comes
#      back, with its data (the incomplete one is kept as .broken-<time>)
#   2. the library is empty or unreadable, the backup of an update holds one: the user data comes back from the backup
#      (as "Restore Userdata" does it); the backup is kept as userdata.upd-bak.restored-<time>, never deleted here
# Anything else: nothing is done. Runs as root.
#   --no-restart   the app's server is not restarted afterwards (the update stops and starts it itself)
# SKC / USERDATA_BAK for a test on copies.

SKC="${SKC:-/home/dietpi/.mupibox/Sonos-Kids-Controller-master}"
OLD="${SKC}.upd-bak"
USERDATA_BAK="${USERDATA_BAK:-/home/dietpi/.mupibox/userdata.upd-bak}"
JQ=/usr/bin/jq
[ -x "${JQ}" ] || JQ=jq
RESTART=1
[ "${1:-}" = "--no-restart" ] && RESTART=0
STAMP=$(date +%Y%m%d-%H%M%S)
CHANGED=0

log() { echo "restore_interrupted_update: $*"; }

# entries of a library file: 0 for a missing, unreadable or empty one
entries() {
	[ -s "$1" ] || { echo 0; return; }
	"${JQ}" 'if type == "array" then length else 0 end' "$1" 2>/dev/null | head -n 1 | grep -E '^[0-9]+$' || echo 0
}

# 1. an installation cut off while it was unpacked: the old one back
if [ -d "${OLD}" ] && [ -s "${OLD}/server.js" ] && { [ ! -s "${SKC}/server.js" ] || [ ! -s "${SKC}/www/index.html" ]; }; then
	log "the installation is incomplete (an update stopped while unpacking) - the previous one comes back"
	[ -e "${SKC}" ] && mv "${SKC}" "${SKC}.broken-${STAMP}"
	if mv "${OLD}" "${SKC}"; then
		CHANGED=1
	else
		log "could not move the previous installation back"
	fi
fi

# 2. the library empty, the backup of an update has one: the user data back
DATA="${SKC}/server/config/data.json"
BACKUP_DATA="${USERDATA_BAK}/config/data.json"
if [ -d "${USERDATA_BAK}/config" ] && [ "$(entries "${BACKUP_DATA}")" -gt 0 ] && [ "$(entries "${DATA}")" -eq 0 ]; then
	log "the library is empty, the backup of an update holds $(entries "${BACKUP_DATA}") entries - the user data comes back"
	ok=1
	mkdir -p "${SKC}/server/config" "${SKC}/www" || ok=0
	# (as "Restore Userdata": not what the installation brings itself, nor the links the box makes anew)
	for item in "${USERDATA_BAK}"/config/* "${USERDATA_BAK}"/config/.[!.]*; do
		[ -e "${item}" ] || continue
		name=$(basename "${item}")
		case "${name}" in
			config.json | monitor.json | active_data.json | active_resume.json | network.json) continue ;;
		esac
		[ -L "${item}" ] && continue
		rm -rf "${SKC}/server/config/${name}"
		cp -a "${item}" "${SKC}/server/config/${name}" || ok=0
	done
	for item in cover active_theme.css rss-covers; do
		[ -e "${USERDATA_BAK}/www/${item}" ] || continue
		rm -rf "${SKC}/www/${item}"
		cp -a "${USERDATA_BAK}/www/${item}" "${SKC}/www/${item}" || ok=0
	done
	if [ -d "${USERDATA_BAK}/www/theme-data" ]; then
		mkdir -p "${SKC}/www/theme-data" && cp -an "${USERDATA_BAK}/www/theme-data/." "${SKC}/www/theme-data/" || ok=0
	fi
	chown -R dietpi:dietpi "${SKC}/server/config" 2>/dev/null
	if [ "${ok}" = 1 ] && [ "$(entries "${DATA}")" -gt 0 ]; then
		# kept, under a name the update does not use (it would take an old backup for the one of its own run)
		mv "${USERDATA_BAK}" "${USERDATA_BAK}.restored-${STAMP}"
		log "user data restored"
	else
		log "the user data could not be restored completely - the backup stays in ${USERDATA_BAK}"
	fi
	CHANGED=1
fi

if [ "${CHANGED}" = 1 ] && [ "${RESTART}" = 1 ]; then
	sync
	# (only when pm2 runs it already: at an early start it reads the restored files itself)
	sudo -H -u dietpi bash -c 'pm2 describe server >/dev/null 2>&1 && pm2 restart server >/dev/null 2>&1'
fi
exit 0
