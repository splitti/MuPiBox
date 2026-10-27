#!/bin/bash
#
# The display model (app: Einstellungen › Display & Bedienung › Display-Modell). Run as root by the app's server.
#
#   display_profile.sh apply <profile> <previous>   writes the model's lines into config.txt (a marked block, KMS on or
#                                                   off with DietPi's own tool), keeps the config.txt and the rotation
#                                                   of before and starts the test: the box is restarted by the caller
#   display_profile.sh boot                         at every start (mupi_startup.sh): a test that waits for its answer
#                                                   gets 3 minutes; a second start without one goes back at once
#   display_profile.sh confirm                      the picture is there (app or display): the model stays - only once
#                                                   the box has started with it
#   display_profile.sh revert                       back to the model, config.txt and rotation of before, restart
#   display_profile.sh timeout [<id>]               the 3 minutes are over: revert, unless it was confirmed meanwhile
#                                                   (a timer gives the test's id: it does nothing for a later test)
#
# A display on the ribbon cable (DSI) does not say what it is (no EDID as with HDMI): a wrong model leaves the display
# dark - so every change is a test that goes back by itself without an answer.
#
# The test file is written before anything is changed (state=prepare), set to state=ready once the change is complete
# and to state=reverting before the way back changes anything: a power cut in between leaves prepare or reverting, and
# the next start goes back at once; only ready (and started with it) can be confirmed. The copies of before are removed
# only once everything is back; a way back that fails keeps them and tries again a minute later.

set -u
CONFIG=/etc/mupibox/mupiboxconfig.json
CONFIG_LOCK=/tmp/.mupiboxconfig.lock
BOOT_CONFIG=/boot/config.txt
[ -f /boot/firmware/config.txt ] && BOOT_CONFIG=/boot/firmware/config.txt
STATE=/var/lib/mupibox/display-profile
TEST=${STATE}/test
BEFORE=${STATE}/config.txt.before
BEGIN='# >>> MuPiBox display model (app: Display & Bedienung > Display-Modell) - written by the app'
END='# <<< MuPiBox display model'
XROT=/etc/X11/xorg.conf.d/90-mupibox-rotate.conf
TOUCHROT=/etc/udev/rules.d/99-mupibox-touch-rotate.rules
REFLECT=/etc/X11/mupibox-reflect
TIMER_UNIT=mupibox-display-test
WAIT_S=180
RETRY_S=60

# The models: their overlay line (empty: the display of the firmware - the official 7" of the 1st generation, HDMI)
overlay_of() {
	case "$1" in
		official7) echo "" ;;
		td2-5) echo "vc4-kms-dsi-ili9881-5inch" ;;
		td2-7) echo "vc4-kms-dsi-ili9881-7inch" ;;
		td2-10) echo "vc4-kms-dsi-ili79600-10-1inch" ;;
		ws-5 | ws-43) echo "vc4-kms-dsi-7inch" ;;
		ws-v1-7_0_inchC | ws-v1-7_0_inchH | ws-v1-7_9_inch | ws-v1-8_0_inch | ws-v1-8_8_inch | ws-v1-10_1_inch | ws-v1-11_9_inch)
			echo "vc4-kms-dsi-waveshare-panel,${1#ws-v1-}" ;;
		ws-v2-7_0_inch_a | ws-v2-7_0_inch_b | ws-v2-7_0_inch_c | ws-v2-8_0_inch_a | ws-v2-8_8_inch_a | ws-v2-9_0_inch_b | ws-v2-10_1_inch_a | ws-v2-10_1_inch_b | ws-v2-12_3_inch_a_4lane)
			echo "vc4-kms-dsi-waveshare-panel-v2,${1#ws-v2-}" ;;
		edatec-7) echo "vc4-kms-dsi-edatec-panel-070c" ;;
		edatec-10) echo "vc4-kms-dsi-edatec-panel-101c" ;;
		*) return 1 ;;
	esac
}

log() { logger -t mupibox-display "$*"; echo "$*"; }

