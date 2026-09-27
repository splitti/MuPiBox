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
[ -f "${BS_DIR}/tools/compose_bootscreen.py" ] || { echo "no bootscreens installed"; exit 1; }
command -v rsvg-convert >/dev/null || { echo "rsvg-convert missing (librsvg2-bin)"; exit 1; }

# the previews in MuPi-Conf use the installed scenes and font (no copies in the admin interface)
mkdir -p /var/www/images /var/www/fonts
ln -sfn "${BS_DIR}" /var/www/images/bootscreens
ln -sfn /usr/local/share/fonts/mupibox/Fredoka-Variable.ttf /var/www/fonts/Fredoka-Variable.ttf

python3 "${BS_DIR}/tools/compose_bootscreen.py" apply "${OUT}" || exit 1
chown -R dietpi:dietpi "${OUT}"

BOOT=$(/usr/bin/jq -r '.mupibox.bootscreen // "abendhuegel"' "${CONFIG}")
if [ "${BOOT}" = "random" ]; then
	# the scene of the next start is chosen now, so the console can already have its colour at that start
	BOOT=$(awk '{print $1}' "${OUT}/colors.txt" | shuf -n 1)
fi
[ -f "${OUT}/splash-${BOOT}.png" ] || BOOT=$(ls "${OUT}"/splash-*.png | head -n 1 | sed 's#.*/splash-\(.*\)\.png#\1#')
echo "${BOOT}" > "${OUT}/next"
# a fixed boot screen is also the one of "same as boot screen" for maintenance right away (random: from the next start)
[ "$(/usr/bin/jq -r '.mupibox.bootscreen // ""' "${CONFIG}")" != "random" ] && echo "${BOOT}" > "${OUT}/current"
/usr/local/bin/mupibox/bootscreen_color.sh "${BOOT}"
echo "done: next boot screen ${BOOT}"
