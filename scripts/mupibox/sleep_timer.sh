#!/bin/bash
#
# The box's power-off timer ("Schlaftimer"): ONE per box, whoever sets it - the app, the old admin interface,
# Telegram and Home Assistant all call this script (as root, sudo). It switches the whole box off: the last FADE
# seconds the volume goes down step by step, then playback is stopped, the volume set back for the next start (the
# sound card keeps it over the shutdown) and the box shut down.
#
#   sleep_timer.sh start <seconds>   start it (1..86400); a timer that runs is replaced
#   sleep_timer.sh stop              stop it - also when none runs
#   sleep_timer.sh status            {"active":..,"ends_at":..,"deadline":..,"remaining_s":..,"phase":..}
#   sleep_timer.sh <seconds>         as "start" (the way it was called before)
#   sleep_timer.sh run <id>          the countdown itself: started by "start" as the systemd unit mupi-sleep-timer
#
# Exit codes: 0 done (the status follows on stdout), 2 wrong use, 3 the box is shutting down already (the timer ran
# out - nothing changed), 4 the timer could not be started or stopped (the status follows).
#
# Before, every caller started its own "nohup sleep_timer.sh" and stopped with "pkill -f": Telegram did not stop the
# one before, so two countdowns could each shut the box down, and /tmp/.time2sleep stayed behind when a countdown
# ended - its being there said "a timer runs" when none did. Now:
#  - The deadline is kept in STATE (/run/mupibox/sleep_timer.json, read by the app's server): when it runs out, its
#    id and its phase. /run is empty after a start of the box - a timer never fires again after it.
#  - The countdown runs as the transient systemd unit mupi-sleep-timer (systemd-run): there is only one by its name,
#    it goes on when the app's server restarts, and it is started again when it fails (it then goes on to the same
#    deadline; one that passed meanwhile shuts the box down at once).
#  - start, stop and the countdown's last step take the same lock: a start or a stop waits until the old countdown
#    has ended (its volume set back) and only then says done - an old countdown can never switch the box off later.
#    Once the countdown has begun the shutdown (phase "shutdown") nothing stops it any more, and nothing says so.
#  - /tmp/.time2sleep (the seconds left) is still written for anything that reads it, and removed when it ends.
#
# For tests (never a real shutdown): UNIT, STATE_DIR, COMPAT_FILE, POWEROFF_CMD, VOLUME_FILE (a file standing in for
# the mixer), PLAYER_STOP_URL (empty: none), FADE.

UNIT="${UNIT:-mupi-sleep-timer}"
STATE_DIR="${STATE_DIR:-/run/mupibox}"
STATE="${STATE_DIR}/sleep_timer.json"
LOCK="${STATE_DIR}/sleep_timer.lock"
COMPAT_FILE="${COMPAT_FILE:-/tmp/.time2sleep}"
POWEROFF_CMD="${POWEROFF_CMD:-poweroff}"
PLAYER_STOP_URL="${PLAYER_STOP_URL-http://127.0.0.1:5005/current/stop}"
FADE="${FADE:-20}"
MAX_SECONDS=86400
JQ=/usr/bin/jq
SELF="$(readlink -f "$0")"

log() { echo "$(date '+%d.%m.%Y %H:%M:%S') [sleep_timer] $*" >&2; }

# --- the volume as the player sets it (amixer Master of the user it runs as) - or a file in tests
get_volume() {
	if [ -n "${VOLUME_FILE:-}" ]; then
		cat "${VOLUME_FILE}" 2>/dev/null
	else
		sudo -u dietpi /usr/bin/amixer sget Master | grep -m1 'Right:' | sed -n 's/.*\[\([0-9]*\)%\].*/\1/p'
	fi
}
set_volume() {
	if [ -n "${VOLUME_FILE:-}" ]; then
		echo "$1" > "${VOLUME_FILE}"
	else
		sudo -u dietpi /usr/bin/amixer -q sset Master "$1%"
	fi
}

# --- the kept state
field() { [ -f "${STATE}" ] && ${JQ} -r ".$1 // empty" "${STATE}" 2>/dev/null; }
write_state() { # id deadline seconds phase [fade_from]
	local tmp="${STATE}.$$" ends
	ends=$(date -d "@$2" '+%Y-%m-%dT%H:%M:%S%:z')
	${JQ} -n --arg id "$1" --argjson deadline "$2" --argjson seconds "$3" --arg phase "$4" --arg ends "${ends}" \
		--arg fade "${5:-}" \
		'{id:$id, deadline:$deadline, seconds:$seconds, ends_at:$ends, phase:$phase} + (if $fade == "" then {} else {fade_from:($fade|tonumber)} end)' \
		> "${tmp}" 2>/dev/null && [ -s "${tmp}" ] && chmod 644 "${tmp}" && mv -f "${tmp}" "${STATE}" || { rm -f "${tmp}"; return 1; }
}
set_field() { # key json-value (under the lock or by the countdown that owns the state)
	local tmp="${STATE}.$$"
	${JQ} ".$1 = $2" "${STATE}" > "${tmp}" 2>/dev/null && [ -s "${tmp}" ] && chmod 644 "${tmp}" && mv -f "${tmp}" "${STATE}" || { rm -f "${tmp}"; return 1; }
}

unit_running() { case "$(systemctl is-active "${UNIT}" 2>/dev/null)" in active|activating|reloading) return 0 ;; esac; return 1; }

