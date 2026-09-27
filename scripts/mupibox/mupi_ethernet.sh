#!/bin/bash
#
# LAN without waiting: at every start the box waited up to 12 s for an address over a cable that was not plugged in
# (ifup@eth0 comes before network.target, and the display only started after it), and a cable plugged in later only
# got an address at dhclient's next try, minutes later. Now the address is asked for when the cable has a link: at
# the start in the background (nothing waits for it) and at once when a cable is plugged in. ifup@eth0.service does
# nothing any more (see ifup@eth0.service.d/mupibox.conf). Run by mupi_ethernet.service.

IF="${1:-eth0}"
[ -d "/sys/class/net/${IF}" ] || exit 0

# the link is only seen (carrier) while the interface is up
ip link set "${IF}" up 2>/dev/null
LINK=0

# (never ifdown here: it takes the link down, which would read as a pulled cable)
connect() {
	ifquery --state "${IF}" >/dev/null 2>&1 || ifup --allow=hotplug "${IF}" >/dev/null 2>&1 &
}

check() {
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
	fi
}

check
ip -o monitor link dev "${IF}" | while read -r _; do
	check
done
