#!/bin/bash
#
# The rotation of a display that runs with KMS (Touch Display 2, Waveshare, EDATEC - see display_profile.sh): the X
# server turns the picture (Option "Rotate"), the touch is turned with it (libinput's calibration matrix). Run as root
# by the app's server; the display's kiosk is restarted by the caller. The official 7" of the 1st generation turns with
# the firmware's settings instead (lcd_rotate, display_hdmi_rotate in config.txt).
#
#   display_rotation.sh <0|90|180|270>

set -u
CONFIG=/etc/mupibox/mupiboxconfig.json
XROT=/etc/X11/xorg.conf.d/90-mupibox-rotate.conf
TOUCHROT=/etc/udev/rules.d/99-mupibox-touch-rotate.rules

DEG="${1:-}"
case "${DEG}" in
	0) ROTATE=normal; MATRIX="" ;;
	90) ROTATE=right; MATRIX="0 1 0 -1 0 1" ;;
	180) ROTATE=inverted; MATRIX="-1 0 1 0 -1 1" ;;
	270) ROTATE=left; MATRIX="0 -1 1 1 0 0" ;;
	*) echo "usage: $0 <0|90|180|270>"; exit 2 ;;
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

# $1 (content) into $2: next to it, on the card, renamed
write_file() {
	mkdir -p "$(dirname "$2")" && printf '%s\n' "$1" > "$2.mupibox-new" && sync "$2.mupibox-new" && mv -f "$2.mupibox-new" "$2"
}

if [ "${DEG}" = "0" ]; then
	rm -f "${XROT}" "${TOUCHROT}"
else
	write_file "# MuPiBox (app: Display & Bedienung > Drehung): the display turned by ${DEG} degrees
Section \"Monitor\"
	Identifier \"${OUTPUT}\"
	Option \"Rotate\" \"${ROTATE}\"
EndSection" "${XROT}" || exit 1
	write_file "# MuPiBox (app: Display & Bedienung > Drehung): the touch turned with the picture (${DEG} degrees)
ENV{ID_INPUT_TOUCHSCREEN}==\"1\", ENV{LIBINPUT_CALIBRATION_MATRIX}=\"${MATRIX}\"" "${TOUCHROT}" || exit 1
fi
udevadm control --reload 2>/dev/null
udevadm trigger --subsystem-match=input --action=change 2>/dev/null

tmp=$(mktemp /etc/mupibox/.cfg.XXXXXX) || exit 1
if /usr/bin/jq --argjson r "${DEG}" '.mupibox.displayRotation = $r' "${CONFIG}" > "${tmp}" && [ -s "${tmp}" ]; then
	chown --reference="${CONFIG}" "${tmp}" && chmod --reference="${CONFIG}" "${tmp}" && mv -f "${tmp}" "${CONFIG}"
else
	rm -f "${tmp}"
	exit 1
fi
logger -t mupibox-display "rotation ${DEG} degrees (${OUTPUT})"
