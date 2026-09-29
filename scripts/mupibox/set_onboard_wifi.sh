#!/bin/bash
#
# Switches the onboard WiFi off or on for the next boot (dtoverlay=disable-wifi in /boot/config.txt).
#
#   set_onboard_wifi.sh off   the overlay line is there exactly once
#   set_onboard_wifi.sh on    the overlay line is gone
#
# Used by the admin page (Network > Onboard-Wifi). The old code appended the line with "echo >> file": when the
# last line of config.txt had no line break, the overlay was glued to it ("dtoverlay=i2s-mmapdtoverlay=disable-wifi"),
# which broke both overlays, and switching on again removed the LAST line of the file, whatever it was.

CONFIG="${CONFIG:-/boot/config.txt}"
LINE="dtoverlay=disable-wifi"

[ -f "${CONFIG}" ] || exit 1

# Repair a line the overlay has been glued to (the text before it stays as it was).
TMP=$(mktemp) || exit 1
if ! sed "s/\([^[:space:]]\)${LINE}/\1\n${LINE}/" "${CONFIG}" > "${TMP}"; then
	rm -f "${TMP}"
	exit 1
fi
# ... and every copy of the overlay line is dropped; "off" adds exactly one back.
grep -v "^${LINE}[[:space:]]*$" "${TMP}" > "${TMP}.clean"

case "$1" in
	off)
		# a line break at the end of the file first, then the overlay
		if [ -s "${TMP}.clean" ] && [ -n "$(tail -c1 "${TMP}.clean")" ]; then
			echo >> "${TMP}.clean"
		fi
		echo "${LINE}" >> "${TMP}.clean"
		;;
	on) ;;
	*)
		rm -f "${TMP}" "${TMP}.clean"
		echo "usage: $0 off|on" >&2
		exit 1
		;;
esac

# Never write back an empty or truncated file (a full /tmp, a failed sed): config.txt holds the
# HAT and audio overlays, and an empty one leaves the box without sound, battery and display.
# The result is always the original minus at most the overlay lines plus one.
orig_lines=$(grep -c "" "${CONFIG}")
new_lines=$(grep -c "" "${TMP}.clean")
overlay_lines=$(grep -c "${LINE}" "${CONFIG}")
if [ ! -s "${TMP}.clean" ] || [ "${new_lines}" -lt $((orig_lines - overlay_lines)) ]; then
	echo "set_onboard_wifi.sh: result looks incomplete (${new_lines} of ${orig_lines} lines), ${CONFIG} left unchanged" >&2
	rm -f "${TMP}" "${TMP}.clean"
	exit 1
fi
# Written next to the target and renamed, so a power cut leaves either the old or the new file.
if cp "${TMP}.clean" "${CONFIG}.new" && sync && mv -f "${CONFIG}.new" "${CONFIG}"; then
	sync
else
	rm -f "${CONFIG}.new"
	echo "set_onboard_wifi.sh: could not write ${CONFIG}" >&2
fi
rm -f "${TMP}" "${TMP}.clean"
