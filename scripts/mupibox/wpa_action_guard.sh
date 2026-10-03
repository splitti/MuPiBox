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
# What: a "DISCONNECTED" is let go when the box is connected again (within up to 6 s) to the same network it was
# connected to - the DHCP lease is still valid there - and the "CONNECTED" that follows it then keeps the address.
# Connected to another network, or not connected again: Debian's script does as always. "The same network" is
# wpa_supplicant's number of the saved network (WPA_ID of the event, "id=" of its status) with its name: the profile
# (id_str, a fixed address) belongs to that number.

IFACE="$1"
ACTION="$2"
REAL="$(dirname "$0")/wpa_action.distrib"
[ -x "${REAL}" ] || REAL=/usr/sbin/wpa_action.distrib
[ -x "${REAL}" ] || REAL=/sbin/wpa_action.distrib
CTRL="${WPA_CTRL_DIR:-/run/wpa_supplicant}"
LAST="/run/mupibox-wpa.${IFACE}.net"
SKIPPED="/run/mupibox-wpa.${IFACE}.skipped"

log() { logger -t wpa_action "MuPiBox: $*"; }
# the saved network the WiFi is connected to now: "<number> <name>" (empty while it is not connected)
connected_net() {
	s=$(wpa_cli -p "${CTRL}" -i "${IFACE}" status 2>/dev/null)
	echo "${s}" | grep -q '^wpa_state=COMPLETED' || return 0
	id=$(echo "${s}" | sed -n 's/^id=//p')
	[ -n "${id}" ] && echo "${id} $(echo "${s}" | sed -n 's/^ssid=//p')"
}
# the network is the one this event is for (wpa_cli passes its number; without it: yes)
is_event_net() { [ -z "${WPA_ID}" ] || [ "${WPA_ID}" = "${1%% *}" ]; }

case "${ACTION}" in
	DISCONNECTED)
		last=$(cat "${LAST}" 2>/dev/null)
		if [ -n "${last}" ]; then
			i=0
			while [ ${i} -lt 6 ]; do
				net=$(connected_net)
				if [ -n "${net}" ]; then
					if [ "${net}" = "${last}" ]; then
						log "${IFACE} DISCONNECTED let go - connected to \"${net#* }\" again, the address stays"
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
			net=$(connected_net)
			if [ -n "${net}" ] && [ "${net}" = "$(cat "${LAST}" 2>/dev/null)" ] && is_event_net "${net}" &&
				ip -4 addr show dev "${IFACE}" 2>/dev/null | grep -q 'inet '; then
				log "${IFACE} CONNECTED to \"${net#* }\" again - address kept"
				exit 0
			fi
		fi
		;;
esac

# (the network this CONNECTED is for, asked before Debian's script runs - its ifup with DHCP takes seconds)
[ "${ACTION}" = CONNECTED ] && before=$(connected_net)
"${REAL}" "$@"
rc=$?
case "${ACTION}" in
	# The network that is up now: a late DISCONNECTED from it can be let go. Only when the box is still in the network
	# the address was set up for - moved on to another one meanwhile, nothing is noted and that one's events run as
	# always (else the address of the first one would have been kept in the other).
	CONNECTED)
		after=$(connected_net)
		if [ ${rc} -eq 0 ] && [ -n "${after}" ] && [ "${after}" = "${before}" ] && is_event_net "${after}"; then
			echo "${after}" > "${LAST}"
		else
			rm -f "${LAST}" "${SKIPPED}"
		fi
		;;
	DISCONNECTED | stop | down) rm -f "${LAST}" "${SKIPPED}" ;;
esac
exit ${rc}
