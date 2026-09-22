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

sleep 60

LOG="/home/dietpi/autoswitch_wifi.log" # not /tmp: tmpfs, wiped every boot
MARGIN=10 # dBm the best network must beat the current one by before switching (avoids flapping)
echo $$ > /run/mupi_autoconnect-wifi.pid

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
	else
		echo "$(date '+%F %T') no switch needed" >> "${LOG}"
	fi
	sleep 20
done