# $1 put in as $2: written next to it, on the card, then renamed (a power cut leaves the old file or the new one)
put_atomic() {
	cp "$1" "$2.mupibox-new" && sync "$2.mupibox-new" && mv -f "$2.mupibox-new" "$2" && sync "$(dirname "$2")"
}

# the test file: state ($1: prepare|ready|reverting), its id, the model, the one of before with its rotation and
# mirroring, the start with it ($2)
write_test() {
	printf 'state=%s\nid=%s\nprofile=%s\nprevious=%s\nprevious_rotation=%s\nprevious_mirror=%s\nbooted=%s\n' \
		"$1" "${TEST_ID}" "${PROFILE}" "${PREVIOUS}" "${PREV_ROT:-0}" "${PREV_MIRROR:-}" "${2:-}" > "${TEST}.new" \
		&& sync "${TEST}.new" && mv -f "${TEST}.new" "${TEST}" && sync "${STATE}"
}
test_value() { sed -n "s/^$1=//p" "${TEST}" 2>/dev/null; }
read_test() {
	TEST_ID=$(test_value id)
	PROFILE=$(test_value profile)
	PREVIOUS=$(test_value previous)
	PREV_ROT=$(test_value previous_rotation)
	PREV_MIRROR=$(test_value previous_mirror)
	BOOTED=$(test_value booted)
}

# the model ($1), its rotation in degrees ($2) and mirroring ($3: x, y or empty) in the settings - under the lock the
# server and the admin interface take for the file (read, changed and put back in one go: a setting saved meanwhile is
# not overwritten)
set_profile_in_config() {
	local rot="${2:-0}" mirror="${3:-}"
	case "${rot}" in 0 | 90 | 180 | 270) ;; *) rot=0 ;; esac
	case "${mirror}" in x | y) ;; *) mirror="" ;; esac
	[ -e "${CONFIG_LOCK}" ] || { : > "${CONFIG_LOCK}"; chmod 666 "${CONFIG_LOCK}"; }
	(
		flock -w 15 8 || exit 1
		tmp=$(mktemp /etc/mupibox/.cfg.XXXXXX) || exit 1
		if /usr/bin/jq --arg p "$1" --argjson r "${rot}" --arg m "${mirror}" \
			'.mupibox.displayProfile = $p | .mupibox.displayRotation = $r | if $m == "" then del(.mupibox.displayMirror) else .mupibox.displayMirror = $m end' \
			"${CONFIG}" > "${tmp}" && [ -s "${tmp}" ] &&
			chown --reference="${CONFIG}" "${tmp}" && chmod --reference="${CONFIG}" "${tmp}" && mv -f "${tmp}" "${CONFIG}"; then
			exit 0
		fi
		rm -f "${tmp}"
		exit 1
	) 8<"${CONFIG_LOCK}"
}

# no rotation or mirroring by the X server and no touch matrix (the official 7" turns with the firmware's settings; a
# new panel starts its own way up)
clear_rotation() {
	rm -f "${XROT}" "${TOUCHROT}" "${REFLECT}"
	udevadm control --reload 2>/dev/null
}

# the timers of the test (its 3 minutes, and tries again of a way back that failed). A timer that is not there (none
# after a restart) is no failure: systemctl says so with an error, and a successful way back counted as failed - the box
# then did not restart and stayed on the wrong model.
stop_timers() {
	systemctl stop "${TIMER_UNIT}.timer" "${TIMER_UNIT}-retry-*.timer" 2>/dev/null || true
}

