#!/bin/bash
#
# A picture of what the display shows (PNG) - for the app, Telegram, MQTT and Home Assistant.
#
#   screenshot.sh <picture.png>
#
# Exit 0: the picture is there. Exit 3: the display is off - no picture, <picture.png> stays as it was (the caller says
# "the display is off" or keeps its last one). Exit 1: no picture (no X server, scrot failed).
#
# Why: while the X server has the monitor off (DPMS), everything Chromium draws anew comes out black - a few seconds
# after the display went off a screenshot is black (seen on a Pi 4 with Trixie, modesetting and glamor; PageFlip off
# does not change it). Woken for a picture it is not: the panel's driver switches the backlight on with the monitor
# (it would light up, at night too), and Chromium draws nothing new without a change on the page.

OUT="$1"
[ -n "${OUT}" ] || { echo "usage: screenshot.sh <picture.png>" >&2; exit 2; }

# the X display belongs to dietpi: as root the same as dietpi (the files belong to dietpi, as before)
if [ "$(id -u)" = 0 ]; then
	exec runuser -u dietpi -- "$0" "$@"
fi

export DISPLAY=:0 XAUTHORITY=/home/dietpi/.Xauthority
TMP="${OUT%.png}.tmp-$$.png"
trap 'rm -f "${TMP}"' EXIT

case "$(timeout 3 xset q 2>/dev/null | grep -m 1 'Monitor is')" in
	*"Monitor is On"* | "") ;;
	*) exit 3 ;;
esac

timeout 8 scrot -o "${TMP}" 2>/dev/null && [ -s "${TMP}" ] || exit 1
mv -f "${TMP}" "${OUT}" || exit 1
exit 0
