#!/bin/bash
#
# A USB WiFi adapter is preferred: while one is plugged in and connected, the onboard WiFi is switched
# off. The onboard WiFi only takes over when the USB adapter is missing (or cannot connect).
#
# Started at boot and by udev whenever a WiFi interface appears or disappears. Make before break:
# the onboard link is only taken down after the USB link has an address, the default route and reaches
# the router; if the USB link does not hold up afterwards, the onboard WiFi is brought back.

IFACE_TOOL="/usr/local/bin/mupibox/mupi_wifi_iface.sh"
LOG="/var/log/mupi_wifi_select.log" # not in /tmp: it has to survive a reboot
WAIT_SECONDS=60

# Events for both adapters arrive within a moment: run one after the other, the last one sees the final state.
exec 9> /run/mupi_wifi_select.lock
flock -w 180 9 || exit 0

log() { echo "$(date '+%F %T') $*" >> "${LOG}"; }
has_ip() { ip -4 addr show dev "$1" 2>/dev/null | grep -q "inet "; }

# ifupdown keeps its own idea of what is up ("ifup: interface wlan0 already configured") and refuses to
# start an interface it thinks is up, even if the link is dead - which is exactly the state after an
# adapter was taken down or unplugged. Clear that state first, then start the interface.
bring_up() {
	ifdown --force "$1" >> "${LOG}" 2>&1
	ifup "$1" >> "${LOG}" 2>&1
	for ((n = 0; n < 40; n += 2)); do
		has_ip "$1" && return 0
		sleep 2
	done
	log "$1 got no address within 40 s"
	return 1
}

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
	ifdown "${onboard}" >> "${LOG}" 2>&1
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
