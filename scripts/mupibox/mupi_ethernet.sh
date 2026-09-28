#!/bin/bash
#
# LAN without waiting: at every start the box waited up to 12 s for an address over a cable that was not plugged in
# (ifup@eth0 comes before network.target, and the display only started after it), and a cable plugged in later only
# got an address at dhclient's next try, minutes later. Now the address is asked for when the cable has a link: at
# the start in the background (nothing waits for it) and at once when a cable is plugged in. ifup@eth0.service does
# nothing any more (see ifup@eth0.service.d/mupibox.conf). Run by mupi_ethernet.service.
#
# Also re-runs mupi_wifi_select.sh on every transition, so LAN vs WiFi priority for the default route (USB WiFi
# preferred over onboard, LAN preferred over both once it has an address) is re-evaluated the moment the cable
# state actually changes - a udev rule (99-mupibox-eth.rules) does the same for boards whose ethernet driver
# emits a uevent for it, but this board's does not (confirmed live: "udevadm monitor" stayed silent through
# several unplug/replug cycles), so this script - which already reacts to the same "ip monitor link" event
# for its own purposes above - is the one place that reliably catches it here.

IF="${1:-eth0}"
[ -d "/sys/class/net/${IF}" ] || exit 0

# LAN switched off (WiFi settings / the app, /api/network/ethernet/power): the port stays down while this file
# exists, also after a restart. Without it, a port set down read as a pulled cable below and was set up again at once.
LAN_OFF=/etc/mupibox/lan.off
lan_off() { [ -e "${LAN_OFF}" ]; }

# the link is only seen (carrier) while the interface is up
if lan_off; then
	ip link set "${IF}" down 2>/dev/null
else
	ip link set "${IF}" up 2>/dev/null
fi
LINK=0

# (never ifdown here: it takes the link down, which would read as a pulled cable)
connect() {
	(
		ifquery --state "${IF}" >/dev/null 2>&1 || ifup --allow=hotplug "${IF}" >/dev/null 2>&1
		/usr/local/bin/mupibox/mupi_wifi_select.sh
	) &
}

check() {
	if lan_off; then
		# switched off: nothing to connect, and the port is not set up again as after a pulled cable
		if [ "${LINK}" = "1" ]; then
			LINK=0
			ifdown --force "${IF}" >/dev/null 2>&1
			ip link set "${IF}" down 2>/dev/null
			/usr/local/bin/mupibox/mupi_wifi_select.sh &
		fi
		return
	fi
	if [ "$(cat "/sys/class/net/${IF}/carrier" 2>/dev/null)" = "1" ]; then
		if [ "${LINK}" != "1" ]; then
			LINK=1
			connect
		fi
	elif [ "${LINK}" = "1" ]; then
		# cable pulled: give the address up, keep the interface up to see the next cable
		LINK=0
		ifdown --force "${IF}" >/dev/null 2>&1
		ip link set "${IF}" up 2>/dev/null
		/usr/local/bin/mupibox/mupi_wifi_select.sh &
	fi
}

check
ip -o monitor link dev "${IF}" | while read -r _; do
	check
done
