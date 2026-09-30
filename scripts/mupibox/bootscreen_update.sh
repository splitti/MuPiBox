#!/bin/bash
#
# Boot and maintenance screens: puts the pictures for the settings of MuPi-Conf together (boot screen, maintenance
# screen, box name, language; see /home/dietpi/MuPiBox/sysmedia/bootscreens/tools/compose_bootscreen.py) and sets
# the colour of the console and of the browser start to the boot screen's base colour, so the start does not flash.
# Run as root after the settings were saved (MuPi-Conf does it in the background) and by the install/update.

CONFIG="/etc/mupibox/mupiboxconfig.json"
BS_DIR="/home/dietpi/MuPiBox/sysmedia/bootscreens"
OUT="/home/dietpi/MuPiBox/sysmedia/images/bootscreen"
LOG="/tmp/bootscreen_update.log"

exec >"${LOG}" 2>&1
[ -f "${BS_DIR}/bootscreens.json" ] || { echo "no bootscreens installed"; exit 1; }
# the default boot screen: used when mupibox.bootscreen is missing, empty or unknown
DEFAULT=$(/usr/bin/jq -r '.defaultBootscreen // "karte"' "${BS_DIR}/bootscreens.json")

# the previews in MuPi-Conf use the installed scenes and font (no copies in the admin interface)
mkdir -p /var/www/images /var/www/fonts
ln -sfn "${BS_DIR}" /var/www/images/bootscreens
ln -sfn /usr/local/share/fonts/mupibox/Fredoka-Variable.ttf /var/www/fonts/Fredoka-Variable.ttf

if command -v rsvg-convert >/dev/null && python3 "${BS_DIR}/tools/compose_bootscreen.py" apply "${OUT}"; then
	BOOT=$(/usr/bin/jq -r '.mupibox.bootscreen // ""' "${CONFIG}")
else
	# nothing could be put together (e.g. rsvg-convert missing): the default's pictures shipped ready-made
	echo "putting the pictures together failed - the ready-made pictures of ${DEFAULT} are used"
	LANG_DIR=$(/usr/bin/jq -r '.mupibox.bootscreenLanguage // "en"' "${CONFIG}")
	[ -d "${BS_DIR}/prerendered/${LANG_DIR}" ] || LANG_DIR="en"
	[ -d "${BS_DIR}/prerendered/${LANG_DIR}" ] || exit 1
	mkdir -p "${OUT}"
	rm -f "${OUT}"/*.png
	cp "${BS_DIR}/prerendered/${LANG_DIR}"/*.png "${OUT}/"
	/usr/bin/jq -r '.bootscreens[] | "\(.id) \(.baseColor)"' "${BS_DIR}/bootscreens.json" > "${OUT}/colors.txt"
	BOOT="${DEFAULT}"
fi
# Own pictures (web app › Startbilder › "Eigene Bilder", mupibox.bootscreenCustom): instead of the design's of the same
# kind, in every scene; the start picture's edge colour for the console and the browser's start. The design's pictures
# stay for what has no own one and for the maintenance screens.
CUSTOM="/home/dietpi/MuPiBox/sysmedia/images/bootscreen-custom"
[ "$(/usr/bin/jq -r '.mupibox.bootscreenCustom // false' "${CONFIG}")" = "true" ] || CUSTOM="/nonexistent"
for KIND in splash goodbye battery; do
	[ -f "${CUSTOM}/${KIND}.png" ] || continue
	for PIC in "${OUT}/${KIND}"-*.png; do
		[ -f "${PIC}" ] && cp "${CUSTOM}/${KIND}.png" "${PIC}"
	done
done
if [ -f "${CUSTOM}/splash.png" ]; then
	C=$(tr -dc '0-9A-Fa-f' < "${CUSTOM}/color" 2>/dev/null | head -c 6)
	if [ ${#C} -eq 6 ] && [ -f "${OUT}/colors.txt" ]; then
		awk -v c="#${C}" '{print $1, c}' "${OUT}/colors.txt" > "${OUT}/colors.tmp" && mv "${OUT}/colors.tmp" "${OUT}/colors.txt"
	fi
fi
chown -R dietpi:dietpi "${OUT}"

[ -n "${BOOT}" ] && [ "${BOOT}" != "null" ] || BOOT="${DEFAULT}"
if [ "${BOOT}" = "random" ]; then
	# the scene of the next start is chosen now, so the console can already have its colour at that start
	BOOT=$(awk '{print $1}' "${OUT}/colors.txt" | shuf -n 1)
fi
[ -f "${OUT}/splash-${BOOT}.png" ] || BOOT="${DEFAULT}"
[ -f "${OUT}/splash-${BOOT}.png" ] || BOOT=$(ls "${OUT}"/splash-*.png | head -n 1 | sed 's#.*/splash-\(.*\)\.png#\1#')
echo "${BOOT}" > "${OUT}/next"
# a fixed boot screen is also the one of "same as boot screen" for maintenance right away (random: from the next start)
[ "$(/usr/bin/jq -r '.mupibox.bootscreen // ""' "${CONFIG}")" != "random" ] && echo "${BOOT}" > "${OUT}/current"
/usr/local/bin/mupibox/bootscreen_color.sh "${BOOT}"
echo "done: next boot screen ${BOOT}"
