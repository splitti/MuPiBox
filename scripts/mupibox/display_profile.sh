#!/bin/bash
#
# The display model (app: Einstellungen › Display & Bedienung › Display-Modell). Run as root by the app's server.
#
#   display_profile.sh apply <profile> <previous>   writes the model's lines into config.txt (a marked block, KMS on or
#                                                   off with DietPi's own tool), keeps the config.txt and the rotation
#                                                   of before and starts the test: the box is restarted by the caller
#   display_profile.sh boot                         at every start (mupi_startup.sh): a test that waits for its answer
#                                                   gets 3 minutes; a second start without one goes back at once
#   display_profile.sh confirm                      the picture is there (app or display): the model stays
#   display_profile.sh revert                       back to the model, config.txt and rotation of before, restart
#   display_profile.sh timeout                      the 3 minutes are over: revert, unless it was confirmed meanwhile
#
# A display on the ribbon cable (DSI) does not say what it is (no EDID as with HDMI): a wrong model leaves the display
# dark - so every change is a test that goes back by itself without an answer.

set -u
CONFIG=/etc/mupibox/mupiboxconfig.json
BOOT_CONFIG=/boot/config.txt
[ -f /boot/firmware/config.txt ] && BOOT_CONFIG=/boot/firmware/config.txt
STATE=/var/lib/mupibox/display-profile
TEST=${STATE}/test
BEFORE=${STATE}/config.txt.before
BEGIN='# >>> MuPiBox display model (app: Display & Bedienung > Display-Modell) - written by the app'
END='# <<< MuPiBox display model'
XROT=/etc/X11/xorg.conf.d/90-mupibox-rotate.conf
TOUCHROT=/etc/udev/rules.d/99-mupibox-touch-rotate.rules
TIMER_UNIT=mupibox-display-test
WAIT_S=180

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

# the model ($1) and its rotation in degrees ($2) in the settings
set_profile_in_config() {
	local tmp rot="${2:-0}"
	case "${rot}" in 0 | 90 | 180 | 270) ;; *) rot=0 ;; esac
	tmp=$(mktemp /etc/mupibox/.cfg.XXXXXX) || return 1
	if /usr/bin/jq --arg p "$1" --argjson r "${rot}" '.mupibox.displayProfile = $p | .mupibox.displayRotation = $r' "${CONFIG}" > "${tmp}" && [ -s "${tmp}" ]; then
		chown --reference="${CONFIG}" "${tmp}" && chmod --reference="${CONFIG}" "${tmp}" && mv -f "${tmp}" "${CONFIG}"
	else
		rm -f "${tmp}"
		return 1
	fi
}

# no rotation by the X server and no touch matrix (the official 7" turns with the firmware's settings; a new panel
# starts its own way up)
clear_rotation() {
	rm -f "${XROT}" "${TOUCHROT}"
	udevadm control --reload 2>/dev/null
}

exec 9> /run/lock/mupibox-display-profile.lock
flock -w 60 9 || { echo "busy"; exit 1; }