status() {
	local now deadline phase ends rem active=false
	now=$(date +%s)
	deadline=$(field deadline)
	phase=$(field phase)
	ends=$(field ends_at)
	if [ -n "${deadline}" ] && { [ "${phase}" = shutdown ] || unit_running; }; then
		active=true
		rem=$(( deadline - now )); (( rem < 0 )) && rem=0
	fi
	if [ "${active}" = true ]; then
		printf '{"active":true,"ends_at":"%s","deadline":%s,"remaining_s":%s,"phase":"%s"}\n' "${ends}" "${deadline}" "${rem}" "${phase}"
	else
		printf '{"active":false,"ends_at":null,"deadline":null,"remaining_s":0,"phase":null}\n'
	fi
}

lock() { mkdir -p "${STATE_DIR}" && exec 9>"${LOCK}" && flock -w 60 9; }

# the countdown that runs ended (its trap sets the volume back) - true when none runs afterwards
end_countdown() {
	systemctl stop "${UNIT}" >/dev/null 2>&1
	systemctl reset-failed "${UNIT}" >/dev/null 2>&1
	! unit_running
}

start() {
	local secs=$1 id now deadline
	if ! [[ "${secs}" =~ ^[0-9]{1,6}$ ]] || (( 10#${secs} < 1 || 10#${secs} > MAX_SECONDS )); then
		echo "seconds: 1 to ${MAX_SECONDS}" >&2; exit 2
	fi
	secs=$((10#${secs}))
	lock || { log "start: no lock"; status; exit 4; }
	[ "$(field phase)" = shutdown ] && { log "start refused: the box is shutting down"; status; exit 3; }
	end_countdown || { log "start: the running countdown did not end"; status; exit 4; }
	id="$(date +%s%N)-$$"
	now=$(date +%s)
	deadline=$((now + secs))
	write_state "${id}" "${deadline}" "${secs}" running || { log "start: state not written"; status; exit 4; }
	local env=()
	for v in STATE_DIR COMPAT_FILE POWEROFF_CMD VOLUME_FILE PLAYER_STOP_URL FADE UNIT; do
		[ -n "${!v+x}" ] && env+=(--setenv="${v}=${!v}")
	done
	if ! systemd-run --quiet --collect --unit="${UNIT}" --description="MuPiBox power-off timer" \
		-p Restart=on-failure -p RestartSec=2 "${env[@]}" "${SELF}" run "${id}" >/dev/null 2>&1 || ! unit_running; then
		rm -f "${STATE}"
		log "start: the countdown could not be started"
		status; exit 4
	fi
	log "started: ${secs} s, ends $(field ends_at)"
	status
}

stop() {
	lock || { log "stop: no lock"; status; exit 4; }
	[ "$(field phase)" = shutdown ] && { log "stop refused: the box is shutting down"; status; exit 3; }
	end_countdown || { log "stop: the countdown did not end"; status; exit 4; }
	rm -f "${STATE}" "${COMPAT_FILE}"
	log "stopped"
	status
}

# --- the countdown (systemd unit; also when started again after a failure)
run() {
	local id=$1 deadline secs fade_from="" now rem span
	restore() { [ -n "${fade_from}" ] && set_volume "${fade_from}"; rm -f "${COMPAT_FILE}"; }
	# stopped or replaced (start/stop end the unit): the volume back as it was
	trap 'restore; exit 0' TERM INT
	while true; do
		# (replaced or stopped meanwhile: not this countdown's any more)
		[ "$(field id)" = "${id}" ] || { restore; exit 0; }
		[ "$(field phase)" = shutdown ] && exit 0
		deadline=$(field deadline)
		secs=$(field seconds)
		[ -z "${fade_from}" ] && fade_from=$(field fade_from)
		now=$(date +%s)
		rem=$(( deadline - now ))
		echo $(( rem < 0 ? 0 : rem )) > "${COMPAT_FILE}"
		if (( rem <= FADE )); then
			# the volume the fade starts from, kept in the state: started again in the middle of the fade (after a
			# failure) the countdown would take the lowered volume for the one to set back
			if [ -z "${fade_from}" ]; then
				fade_from=$(get_volume)
				[ -n "${fade_from}" ] && set_field fade_from "${fade_from}"
			fi
			if [ -n "${fade_from}" ] && (( rem >= 0 )); then
				span=$(( secs < FADE ? secs : FADE )); (( span < 1 )) && span=1
				set_volume "$(( fade_from * rem / span ))"
			fi
		fi
		(( rem <= 0 )) && break
		sleep 1 &
		wait $!
	done
	# The last step under the lock: a stop or start that came first has ended this countdown; one that comes now finds
	# "shutdown" and changes nothing.
	lock || exit 1
	[ "$(field id)" = "${id}" ] || { restore; exit 0; }
	set_field phase '"shutdown"' || { flock -u 9; exit 1; }
	flock -u 9
	trap '' TERM INT
	log "ran out: stopping playback, shutting down"
	[ -n "${PLAYER_STOP_URL}" ] && curl -s -m 3 -o /dev/null "${PLAYER_STOP_URL}"
	sleep 1
	[ -n "${fade_from}" ] && set_volume "${fade_from}"
	rm -f "${COMPAT_FILE}"
	if ! ${POWEROFF_CMD}; then
		# (not shut down: the timer is over all the same - it does not try again, and a new one can be set)
		log "shutdown failed"
		rm -f "${STATE}"
		exit 0
	fi
	exit 0
}

case "${1:-}" in
	start) start "${2:-}" ;;
	stop) stop ;;
	status) status ;;
	run) [ -n "${2:-}" ] || exit 2; run "$2" ;;
	''|-h|--help) sed -n '2,15p' "$0"; exit 2 ;;
	*) start "$1" ;;
esac
