#!/bin/bash
#
# Shows the maintenance screen ($1 = update | install | wlan) on the display (fbv, in the background).
# The scene: the one chosen in MuPi-Conf, "same as boot screen" = the boot screen shown at this start.
# Without generated pictures the old installation.jpg.

KIND="${1:-update}"
CONFIG="/etc/mupibox/mupiboxconfig.json"
OUT="/home/dietpi/MuPiBox/sysmedia/images/bootscreen"
FALLBACK="/home/dietpi/MuPiBox/sysmedia/images/installation.jpg"

SCENE=$(/usr/bin/jq -r '.mupibox.maintenanceScreen // "same"' "${CONFIG}" 2>/dev/null)
if [ -z "${SCENE}" ] || [ "${SCENE}" = "same" ] || [ "${SCENE}" = "null" ]; then
	SCENE=$(cat "${OUT}/current" 2>/dev/null || cat "${OUT}/next" 2>/dev/null)
fi
PIC="${OUT}/maintenance-${SCENE}-${KIND}.png"
[ -f "${PIC}" ] || PIC=$(ls "${OUT}"/maintenance-*-"${KIND}".png 2>/dev/null | head -n 1)
# not put together yet: the default's ready-made picture (in the language set, else English), else the old one
READY="/home/dietpi/MuPiBox/sysmedia/bootscreens/prerendered"
LANG_DIR=$(/usr/bin/jq -r '.mupibox.bootscreenLanguage // "en"' "${CONFIG}" 2>/dev/null)
[ -f "${PIC}" ] || PIC="${READY}/${LANG_DIR}/maintenance-karte-${KIND}.png"
[ -f "${PIC}" ] || PIC="${READY}/en/maintenance-karte-${KIND}.png"
[ -f "${PIC}" ] || PIC="${FALLBACK}"
/usr/bin/fbv -c -y "${PIC}" &