# config.txt, the rotation and the settings of before back (PREVIOUS, PREV_ROT, PREV_MIRROR); the test is set to
# reverting first (no confirming a half way back). The copies and the test file are removed only when all of it
# worked - else they stay for the next try
restore_before() {
	local failed=0
	write_test reverting "${BOOTED:-}" || { log "display test: the way back could not be noted"; return 1; }
	if [ -s "${BEFORE}" ]; then
		put_atomic "${BEFORE}" "${BOOT_CONFIG}" || { log "display test: config.txt could not be put back"; return 1; }
	fi
	clear_rotation
	if [ -f "${STATE}/rot.xorg" ]; then
		{ mkdir -p "$(dirname "${XROT}")" && put_atomic "${STATE}/rot.xorg" "${XROT}"; } || failed=1
	fi
	if [ -f "${STATE}/rot.touch" ]; then
		put_atomic "${STATE}/rot.touch" "${TOUCHROT}" || failed=1
	fi
	if [ -f "${STATE}/rot.reflect" ]; then
		put_atomic "${STATE}/rot.reflect" "${REFLECT}" || failed=1
	fi
	udevadm control --reload 2>/dev/null
	set_profile_in_config "${PREVIOUS:-custom}" "${PREV_ROT:-0}" "${PREV_MIRROR:-}" || failed=1
	if [ "${failed}" != "0" ]; then
		log "display test: the rotation or the settings of before could not be put back - the copies stay"
		return 1
	fi
	rm -f "${TEST}" "${BEFORE}" "${STATE}"/rot.*
	sync "${STATE}"
	stop_timers
	return 0
}

# a way back that failed: tried again in a minute (a unit of its own - this one may be the timer's), for this test only
retry_later() {
	systemd-run --unit="${TIMER_UNIT}-retry-$(date +%s%N)" --on-active=${RETRY_S} --collect --quiet /bin/bash "$0" timeout "${TEST_ID}" 2>/dev/null
}

exec 9> /run/lock/mupibox-display-profile.lock
flock -w 60 9 || { echo "busy"; exit 1; }

