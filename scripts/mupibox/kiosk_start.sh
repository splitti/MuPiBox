#!/bin/sh
#
# The client startx runs for the kiosk (see chromium-autostart.sh): the boot screen again right after the X server
# started - until Chromium had its window and its page the display was black and white for about 14 s (the server
# leaves the screen as it is with -background none; this is for the case it painted it anyway) - then Chromium ($@).
# The page itself shows the boot screen until its start page is ready.

BS_OUT="/home/dietpi/MuPiBox/sysmedia/images/bootscreen"
SCENE=$(cat ${BS_OUT}/current 2>/dev/null || cat ${BS_OUT}/next 2>/dev/null)
PIC="${BS_OUT}/splash-${SCENE}.png"
[ -f "${PIC}" ] || PIC="/home/dietpi/MuPiBox/sysmedia/bootscreens/prerendered/en/splash-karte.png"
[ -f "${PIC}" ] && sudo -n /usr/bin/fbv "${PIC}" >/dev/null 2>&1 &

exec "$@"
