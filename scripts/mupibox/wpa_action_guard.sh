#!/bin/sh
#
# MuPiBox: in front of Debian's wpa_action (the action script of "wpa-roam" in /etc/network/interfaces), put there
# with dpkg-divert by mupi_wpa_guard.sh - Debian's own script is called as wpa_action.distrib.
#
# Why: wpa_cli hands the WiFi events to wpa_action one after the other, and an event waits while the one before runs
# (ifup with DHCP takes seconds). When an access point dropped the box once at the start, the "DISCONNECTED" came to
# wpa_action only after the box was connected again - and its "ifdown" took the working connection down. That ifdown
# disconnected the WiFi itself, which was the next late "DISCONNECTED": a circle, the box went back and forth between
# two access points and had its network only after ~45 s instead of ~10 s.
#
# What: a "DISCONNECTED" is let go when the box is connected again (within up to 6 s) to the same network (SSID) it
# was connected to - the DHCP lease is still valid there - and the "CONNECTED" that follows it then keeps the address.
# Connected to another network, or not connected again: Debian's script does as always.

IFACE="$1"
ACTION="$2"
REAL="$(dirname "$0")/wpa_action.distrib"
[ -x "${REAL}" ] || REAL=/usr/sbin/wpa_action.distrib
[ -x "${REAL}" ] || REAL=/sbin/wpa_action.distrib
CTRL="${WPA_CTRL_DIR:-/run/wpa_supplicant}"
LAST="/run/mupibox-wpa.${IFACE}.ssid"
SKIPPED="/run/mupibox-wpa.${IFACE}.skipped"

log() { logger -t wpa_action "MuPiBox: $*"; }
# the network the WiFi is connected to now (empty while it is not)
connected_ssid() {
	s=$(wpa_cli -p "${CTRL}" -i "${IFACE}" status 2>/dev/null)
	echo "${s}" | grep -q '^wpa_state=COMPLETED' && echo "${s}" | sed -n 's/^ssid=//p'
}

case "${ACTION}" in
	DISCONNECTED)
		last=$(cat "${LAST}" 2>/dev/null)
		if [ -n "${last}" ]; then
			i=0
			while [ ${i} -lt 6 ]; do
				ssid=$(connected_ssid)
				if [ -n "${ssid}" ]; then
					if [ "${ssid}" = "${last}" ]; then
						log "${IFACE} DISCONNECTED let go - connected to \"${ssid}\" again, the address stays"
						: > "${SKIPPED}"
						exit 0
					fi
					break
				fi
				sleep 1
				i=$((i + 1))
			done
		fi
		rm -f "${SKIPPED}"
		;;
	CONNECTED)
		if [ -f "${SKIPPED}" ]; then
			rm -f "${SKIPPED}"
			ssid=$(connected_ssid)
			if [ -n "${ssid}" ] && [ "${ssid}" = "$(cat "${LAST}" 2>/dev/null)" ] && ip -4 addr show dev "${IFACE}" 2>/dev/null | grep -q 'inet '; then
				log "${IFACE} CONNECTED to \"${ssid}\" again - address kept"
				exit 0
			fi
		fi
		;;
esac

"${REAL}" "$@"
rc=$?
case "${ACTION}" in
	# (the network that is up now: a late DISCONNECTED from it can be let go)
	CONNECTED) [ ${rc} -eq 0 ] && connected_ssid > "${LAST}" ;;
	DISCONNECTED | stop | down) rm -f "${LAST}" "${SKIPPED}" ;;
esac
exit ${rc}
