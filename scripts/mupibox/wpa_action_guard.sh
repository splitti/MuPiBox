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
# Connected to another saved network meanwhile: let go as well, the CONNECTED of that one sets up its address. Not
# connected again: Debian's script does as always. While a new network is tried (add_wifi.sh), a DISCONNECTED of that
# adapter is let go without waiting. "The same network" is
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
		# A new network is tried on this adapter (add_wifi.sh, try_network): it left the network it was in on purpose,
		# and the try ends connected - to the new one, or back in the one before. Not let go, Debian's ifdown took the
		# adapter down whenever the new connection took longer than the wait below: a USB stick (rtl8192cu) did not find
		# any network after that until it was pulled out. Let go; the CONNECTED that follows keeps the address (back in
		# the same network) or sets up the new one's.
		if [ -f /run/mupibox-wifi-try ] && [ "$(/usr/local/bin/mupibox/mupi_wifi_iface.sh 2>/dev/null)" = "${IFACE}" ]; then
			log "${IFACE} DISCONNECTED let go - a new network is tried"
			[ -n "${last}" ] && : > "${SKIPPED}"
			exit 0
		fi
		i=0
		while [ ${i} -lt 6 ]; do
			net=$(connected_net)
			if [ -n "${net}" ]; then
				if [ -n "${last}" ] && [ "${net}" = "${last}" ]; then
					log "${IFACE} DISCONNECTED let go - connected to \"${net#* }\" again, the address stays"
					: > "${SKIPPED}"
					exit 0
				fi
				# The box moved to another saved network meanwhile (a new one tried, wpa_supplicant's choice): this event is
				# the late one of the network left. Its ifdown took the link down - the new connection with it - and the
				# box came back in the other network, whose late event did the same: a circle between the two, every ~10 s
				# (seen with two networks in reach). Let go: the CONNECTED of the new network follows and sets up its
				# address (Debian's ifup --force for wpa-roam, a new DHCP lease without taking the link down).
				if [ -n "${WPA_ID}" ] && [ "${WPA_ID}" != "${net%% *}" ]; then
					log "${IFACE} DISCONNECTED of network ${WPA_ID} let go - connected to \"${net#* }\" meanwhile"
					rm -f "${SKIPPED}" "${LAST}"
					exit 0
				fi
				break
			fi
			# (nothing to compare: the event goes to Debian's script without waiting, as before)
			[ -n "${last}" ] || [ -n "${WPA_ID}" ] || break
			sleep 1
			i=$((i + 1))
		done
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
		# Not connected yet before it (an ifdown of ours had just taken the link down, ifup brought it back): the address
		# is from the network that is up now as well. Noting nothing here kept the circle going: the late DISCONNECTED
		# came with nothing to compare, its ifdown took the working connection down, again and again.
		if [ ${rc} -eq 0 ] && [ -n "${after}" ] && { [ -z "${before}" ] || [ "${after}" = "${before}" ]; } && is_event_net "${after}"; then
			echo "${after}" > "${LAST}"
		else
			rm -f "${LAST}" "${SKIPPED}"
		fi
		;;
	DISCONNECTED | stop | down) rm -f "${LAST}" "${SKIPPED}" ;;
esac
exit ${rc}
