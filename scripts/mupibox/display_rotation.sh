#!/bin/bash
#
# The rotation or mirroring of a display that runs with KMS (Touch Display 2, Waveshare, EDATEC - see
# display_profile.sh): the X server turns the picture (Option "Rotate"), the touch is turned with it (libinput's
# calibration matrix). A mirroring is done by xrandr when the kiosk starts (kiosk_start.sh reads ${REFLECT}) - the KMS
# driver ignores the X server's option for it ("Reflect"). Turned or mirrored, not both (as display_hdmi_rotate). Run as
# root by the app's server; the display's kiosk is restarted by the caller. The official 7" of the 1st generation turns
# with the firmware's settings instead (lcd_rotate, display_hdmi_rotate in config.txt).
#
#   display_rotation.sh <0|90|180|270|mirror-x|mirror-y>

set -u
CONFIG=/etc/mupibox/mupiboxconfig.json
CONFIG_LOCK=/tmp/.mupiboxconfig.lock
XROT=/etc/X11/xorg.conf.d/90-mupibox-rotate.conf
TOUCHROT=/etc/udev/rules.d/99-mupibox-touch-rotate.rules
REFLECT=/etc/X11/mupibox-reflect

WHAT="${1:-}"
DEG=0
MIRROR=""
case "${WHAT}" in
	0) ROTATE=""; MATRIX="" ;;
	90) DEG=90; ROTATE=right; MATRIX="0 1 0 -1 0 1" ;;
	180) DEG=180; ROTATE=inverted; MATRIX="-1 0 1 0 -1 1" ;;
	270) DEG=270; ROTATE=left; MATRIX="0 -1 1 1 0 0" ;;
	# (mirrored left-right / top-bottom: the touch the same way)
	mirror-x) MIRROR=x; ROTATE=""; MATRIX="-1 0 1 0 1 0" ;;
	mirror-y) MIRROR=y; ROTATE=""; MATRIX="1 0 0 0 -1 1" ;;
	*) echo "usage: $0 <0|90|180|270|mirror-x|mirror-y>"; exit 2 ;;
esac

# the display's output as the X server names it: card1-DSI-1 -> DSI-1 (the one that is connected)
OUTPUT=""
for c in /sys/class/drm/card*-DSI-*; do
	[ -e "${c}/status" ] || continue
	if [ "$(cat "${c}/status")" = "connected" ]; then
		OUTPUT=$(basename "${c}" | sed 's/^card[0-9]*-//')
		break
	fi
done
[ -n "${OUTPUT}" ] || { echo "no display with KMS on the ribbon cable (DSI) - it turns with the firmware's settings"; exit 3; }

# one change of the display at a time (the lock of display_profile.sh): two quick taps wrote the picture of one and the
# touch of the other
exec 9> /run/lock/mupibox-display-profile.lock
flock -w 60 9 || { echo "busy"; exit 1; }

# $1 (content) into $2: next to it, on the card, renamed
write_file() {
	mkdir -p "$(dirname "$2")" && printf '%s\n' "$1" > "$2.mupibox-new" && sync "$2.mupibox-new" && mv -f "$2.mupibox-new" "$2"
}

if [ -n "${ROTATE}" ]; then
	write_file "# MuPiBox (app: Display & Bedienung > Drehung): the display turned by ${DEG} degrees
Section \"Monitor\"
	Identifier \"${OUTPUT}\"
	Option \"Rotate\" \"${ROTATE}\"
EndSection" "${XROT}" || exit 1
else
	rm -f "${XROT}" || exit 1
fi
if [ -n "${MIRROR}" ]; then
	write_file "${MIRROR}" "${REFLECT}" || exit 1
else
	rm -f "${REFLECT}" || exit 1
fi
if [ -n "${MATRIX}" ]; then
	write_file "# MuPiBox (app: Display & Bedienung > Drehung): the touch turned or mirrored with the picture (${WHAT})
ENV{ID_INPUT_TOUCHSCREEN}==\"1\", ENV{LIBINPUT_CALIBRATION_MATRIX}=\"${MATRIX}\"" "${TOUCHROT}" || exit 1
else
	rm -f "${TOUCHROT}" || exit 1
fi
udevadm control --reload 2>/dev/null
udevadm trigger --subsystem-match=input --action=change 2>/dev/null

# the rotation in the settings, under the lock the server and the admin interface take for the file (a setting saved
# meanwhile is not overwritten)
[ -e "${CONFIG_LOCK}" ] || { : > "${CONFIG_LOCK}"; chmod 666 "${CONFIG_LOCK}"; }
(
	flock -w 15 8 || exit 1
	tmp=$(mktemp /etc/mupibox/.cfg.XXXXXX) || exit 1
	if /usr/bin/jq --argjson r "${DEG}" --arg m "${MIRROR}" '.mupibox.displayRotation = $r | if $m == "" then del(.mupibox.displayMirror) else .mupibox.displayMirror = $m end' "${CONFIG}" > "${tmp}" && [ -s "${tmp}" ] &&
		chown --reference="${CONFIG}" "${tmp}" && chmod --reference="${CONFIG}" "${tmp}" && mv -f "${tmp}" "${CONFIG}"; then
		exit 0
	fi
	rm -f "${tmp}"
	exit 1
) 8<"${CONFIG_LOCK}" || exit 1
logger -t mupibox-display "rotation ${WHAT} (${OUTPUT})"
