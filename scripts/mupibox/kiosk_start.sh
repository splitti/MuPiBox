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

# A display with KMS on the ribbon cable (Touch Display 2, Waveshare, EDATEC - app: Display-Modell): the window and the
# scale go by the screen as the X server shows it, turned (Drehung) - the panel says its size, the setting would be a
# guess. Asked here, with X running (chromium-autostart.sh runs before the X server: at a cold start it got no answer
# and kept the setting - 800 x 480 on a 1280 x 720 panel, scale 1 instead of 1.5). The scale as in chromium-autostart.sh.
for c in /sys/class/drm/card*-DSI-*/status; do
	if [ -e "${c}" ] && [ "$(cat "${c}")" = "connected" ]; then
		# mirrored (app: Drehung, display_rotation.sh): by xrandr - the KMS driver ignores the X server's option for it
		REFLECT=$(cat /etc/X11/mupibox-reflect 2>/dev/null)
		case "${REFLECT}" in
			x | y)
				OUT=$(basename "$(dirname "${c}")" | sed 's/^card[0-9]*-//')
				xrandr --output "${OUT}" --reflect "${REFLECT}" 2>/dev/null
				;;
		esac
		SCREEN=$(xrandr --current 2>/dev/null | sed -n 's/^Screen 0:.* current \([0-9]*\) x \([0-9]*\),.*/\1 \2/p')
		if [ -n "${SCREEN}" ]; then
			RES_X=${SCREEN% *}
			RES_Y=${SCREEN#* }
			UI_SCALE=$(LC_ALL=C awk -v x="${RES_X}" -v y="${RES_Y}" 'BEGIN { if (x + 0 <= 0 || y + 0 <= 0) { print 1; exit } s = x / 800; if (y / 480 < s) s = y / 480; if (s > 3) s = 3; if (s > 1) printf "%.2f", s; else print 1 }')
			# the arguments without the window size and scale of the setting, then the screen's
			n=$#
			for a in "$@"; do
				case "$a" in
					--window-size=* | --force-device-scale-factor=*) ;;
					*) set -- "$@" "$a" ;;
				esac
			done
			shift "$n"
			set -- "$@" "--window-size=${RES_X},${RES_Y}"
			[ "${UI_SCALE}" != "1" ] && set -- "$@" "--force-device-scale-factor=${UI_SCALE}"
		fi
		break
	fi
done

i=0
while [ "$i" -lt 240 ] && ! curl -s -o /dev/null --max-time 1 http://localhost:8200/assets/icon/favicon.png; do
	sleep 0.25
	i=$((i + 1))
done

exec "$@"
