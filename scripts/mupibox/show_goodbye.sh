#!/bin/sh
#
# Shows the goodbye picture right away, before anything else of the shutdown (the sounds, ending Chromium): the
# Chromium window is hidden (xdotool) and the picture drawn on the framebuffer (fbv) - with no window shown, the X
# server does not paint over it. Called by the power button (off_trigger.sh) once the button was held long enough,
# and by mupi_shutdown.sh (all other ways of switching off, and again after Chromium was ended).
#   $1: empty = goodbye, *battery_low* = battery empty, another picture file = that one (as mupi_shutdown.sh)

CONFIG="/etc/mupibox/mupiboxconfig.json"
BS_OUT="/home/dietpi/MuPiBox/sysmedia/images/bootscreen"
BS_SCENE=$(cat ${BS_OUT}/current 2>/dev/null)
case "$1" in
	*battery_low*) BS_KIND="battery" ;;
	"") BS_KIND="goodbye" ;;
	*) BS_KIND="" ;;
esac
PIC="${BS_OUT}/${BS_KIND}-${BS_SCENE}.png"
# not put together yet: the default's ready-made picture
[ -n "${BS_KIND}" ] && { [ -f "${PIC}" ] && [ -n "${BS_SCENE}" ] || PIC="/home/dietpi/MuPiBox/sysmedia/bootscreens/prerendered/en/${BS_KIND}-karte.png"; }
[ -z "${BS_KIND}" ] && PIC="$1"
[ -f "${PIC}" ] || PIC=$(/usr/bin/jq -r .mupibox.shutSplash ${CONFIG})

# hide the display's window (it keeps running until mupi_shutdown.sh ends it)
DISPLAY=:0 XAUTHORITY=/home/dietpi/.Xauthority /usr/bin/xdotool search --onlyvisible --class chromium windowunmap %@ >/dev/null 2>&1
sleep 0.15
/usr/bin/fbv "${PIC}" >/dev/null 2>&1 &
