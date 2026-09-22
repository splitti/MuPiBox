#!/bin/bash
#
# A USB WiFi adapter is preferred: while one is plugged in and connected, the onboard WiFi is switched
# off. The onboard WiFi only takes over when the USB adapter is missing (or cannot connect).
#
# Started at boot and by udev whenever a WiFi interface appears or disappears. Make before break:
# the onboard link is only taken down after the USB link has an address, the default route and reaches
# the router; if the USB link does not hold up afterwards, the onboard WiFi is brought back.

IFACE_TOOL="/usr/local/bin/mupibox/mupi_wifi_iface.sh"
LOG="/home/dietpi/mupi_wifi_select.log" # not in /tmp or /var/log: both are RAM disks that are emptied at every boot
WAIT_SECONDS=60

# Events for both adapters arrive within a moment: run one after the other, the last one sees the final state.
# The lock file is closed again (9>&-) for everything started below: the WiFi programs that ifup starts in the
# background (wpa_supplicant, dhclient) keep running after this script, and would keep the lock for ever.
exec 9> /run/mupi-wifi-select.lock
flock -w 180 9 || exit 0

log() { echo "$(date '+%F %T') $*" >> "${LOG}"; }
has_ip() { ip -4 addr show dev "$1" 2>/dev/null | grep -q "inet "; }

# The router: from any default route, else from a DHCP lease (a second adapter in the same network does
# not get its own default route while the first one still has it).
router_address() {
	local gw
	gw=$(ip -4 route show default 2>/dev/null | awk '{print $3}' | head -n 1)
	if [ -z "${gw}" ]; then
		gw=$(grep -h "option routers" /var/lib/dhcp/dhclient*.leases* 2>/dev/null | tail -n 1 | awk '{gsub(";", "", $3); print $3}')
	fi
	echo "${gw}"
}
reaches_router() {
	local gw
	gw=$(router_address)
	[ -n "${gw}" ] && ping -nqc 2 -W 2 -I "$1" "${gw}" > /dev/null 2>&1
}

wait_for_ip() {
	local i="$1" seconds="$2" n
	for ((n = 0; n < seconds; n += 2)); do
		has_ip "$i" && return 0
		sleep 2
	done
	return 1
}

# Brings an interface up and waits for an address.
# - An adapter that is already being brought up (its wpa_supplicant runs: hotplug at boot, or another
#   udev event for the same adapter) is NOT restarted - that broke a link that was just coming up.
#   It is waited for; if it is connected but got no address, the address request is started here
#   (in roaming mode it comes from the wpa_action hook, "ifup <interface>=default").
# - ifupdown keeps its own idea of what is up ("ifup: interface wlan0 already configured") and refuses to
#   start an interface it thinks is up even if the link is dead - the state after an adapter was taken
#   down or unplugged. Only then the state is cleared first (ifdown --force) and the interface started.
bring_up() {
	local i="$1"
	if has_ip "$i"; then
		return 0
	fi
	if pgrep -f "wpa_supplicant.* -i ${i} " > /dev/null; then
		log "$i is being brought up - waiting"
		wait_for_ip "$i" 30 && return 0
		if wpa_cli -i "$i" status 2>/dev/null | grep -q "wpa_state=COMPLETED"; then
			log "$i is connected but has no address - requesting one"
			ifup "$i=default" >> "${LOG}" 2>&1 9>&-
			wait_for_ip "$i" 20 && return 0
		fi
	else
		ifdown --force "$i" >> "${LOG}" 2>&1 9>&-
		ifup "$i" >> "${LOG}" 2>&1 9>&-
		wait_for_ip "$i" 40 && return 0
	fi
	log "$i got no address"
	return 1
}

sleep 3 # let the driver finish setting up the adapter
usb=$("${IFACE_TOOL}" usb)
onboard=$("${IFACE_TOOL}" onboard)
log "usb='${usb}' onboard='${onboard}'"

if [ -z "${usb}" ]; then
	# No USB adapter: the onboard WiFi has to be up.
	if [ -n "${onboard}" ] && ! has_ip "${onboard}"; then
		log "no USB adapter - bringing up ${onboard}"
		bring_up "${onboard}"
	fi
	exit 0
fi

# USB adapter present: connect it first.
if ! has_ip "${usb}"; then
	log "bringing up ${usb}"
	bring_up "${usb}"
fi
for ((i = 0; i < WAIT_SECONDS; i += 2)); do
	if has_ip "${usb}" && reaches_router "${usb}"; then
		break
	fi
	sleep 2
done

if ! { has_ip "${usb}" && reaches_router "${usb}"; }; then
	# The USB adapter did not connect (no known network in reach): the onboard WiFi stays as it is.
	log "${usb} did not connect within ${WAIT_SECONDS} s - keeping ${onboard:-nothing} up"
	if [ -n "${onboard}" ] && ! has_ip "${onboard}"; then
		bring_up "${onboard}"
	fi
	exit 0
fi

if [ -n "${onboard}" ] && [ "${onboard}" != "${usb}" ] && has_ip "${onboard}"; then
	gw=$(router_address)
	log "${usb} is connected - default route to ${gw} via ${usb}, taking ${onboard} down"
	ip route replace default via "${gw}" dev "${usb}" >> "${LOG}" 2>&1
	ifdown "${onboard}" >> "${LOG}" 2>&1 9>&-
	# The onboard link is gone: is the box still reachable through the USB adapter? A short outage
	# (something else may restart the link right now) is waited for before the onboard WiFi is brought back.
	reachable=0
	for ((i = 0; i < 20; i += 2)); do
		sleep 2
		if reaches_router "${usb}"; then
			reachable=1
			break
		fi
	done
	if [ "${reachable}" -ne 1 ]; then
		log "${usb} does not reach the router without ${onboard} - bringing ${onboard} back"
		bring_up "${onboard}"
	fi
elif [ -n "${gw:=$(router_address)}" ] && ! ip -4 route show default dev "${usb}" | grep -q default; then
	# Only the USB adapter is up: it needs the default route itself.
	ip route replace default via "${gw}" dev "${usb}" >> "${LOG}" 2>&1
fi
exit 0
