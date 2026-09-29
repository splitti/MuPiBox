#!/bin/bash
#
# Turns the onboard WiFi radio on or off via rfkill (soft block), independent of any USB WiFi
# adapter that may also be present (see mupi_wifi_iface.sh). Takes effect immediately, no reboot.
# Through the kernel's switch in sysfs (/sys/class/net/<if>/phy80211/rfkill*/soft): the rfkill
# program is not installed on boxes set up before it was added to autosetup.sh. systemd-rfkill
# keeps the state over a restart.
#
#   mupi_onboard_wifi.sh status   prints "on", "off" or "unavailable" (no onboard adapter present)
#   mupi_onboard_wifi.sh on       unblocks the onboard radio
#   mupi_onboard_wifi.sh off      soft-blocks the onboard radio
#
# on/off need root; status can be read by anyone.

iface=$(/usr/local/bin/mupibox/mupi_wifi_iface.sh onboard)
switch=""
[ -n "${iface}" ] && switch=$(ls -d /sys/class/net/"${iface}"/phy80211/rfkill* 2>/dev/null | head -n 1)
if [ -z "${switch}" ] || [ ! -e "${switch}/soft" ]; then
	echo "unavailable"
	exit 0
fi

case "$1" in
	on) echo 0 > "${switch}/soft" ;;
	off) echo 1 > "${switch}/soft" ;;
	*) [ "$(cat "${switch}/soft")" = "1" ] && echo "off" || echo "on" ;;
esac
