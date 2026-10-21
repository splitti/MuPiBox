#!/bin/bash
#
# Run by mupibox-display-ready.service (see install_start_order.sh): waits until the display shows the start page, that
# is until the kiosk's large Chromium window has "MuPiBox" in its title, and then ends. The services that are not needed
# for the display (the admin interface's php-fpm and lighttpd, the Samba share, the DietPi dashboard) start after it, one
# after the other: the first minute of the box is busy (the system lives on a card or a stick), and Chromium whose child
# processes wait 15 s for the browser ends on a blank page for ever (chromium-autostart.sh's watchdog).
#
# $1 = the longest wait in seconds (120): a box without a display, or one whose display does not come up (the watchdog
# restarts it), must not keep the others from starting - this script always ends with 0.

MAX="${1:-120}"

# the large Chromium window (the other one is a 10 x 10 helper window): its title
window_title() {
	DISPLAY=:0 XAUTHORITY="$(ls -t /tmp/serverauth.* 2>/dev/null | head -n 1)" xwininfo -root -tree 2>/dev/null \
		| awk '/\("chromium" "Chromium"\)/ { split($(NF - 1), g, "x"); if (g[1] + 0 >= 400) { print; exit } }'
}

start=$(cut -d. -f1 /proc/uptime)
while :; do
	case "$(window_title)" in
		*'"MuPiBox'*)
			logger -t mupibox-display-ready "the display shows the start page after $(($(cut -d. -f1 /proc/uptime) - start)) s"
			exit 0
			;;
	esac
	if [ $(($(cut -d. -f1 /proc/uptime) - start)) -ge "${MAX}" ]; then
		logger -t mupibox-display-ready "the display does not show the start page after ${MAX} s, the other services start now"
		exit 0
	fi
	sleep 2
done
