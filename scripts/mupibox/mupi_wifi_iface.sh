#!/bin/bash
#
# Prints the name of the WiFi interface MuPiBox should use.
#
#   mupi_wifi_iface.sh [active]   the interface that carries the default route if it is a WiFi
#                                 interface, else the preferred one (see "preferred")
#   mupi_wifi_iface.sh usb        the USB WiFi adapter, empty if there is none
#   mupi_wifi_iface.sh onboard    the built-in (non-USB) WiFi adapter, empty if there is none
#   mupi_wifi_iface.sh preferred  the USB adapter if there is one, else the onboard adapter
#
# The interface names (wlan0, wlan1) depend on which driver loads first, so the adapters are told
# apart by the bus they sit on. Without a USB adapter the result is what it always was: the onboard
# WiFi (and "wlan0" if no WiFi adapter is found at all).

usb=""
onboard=""
for dir in /sys/class/net/wl*; do
	[ -e "${dir}" ] || continue
	name=$(basename "${dir}")
	bus=$(basename "$(readlink -f "${dir}/device/subsystem" 2>/dev/null)")
	if [ "${bus}" = "usb" ]; then
		[ -z "${usb}" ] && usb="${name}"
	else
		[ -z "${onboard}" ] && onboard="${name}"
	fi
done

preferred="${usb:-${onboard:-wlan0}}"

case "$1" in
	usb) echo "${usb}" ;;
	onboard) echo "${onboard}" ;;
	preferred) echo "${preferred}" ;;
	*)
		# The link that is really in use (the onboard adapter keeps running when the USB adapter
		# could not connect).
		routed=$(ip -4 route show default 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "dev") print $(i + 1)}' | head -n 1)
		if [ -n "${routed}" ] && [ -e "/sys/class/net/${routed}/wireless" ]; then
			echo "${routed}"
		else
			echo "${preferred}"
		fi
		;;
esac
