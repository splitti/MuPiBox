#!/bin/bash
#
# The board's own audio (3.5 mm jack, HDMI sound) next to the box's sound card - the switch "3.5 mm output" in the
# app (Einstellungen > Audio > Soundkarte). DietPi switches it off whenever a sound card other than the onboard one is
# chosen (a block of the driver in modprobe.d, dtparam=audio=off).
#
#   on       DietPi's block away, dtparam=audio=on where it counts, no snd_bcm2835.enable_headphones=0 on the kernel
#            command line - and the box's own card stays card 0 (/etc/asound.conf, the card's repair in the server and
#            DietPi's tools all mean card 0): the onboard driver may not take that slot
#   off      back as DietPi has it for a card other than the onboard one
#   reapply  "on" again when mupibox.onboardAudio is set (after DietPi switched the sound card, which writes its block
#            anew - from the app, the MuPiHAT scripts and at the server's start)
#   status   on / off: what is written (it applies after a restart)
#
# (mupibox.onboardAudio itself is the server's to write: it holds the lock on the configuration.)
# Prints "changed" when something was written: it applies after a restart of the box. Nothing is written that is
# already right, and nothing at all while the onboard card is the box's sound card.

set -u

CONFIG=/etc/mupibox/mupiboxconfig.json
if [ -f /boot/firmware/config.txt ]; then
	BOOT_DIR=/boot/firmware
else
	BOOT_DIR=/boot
fi
BOOT_CONFIG="${BOOT_DIR}/config.txt"
BOOT_CMDLINE="${BOOT_DIR}/cmdline.txt"
BLACKLIST=/etc/modprobe.d/dietpi-disable_rpi_audio.conf
ORDER=/etc/modprobe.d/mupibox-card-order.conf
CHANGED=0

physical=$(/usr/bin/jq -r '.mupibox.physicalDevice // ""' "${CONFIG}" 2>/dev/null)

# dtparam=audio=<on|off> in the lines that count for every Pi (before the first [section] and under [all]); added at
# the end (under an [all] of its own after another section) when there is none
set_dtparam() {
	local want="dtparam=audio=$1" tmp
	tmp=$(mktemp) || return 1
	awk -v want="${want}" '
		{ t = $0; sub(/^[[:space:]]+/, "", t) }
		t ~ /^\[/ { sec = t; sub(/\].*$/, "]", sec); print; next }
		(sec == "" || sec == "[all]") && t ~ /^dtparam=audio=/ { print want; found = 1; next }
		{ print }
		END { if (!found) { if (sec != "" && sec != "[all]") print "[all]"; print want } }
	' "${BOOT_CONFIG}" > "${tmp}" || { rm -f "${tmp}"; return 1; }
	if cmp -s "${tmp}" "${BOOT_CONFIG}"; then
		rm -f "${tmp}"
		return 0
	fi
	cp -p "${BOOT_CONFIG}" "${BOOT_CONFIG}.bak-audio"
	# (written in place: the file keeps its owner and mode, on the FAT boot partition too)
	cat "${tmp}" > "${BOOT_CONFIG}" && CHANGED=1
	rm -f "${tmp}"
}

audio_on() {
	if [ -f "${BLACKLIST}" ]; then
		# (modprobe reads only *.conf: the renamed file is kept and blocks nothing)
		mv -f "${BLACKLIST}" "${BLACKLIST}.removed" && CHANGED=1
	fi
	set_dtparam on
	if grep -q 'snd_bcm2835\.enable_headphones=0' "${BOOT_CMDLINE}" 2>/dev/null; then
		sed -i -E 's/[[:space:]]*snd_bcm2835\.enable_headphones=0//' "${BOOT_CMDLINE}" && CHANGED=1
	fi
	# ("!": slot 0 is not for this module - the box's own card takes it, the onboard cards the next free ones)
	if [ "$(cat "${ORDER}" 2>/dev/null)" != "options snd slots=!snd_bcm2835" ]; then
		echo "options snd slots=!snd_bcm2835" > "${ORDER}" && CHANGED=1
	fi
}

audio_off() {
	if [ ! -f "${BLACKLIST}" ]; then
		if [ -f "${BLACKLIST}.removed" ]; then
			mv -f "${BLACKLIST}.removed" "${BLACKLIST}"
		else
			echo "blacklist snd_bcm2835" > "${BLACKLIST}"
		fi
		CHANGED=1
	fi
	set_dtparam off
	if [ -f "${ORDER}" ]; then
		rm -f "${ORDER}" && CHANGED=1
	fi
}

case "${physical}" in
	rpi-bcm2835-*)
		# the onboard output is the box's sound card: DietPi has it on, nothing to do here - but it must be card 0 then
		[ "${1:-}" = "status" ] && echo "on" && exit 0
		if [ -f "${ORDER}" ]; then
			rm -f "${ORDER}" && echo "changed"
		fi
		exit 0
		;;
esac

case "${1:-}" in
	on)
		audio_on
		;;
	off)
		audio_off
		;;
	reapply)
		[ "$(/usr/bin/jq -r '.mupibox.onboardAudio // false' "${CONFIG}" 2>/dev/null)" = "true" ] || exit 0
		audio_on
		;;
	status)
		if [ ! -f "${BLACKLIST}" ] && [ -f "${ORDER}" ]; then echo "on"; else echo "off"; fi
		exit 0
		;;
	*)
		echo "usage: $0 on|off|reapply|status" >&2
		exit 2
		;;
esac

[ "${CHANGED}" = "1" ] && echo "changed"
exit 0
