#!/bin/sh
#
# Service: Start Splash
# Shows the boot screen chosen in MuPi-Conf (put together by bootscreen_update.sh). With "random" this picture was
# chosen at the last start (the console already has its colour); the one of the next start is chosen now.
# Without generated pictures: the configured startSplash as before.

CONFIG="/etc/mupibox/mupiboxconfig.json"
OUT="/home/dietpi/MuPiBox/sysmedia/images/bootscreen"

NEXT=$(cat "${OUT}/next" 2>/dev/null)
if [ -n "${NEXT}" ] && [ -f "${OUT}/splash-${NEXT}.png" ]; then
	/usr/bin/fbv -c -y "${OUT}/splash-${NEXT}.png" &
	echo "${NEXT}" > "${OUT}/current"
	/usr/local/bin/mupibox/bootscreen_color.sh "${NEXT}" browser
	if [ "$(/usr/bin/jq -r '.mupibox.bootscreen // ""' ${CONFIG})" = "random" ]; then
		NEW=$(ls "${OUT}"/splash-*.png | sed 's#.*/splash-\(.*\)\.png#\1#' | grep -vx "${NEXT}" | shuf -n 1)
		if [ -n "${NEW}" ]; then
			echo "${NEW}" > "${OUT}/next"
			/usr/local/bin/mupibox/bootscreen_color.sh "${NEW}" console
		fi
	fi
	wait
	exit 0
fi

# not put together yet (e.g. first start after the installation): the default's ready-made picture, else as before
READY="/home/dietpi/MuPiBox/sysmedia/bootscreens/prerendered/en/splash-karte.png"
if [ -f "${READY}" ]; then
	/usr/bin/fbv -c -y "${READY}"
	exit 0
fi
START_SPLASH=`/usr/bin/jq -r .mupibox.startSplash ${CONFIG}`
/usr/bin/fbv ${START_SPLASH}
