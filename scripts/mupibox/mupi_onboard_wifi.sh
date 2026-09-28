#!/bin/bash
#
# Turns the onboard WiFi radio on or off via rfkill (soft block), independent of any USB WiFi
# adapter that may also be present (see mupi_wifi_iface.sh). Takes effect immediately, no reboot.
#
#   mupi_onboard_wifi.sh status   prints "on", "off" or "unavailable" (no onboard adapter present)
#   mupi_onboard_wifi.sh on       unblocks the onboard radio
#   mupi_onboard_wifi.sh off      soft-blocks the onboard radio
#
# block/unblock need root; status can be read by anyone.

RFKILL=/usr/sbin/rfkill

iface=$(/usr/local/bin/mupibox/mupi_wifi_iface.sh onboard)
if [ -z "${iface}" ]; then
	echo "unavailable"
	exit 0
fi

phy=$(cat "/sys/class/net/${iface}/phy80211/name" 2>/dev/null)
idx=$("${RFKILL}" list 2>/dev/null | awk -v p="${phy}:" '$2 == p { gsub(":", "", $1); print $1; exit }')

if [ -z "${idx}" ]; then
	echo "unavailable"
	exit 0
fi

case "$1" in
	on) "${RFKILL}" unblock "${idx}" ;;
	off) "${RFKILL}" block "${idx}" ;;
	*)
		blocked=$("${RFKILL}" list "${idx}" | awk -F': ' '/Soft blocked/ { print $2; exit }')
		[ "${blocked}" = "yes" ] && echo "off" || echo "on"
		;;
esac
