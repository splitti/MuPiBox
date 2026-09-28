#!/bin/sh
#
# The client startx runs for the kiosk (see chromium-autostart.sh): the boot screen again right after the X server
# started - it paints its screen black, and until Chromium had its window and its page the display was black and
# white for about 14 s - then Chromium ($@). The page itself shows the boot screen until its start page is ready.

BS_OUT="/home/dietpi/MuPiBox/sysmedia/images/bootscreen"
COLOR=$(tr -cd '0-9a-f' < ${BS_OUT}/color 2>/dev/null | cut -c1-6)
[ ${#COLOR} -eq 6 ] && xsetroot -solid "#${COLOR}" 2>/dev/null
SCENE=$(cat ${BS_OUT}/current 2>/dev/null || cat ${BS_OUT}/next 2>/dev/null)
PIC="${BS_OUT}/splash-${SCENE}.png"
[ -f "${PIC}" ] || PIC="/home/dietpi/MuPiBox/sysmedia/bootscreens/prerendered/en/splash-karte.png"
[ -f "${PIC}" ] && sudo -n /usr/bin/fbv "${PIC}" >/dev/null 2>&1 &

exec "$@"