case "${1:-}" in
	apply)
		PROFILE="${2:-}"
		PREVIOUS="${3:-custom}"
		OVERLAY=$(overlay_of "${PROFILE}") || { echo "unknown model: ${PROFILE}"; exit 2; }
		[ -e "${TEST}" ] && { echo "a test runs already - answer it first"; exit 3; }
		mkdir -p "${STATE}"
		put_atomic "${BOOT_CONFIG}" "${BEFORE}" || { echo "config.txt could not be kept"; exit 1; }
		# the rotation of before, for the way back
		rm -f "${STATE}"/rot.*
		[ -f "${XROT}" ] && cp -p "${XROT}" "${STATE}/rot.xorg"
		[ -f "${TOUCHROT}" ] && cp -p "${TOUCHROT}" "${STATE}/rot.touch"
		PREV_ROT=$(/usr/bin/jq -r '.mupibox.displayRotation // 0' "${CONFIG}" 2>/dev/null)
		# KMS: DietPi's own switch (it writes or removes the vc4-kms-v3d line); the firmware's display: off
		if [ -n "${OVERLAY}" ]; then
			/boot/dietpi/func/dietpi-set_hardware rpi-opengl vc4-kms-v3d || { echo "KMS could not be switched on"; exit 1; }
		else
			/boot/dietpi/func/dietpi-set_hardware rpi-opengl disable || { echo "KMS could not be switched off"; exit 1; }
		fi
		# the block of the app, and display overlays outside it (written by hand before) - they would load a second panel
		NEW=$(mktemp "${BOOT_CONFIG}.XXXXXX") || exit 1
		awk -v b="${BEGIN}" -v e="${END}" '
			$0 == b { skip = 1; next }
			skip && $0 == e { skip = 0; next }
			skip { next }
			/^[[:space:]]*dtoverlay=vc4-kms-dsi-/ { next }
			{ print }
		' "${BOOT_CONFIG}" > "${NEW}" || { rm -f "${NEW}"; exit 1; }
		if [ -n "${OVERLAY}" ]; then
			printf '%s\n[all]\ndtoverlay=%s\n%s\n' "${BEGIN}" "${OVERLAY}" "${END}" >> "${NEW}"
		fi
		[ -s "${NEW}" ] || { rm -f "${NEW}"; echo "config.txt came out empty - not written"; exit 1; }
		{ sync "${NEW}" && mv -f "${NEW}" "${BOOT_CONFIG}" && sync "$(dirname "${BOOT_CONFIG}")"; } || exit 1
		clear_rotation
		set_profile_in_config "${PROFILE}" 0 || log "the model could not be noted in the settings"
		printf 'profile=%s\nprevious=%s\nprevious_rotation=%s\nbooted=\n' "${PROFILE}" "${PREVIOUS}" "${PREV_ROT:-0}" > "${TEST}.new" \
			&& sync "${TEST}.new" && mv -f "${TEST}.new" "${TEST}" && sync "${STATE}"
		log "display model ${PREVIOUS} -> ${PROFILE} (${OVERLAY:-firmware}): test after the restart"
		;;
	boot)
		[ -e "${TEST}" ] || exit 0
		if grep -q '^booted=[0-9]' "${TEST}"; then
			# started a second time without an answer (switched off meanwhile, or restarted): back at once
			log "display test: a second start without an answer - back to the model before"
			exec "$0" revert
		fi
		sed -i "s/^booted=.*/booted=$(date +%s)/" "${TEST}" && sync "${TEST}"
		systemctl stop ${TIMER_UNIT}.timer 2>/dev/null
		systemd-run --unit=${TIMER_UNIT} --on-active=${WAIT_S} --collect --quiet /bin/bash "$0" timeout
		log "display test: ${WAIT_S} s for an answer"
		;;
	confirm)
		[ -e "${TEST}" ] || exit 0
		systemctl stop ${TIMER_UNIT}.timer 2>/dev/null
		rm -f "${TEST}" "${BEFORE}" "${STATE}"/rot.*
		sync "${STATE}"
		log "display test: confirmed, the model stays"
		;;
	timeout | revert)
		[ -e "${TEST}" ] || exit 0
		PREVIOUS=$(sed -n 's/^previous=//p' "${TEST}")
		PREV_ROT=$(sed -n 's/^previous_rotation=//p' "${TEST}")
		systemctl stop ${TIMER_UNIT}.timer 2>/dev/null
		if [ -s "${BEFORE}" ]; then
			put_atomic "${BEFORE}" "${BOOT_CONFIG}" || { log "config.txt could not be put back"; exit 1; }
		fi
		# the rotation of before back (the X server's and the touch matrix)
		clear_rotation
		if [ -f "${STATE}/rot.xorg" ]; then
			mkdir -p "$(dirname "${XROT}")" && cp -p "${STATE}/rot.xorg" "${XROT}"
		fi
		[ -f "${STATE}/rot.touch" ] && cp -p "${STATE}/rot.touch" "${TOUCHROT}"
		set_profile_in_config "${PREVIOUS:-custom}" "${PREV_ROT:-0}"
		rm -f "${TEST}" "${BEFORE}" "${STATE}"/rot.*
		sync "${STATE}"
		log "display test: no picture confirmed - back to ${PREVIOUS}, the box restarts"
		systemctl reboot
		;;
	*)
		echo "usage: $0 apply <profile> <previous> | boot | confirm | revert | timeout"
		exit 2
		;;
esac
