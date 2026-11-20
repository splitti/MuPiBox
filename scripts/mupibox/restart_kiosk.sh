#!/bin/bash
#
# The kiosk (X and Chromium) is started at the box's start by DietPi's login on tty1 - as the user of
# AUTO_SETUP_AUTOSTART_LOGIN_USER in dietpi.txt (dietpi on an installed MuPiBox, root on some others). Started again as
# another user, X could not take the console ("Cannot open virtual console 1", seen on a Raspberry Pi 5 that logs in as
# root while the app restarts as dietpi): the display stayed dark. So it is restarted as that user. (Not always as root:
# Chromium does not start as root without giving up its sandbox.)
# A box without the DSI display (mupibox.headless: Einstellungen > Display > Ohne DSI-Display) has no X server: no kiosk to
# restart - but the page without a screen that keeps Spotify there, when it is switched on (mupi_spotify_browser.service).
# (switched on but the box not restarted yet: the kiosk still runs and is restarted as before)
if [ "$(/usr/bin/jq -r '.mupibox.headless // false' /etc/mupibox/mupiboxconfig.json 2>/dev/null)" = "true" ] && ! pidof Xorg >/dev/null 2>&1; then
	if systemctl is-enabled --quiet mupi_spotify_browser.service 2>/dev/null; then
		sudo -n systemctl restart mupi_spotify_browser.service
		echo "Ohne DSI-Display: Spotify-Browser restartet"
	else
		echo "Ohne DSI-Display: kein Kiosk"
	fi
	exit 0
fi
LOGIN_USER=$(sed -n 's/^[[:blank:]]*AUTO_SETUP_AUTOSTART_LOGIN_USER=//p' /boot/dietpi.txt 2>/dev/null | tr -d '\r[:blank:]' | tail -n 1)
if [ -n "${LOGIN_USER}" ] && [ "${LOGIN_USER}" != "$(id -un)" ] && id "${LOGIN_USER}" >/dev/null 2>&1 && [ -z "${MUPIBOX_KIOSK_AS:-}" ] &&
	sudo -n -u "${LOGIN_USER}" true 2>/dev/null; then
	exec sudo -n -i -u "${LOGIN_USER}" env MUPIBOX_KIOSK_AS=1 "$(readlink -f "$0")" "$@"
fi
# (the page without a screen for Spotify, when the box ran without the DSI display until now and the switch was turned off
# before the restart: no X server runs, and a kiosk cannot be started from here - it stays until the restart; with an X
# server it is stopped, the kiosk uses the same profile)
if systemctl is-active --quiet mupi_spotify_browser.service 2>/dev/null; then
	if ! pidof Xorg >/dev/null 2>&1; then
		echo "Ohne DSI-Display bis zum Neustart: Spotify-Browser bleibt"
		exit 0
	fi
	sudo -n systemctl stop mupi_spotify_browser.service
fi
sudo killall -r chromium
sleep 2
/var/lib/dietpi/dietpi-software/installed/./chromium-autostart.sh >/dev/null 2>/dev/null &
echo "Chromium-Browser Kiosk restartet"
