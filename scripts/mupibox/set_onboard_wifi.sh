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
TMP=$(mktemp)
sed "s/\([^[:space:]]\)${LINE}/\1\n${LINE}/" "${CONFIG}" > "${TMP}"
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

# cat instead of mv: keeps the file (and its permissions) on the boot partition
cat "${TMP}.clean" > "${CONFIG}"
rm -f "${TMP}" "${TMP}.clean"
