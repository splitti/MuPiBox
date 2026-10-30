#!/bin/bash
#
# The kiosk (X and Chromium) is started at the box's start by DietPi's login on tty1 - as the user of
# AUTO_SETUP_AUTOSTART_LOGIN_USER in dietpi.txt (dietpi on an installed MuPiBox, root on some others). Started again as
# another user, X could not take the console ("Cannot open virtual console 1", seen on a Raspberry Pi 5 that logs in as
# root while the app restarts as dietpi): the display stayed dark. So it is restarted as that user. (Not always as root:
# Chromium does not start as root without giving up its sandbox.)
LOGIN_USER=$(sed -n 's/^[[:blank:]]*AUTO_SETUP_AUTOSTART_LOGIN_USER=//p' /boot/dietpi.txt 2>/dev/null | tr -d '\r[:blank:]' | tail -n 1)
if [ -n "${LOGIN_USER}" ] && [ "${LOGIN_USER}" != "$(id -un)" ] && id "${LOGIN_USER}" >/dev/null 2>&1 && [ -z "${MUPIBOX_KIOSK_AS:-}" ] &&
	sudo -n -u "${LOGIN_USER}" true 2>/dev/null; then
	exec sudo -n -i -u "${LOGIN_USER}" env MUPIBOX_KIOSK_AS=1 "$(readlink -f "$0")" "$@"
fi
sudo killall -r chromium
sleep 2
/var/lib/dietpi/dietpi-software/installed/./chromium-autostart.sh >/dev/null 2>/dev/null &
echo "Chromium-Browser Kiosk restartet"
