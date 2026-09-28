#!/bin/sh
#
# The client startx runs for the kiosk (see chromium-autostart.sh): the boot screen as the X server's background,
# then Chromium ($@). The X server has a screen of its own (KMS): it was black from its start until Chromium had its
# window (3-4 s at boot), whatever the framebuffer showed. The page itself shows the boot screen until its start page
# is ready.

BS_OUT="/home/dietpi/MuPiBox/sysmedia/images/bootscreen"
SCENE=$(cat ${BS_OUT}/current 2>/dev/null || cat ${BS_OUT}/next 2>/dev/null)
PIC="${BS_OUT}/splash-${SCENE}.png"
[ -f "${PIC}" ] || PIC="/home/dietpi/MuPiBox/sysmedia/bootscreens/prerendered/en/splash-karte.png"
if [ -f "${PIC}" ] && command -v feh >/dev/null; then
	feh --no-fehbg --bg-fill "${PIC}" 2>/dev/null
else
	# without feh: at least the boot screen's colour instead of black
	COLOR=$(tr -cd '0-9a-f' < ${BS_OUT}/color 2>/dev/null | cut -c1-6)
	[ ${#COLOR} -eq 6 ] && xsetroot -solid "#${COLOR}" 2>/dev/null
fi

exec "$@"
