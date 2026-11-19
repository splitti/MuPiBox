#!/bin/bash
#
# Shows the maintenance screen ($1 = update | install | wlan) on the display (fbv, in the background).
# The scene: the one chosen in MuPi-Conf, "same as boot screen" = the boot screen shown at this start.
# Without generated pictures the old installation.jpg.
#
# With a progress ($2 = percent, $3 = part: prepare download packages install settings done failed - see
# update_progress_display.sh): the picture with a progress bar at its foot (compose_bootscreen.py fortschritt), in
# place of the one shown before. Without Python and PIL, or when drawing it fails: what is shown stays as it is.

# a display with KMS that is turned: the picture turned with it (see fbv_options.sh)
FBV_OPTS=$(/usr/local/bin/mupibox/fbv_options.sh 2>/dev/null)

KIND="${1:-update}"
PCT="$2"
PART="$3"

# The OLED display (extension): its picture of an update, whatever the DSI display shows (nothing without the extension)
[ "${KIND}" = "update" ] && [ -x /usr/local/bin/mupibox/oled_picture.sh ] && /usr/local/bin/mupibox/oled_picture.sh update >/dev/null 2>&1 &

# The console of the display (tty1) in graphics mode while the picture of an update or an installation stands: in text mode
# its driver (fbcon) draws over the picture now and then - the console's background (blue) in stripes across it, whenever
# the cursor blinks or a line is written to tty1. The mode stays when this script has ended; the display's start (X) and a
# restart of the box set it as they need it. (KDSETMODE = 0x4B3A, KD_GRAPHICS = 1)
case "${KIND}" in
	update | install) python3 -c 'import fcntl,os;fcntl.ioctl(os.open("/dev/tty1",os.O_RDWR|os.O_NOCTTY),0x4B3A,1)' 2>/dev/null ;;
esac
CONFIG="/etc/mupibox/mupiboxconfig.json"
OUT="/home/dietpi/MuPiBox/sysmedia/images/bootscreen"
FALLBACK="/home/dietpi/MuPiBox/sysmedia/images/installation.jpg"
TOOLS="/home/dietpi/MuPiBox/sysmedia/bootscreens/tools"
PROGRESS_PIC="/run/mupibox-update-progress/picture.png"

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

if [ -n "${PCT}" ] && [ -n "${PART}" ]; then
	# (no picture to draw the bar on, or drawing it fails: what the display shows stays - the update showed the picture
	# without a bar at its start; nothing is started for every step)
	[ "${PIC}" != "${FALLBACK}" ] || exit 0
	mkdir -p -m 700 "$(dirname "${PROGRESS_PIC}")" 2>/dev/null || exit 0
	# the scene of the picture by its name (maintenance-<scene>-<kind>.png): its colours and where its text is
	PIC_SCENE=$(basename "${PIC}" | sed -n "s/^maintenance-\(.*\)-${KIND}\.png$/\1/p")
	if ! python3 "${TOOLS}/compose_bootscreen.py" fortschritt "${PIC}" "${PIC_SCENE:-karte}" "${PCT}" "${PART}" "${LANG_DIR:-en}" "${PROGRESS_PIC}.tmp.png" 2>/dev/null; then
		rm -f "${PROGRESS_PIC}.tmp.png"
		exit 0
	fi
	mv -f "${PROGRESS_PIC}.tmp.png" "${PROGRESS_PIC}"
	# (the picture shown before goes: one fbv at a time; called from the update's unit there is no terminal - fbv shows
	# nothing without one, so the display's)
	pkill -x fbv 2>/dev/null
	# (in one write - fb_show.py: fbv puts it there point by point, turned and scaled on the way, and on a Pi every step of
	# the bar flickered; fbv only when that cannot)
	python3 /usr/local/bin/mupibox/fb_show.py "${PROGRESS_PIC}" ${FBV_OPTS} 2>/dev/null \
		|| /usr/bin/fbv ${FBV_OPTS} -c -y "${PROGRESS_PIC}" </dev/tty1 >/dev/tty1 2>/dev/null &
	exit 0
fi
# (without a terminal - the app's update runs in a unit - fbv shows nothing: then on the display's; from a terminal as
# always)
if [ -t 0 ] || [ ! -w /dev/tty1 ]; then
	/usr/bin/fbv ${FBV_OPTS} -c -y "${PIC}" &
else
	/usr/bin/fbv ${FBV_OPTS} -c -y "${PIC}" </dev/tty1 >/dev/tty1 2>/dev/null &
fi
