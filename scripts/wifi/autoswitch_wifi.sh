#!/bin/bash
#
# WiFi connect best network
# Version: 1.1
# Author: Olaf Splitt
# Description: This script searches for available WiFi networks, compares them with the configured networks in the wpa_supplicant.conf file, and automatically connects to the best available network.
#
# v1.1: the previous version span up a new wpa_supplicant/dhclient pair on every switch without ever
# killing the old dhclient, leaking one dhclient process per switch (found stacked 9 deep on a live
# box - the actual cause of its intermittent "no IP" symptom). It also compared the wrong scan line
# for "current network quality" (checked against the running best guess, not the current SSID), and
# switched on any margin at all, which flaps between two similarly-strong networks. Now uses
# ifdown/ifup (the same safe, idempotent restart used by mupi_wifi_select.sh - no manual process
# lifecycle to get wrong) and only switches when the best network is a real margin ahead.
#
# v1.2: switching takes several seconds (association + DHCP). The old loop scanned again after a
# fixed 20s regardless, and while the switch was still settling iwgetid returned nothing, which read
# as "current network -100 dBm" - beaten by anything - triggering another switch before the first one
# had even finished. Found on a live box: it chained through three networks, each weaker than the
# last, leaking a dhclient at each hop. Now waits for the new link to actually get an address (or a
# timeout) before it scans again.

sleep 60

LOG="/home/dietpi/autoswitch_wifi.log" # not /tmp: tmpfs, wiped every boot
MARGIN=10 # dBm the best network must beat the current one by before switching (avoids flapping)
SETTLE_SECONDS=40 # time given to a fresh switch to associate and get an address before scanning again
echo $$ > /run/mupi_autoconnect-wifi.pid

has_ip() { ip -4 addr show dev "$1" 2>/dev/null | grep -q "inet "; }
wait_for_ip() {
	local i="$1" seconds="$2" n
	for ((n = 0; n < seconds; n += 2)); do
		has_ip "$i" && return 0
		sleep 2
	done
	return 1
}

while true; do

	# Extract SSIDs from wpa_supplicant.conf
	configured_ssids=$(grep -oP '(?<=ssid=").*?(?=")' /etc/wpa_supplicant/wpa_supplicant.conf | sort -u)

	# The WiFi adapter in use (a USB adapter if there is one, else the onboard one)
	WIFI_IF=$(/usr/local/bin/mupibox/mupi_wifi_iface.sh)

	# Get currently connected network
	current_ssid=$(iwgetid -r)
	current_quality=-100

	# Initialize best network
	best_ssid=""
	best_quality=-100  # Set to a negative minimum

	# Get and process scan results
	while read -r line; do
		ssid=$(echo "$line" | awk '{print $5}')
		quality=$(echo "$line" | awk '{print $3}')
		quality=$((quality+0))  # Convert to integer
		if [[ "$ssid" == "$current_ssid" ]] && ((quality > current_quality)); then
			current_quality=$quality
		fi
		# Match SSID with configured SSIDs
		for configured_ssid in $configured_ssids; do
			if [[ "$ssid" == "$configured_ssid" ]] && ((quality > best_quality)); then
				best_quality=$quality
				best_ssid=$configured_ssid
			fi
		done
	done < <(wpa_cli -i ${WIFI_IF} scan && sleep 2 && wpa_cli -i ${WIFI_IF} scan_results)

	# Print results
	{
		echo "$(date '+%F %T') current: ${current_ssid:-<none>} / ${current_quality}"
		echo "$(date '+%F %T') best:    ${best_ssid:-<none>} / ${best_quality}"
	} > "${LOG}"

	# Switch only if a configured network is both different AND a real margin stronger -
	# a 1-2 dBm lead is noise, not a reason to drop the connection.
	if [[ -n "${best_ssid}" ]] && [[ "${best_ssid}" != "${current_ssid}" ]] && (( best_quality - current_quality >= MARGIN )); then
		echo "$(date '+%F %T') switching to ${best_ssid} (${best_quality} vs ${current_quality})" >> "${LOG}"
		# Same lock file as mupi_wifi_select.sh, so the two never bring the interface up/down at once.
		(
			exec 9> /run/mupi-wifi-select.lock
			flock -w 30 9 || exit 0
			ifdown --force "${WIFI_IF}" >> "${LOG}" 2>&1
			ifup "${WIFI_IF}" >> "${LOG}" 2>&1
		)
		# Let the switch settle (association + DHCP) before the next scan judges it - otherwise a
		# still-connecting link looks like "-100 dBm, beaten by anything" and gets switched away from
		# again before it ever had a chance.
		if wait_for_ip "${WIFI_IF}" "${SETTLE_SECONDS}"; then
			echo "$(date '+%F %T') ${WIFI_IF} settled with an address" >> "${LOG}"
		else
			echo "$(date '+%F %T') ${WIFI_IF} did not get an address within ${SETTLE_SECONDS}s" >> "${LOG}"
		fi
	else
		echo "$(date '+%F %T') no switch needed" >> "${LOG}"
		sleep 20
	fi
done