case "${1:-}" in
	apply)
		PROFILE="${2:-}"
		PREVIOUS="${3:-custom}"
		OVERLAY=$(overlay_of "${PROFILE}") || { echo "unknown model: ${PROFILE}"; exit 2; }
		[ -e "${TEST}" ] && { echo "a test runs already - answer it first"; exit 3; }
		mkdir -p "${STATE}" || exit 1
		TEST_ID="$(date +%s)-$$"
		BOOTED=""
		# the copies of before (config.txt, the rotation), then the test file - all before the first change
		rm -f "${STATE}"/rot.* "${BEFORE}"
		fail_copies() { rm -f "${STATE}"/rot.* "${BEFORE}" "${TEST}.new"; echo "$1"; exit 1; }
		put_atomic "${BOOT_CONFIG}" "${BEFORE}" || fail_copies "config.txt could not be kept"
		if [ -f "${XROT}" ]; then put_atomic "${XROT}" "${STATE}/rot.xorg" || fail_copies "the rotation could not be kept"; fi
		if [ -f "${TOUCHROT}" ]; then put_atomic "${TOUCHROT}" "${STATE}/rot.touch" || fail_copies "the rotation could not be kept"; fi
		if [ -f "${REFLECT}" ]; then put_atomic "${REFLECT}" "${STATE}/rot.reflect" || fail_copies "the mirroring could not be kept"; fi
		PREV_ROT=$(/usr/bin/jq -r '.mupibox.displayRotation // 0' "${CONFIG}" 2>/dev/null)
		PREV_MIRROR=$(/usr/bin/jq -r '.mupibox.displayMirror // ""' "${CONFIG}" 2>/dev/null)
		write_test prepare || fail_copies "the test could not be noted"
		# from here on a failure puts back what was before (or tries it again a minute later)
		rollback() {
			log "display model ${PREVIOUS} -> ${PROFILE}: $1 - back to the model before"
			if ! restore_before; then
				log "display test: the way back failed - again in ${RETRY_S} s"
				retry_later
			fi
			exit 1
		}
		# KMS: DietPi's own switch (it writes or removes the vc4-kms-v3d line); the firmware's display: off
		if [ -n "${OVERLAY}" ]; then
			/boot/dietpi/func/dietpi-set_hardware rpi-opengl vc4-kms-v3d || rollback "KMS could not be switched on"
		else
			/boot/dietpi/func/dietpi-set_hardware rpi-opengl disable || rollback "KMS could not be switched off"
		fi
		# the block of the app, and display overlays outside it (written by hand before) - they would load a second panel
		NEW=$(mktemp "${BOOT_CONFIG}.XXXXXX") || rollback "no file for the new config.txt"
		awk -v b="${BEGIN}" -v e="${END}" '
			$0 == b { skip = 1; next }
			skip && $0 == e { skip = 0; next }
			skip { next }
			/^[[:space:]]*dtoverlay=vc4-kms-dsi-/ { next }
			{ print }
		' "${BOOT_CONFIG}" > "${NEW}" || { rm -f "${NEW}"; rollback "config.txt could not be read"; }
		if [ -n "${OVERLAY}" ]; then
			printf '%s\n[all]\ndtoverlay=%s\n%s\n' "${BEGIN}" "${OVERLAY}" "${END}" >> "${NEW}" || { rm -f "${NEW}"; rollback "config.txt could not be written"; }
		fi
		[ -s "${NEW}" ] || { rm -f "${NEW}"; rollback "config.txt came out empty"; }
		{ sync "${NEW}" && mv -f "${NEW}" "${BOOT_CONFIG}" && sync "$(dirname "${BOOT_CONFIG}")"; } || { rm -f "${NEW}"; rollback "config.txt could not be written"; }
		clear_rotation
		set_profile_in_config "${PROFILE}" 0 "" || rollback "the model could not be noted in the settings"
		write_test ready || rollback "the test could not be noted"
		log "display model ${PREVIOUS} -> ${PROFILE} (${OVERLAY:-firmware}): test after the restart"
		;;
	boot)
		[ -e "${TEST}" ] || exit 0
		if [ "$(test_value state)" != "ready" ]; then
			# the change or the way back was cut off (power cut while it was written): back at once
			log "display test: the change of the model was not complete - back to the model before"
			exec "$0" revert
		fi
		if grep -q '^booted=[0-9]' "${TEST}"; then
			# started a second time without an answer (switched off meanwhile, or restarted): back at once
			log "display test: a second start without an answer - back to the model before"
			exec "$0" revert
		fi
		read_test
		write_test ready "$(date +%s)" || { log "display test: the start could not be noted - back to the model before"; exec "$0" revert; }
		stop_timers
		systemd-run --unit=${TIMER_UNIT} --on-active=${WAIT_S} --collect --quiet /bin/bash "$0" timeout "${TEST_ID}"
		log "display test: ${WAIT_S} s for an answer"
		;;
	confirm)
		[ -e "${TEST}" ] || exit 0
		# only for a picture of the new model: after the start with it (before, the old display still shows one), and
		# not while it goes back
		if [ "$(test_value state)" != "ready" ] || ! grep -q '^booted=[0-9]' "${TEST}"; then
			echo "the box has not started with the new model yet, or goes back"
			exit 4
		fi
		stop_timers
		rm -f "${TEST}" "${BEFORE}" "${STATE}"/rot.*
		sync "${STATE}"
		log "display test: confirmed, the model stays"
		;;
	timeout | revert)
		[ -e "${TEST}" ] || exit 0
		read_test
		# (a timer of an earlier test: not this one's business)
		if [ "$1" = "timeout" ] && [ -n "${2:-}" ] && [ "$2" != "${TEST_ID}" ]; then
			exit 0
		fi
		systemctl stop ${TIMER_UNIT}.timer 2>/dev/null
		if ! restore_before; then
			# (no restart: a box that starts again on the half way back would only try once more and restart again)
			log "display test: the way back failed - again in ${RETRY_S} s"
			retry_later
			exit 1
		fi
		log "display test: no picture confirmed - back to ${PREVIOUS}, the box restarts"
		systemctl reboot
		;;
	*)
		echo "usage: $0 apply <profile> <previous> | boot | confirm | revert | timeout [<id>]"
		exit 2
		;;
esac
