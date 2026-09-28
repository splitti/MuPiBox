#!/bin/sh
#
# The client startx runs for the kiosk (see chromium-autostart.sh): the boot screen as the X server's background,
# then Chromium ($@). The X server has a screen of its own (KMS): it was black from its start until Chromium had its
# window (3-4 s at boot), whatever the framebuffer showed. The page itself shows the boot screen until its start page
# is ready.
#
# Chromium starts once the backend answers: at boot the display can be up before the backend (pm2), and a page asked
# for too early stays on "site can't be reached" (Chromium does not load it again). At most 60 s, then anyway.

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

# Chromium's window came a pixel smaller than the screen (799 x 479): the X background showed as a line on the right and
# at the bottom - with the boot screen there a light one. The window is set to the screen's size once it is shown, and
# the background goes back to black when the page is loaded.
(
	j=0
	while [ "$j" -lt 240 ] && ! xdotool search --onlyvisible --class chromium > /dev/null 2>&1; do
		sleep 0.5
		j=$((j + 1))
	done
	for w in $(xdotool search --onlyvisible --class chromium 2>/dev/null); do
		xdotool windowsize "$w" $(xdotool getdisplaygeometry) 2>/dev/null
	done
	sleep 10
	xsetroot -solid black 2>/dev/null
) &

i=0
while [ "$i" -lt 240 ] && ! curl -s -o /dev/null --max-time 1 http://localhost:8200/assets/icon/favicon.png; do
	sleep 0.25
	i=$((i + 1))
done

exec "$@"
