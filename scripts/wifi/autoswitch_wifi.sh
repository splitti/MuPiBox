#!/bin/bash
#
# WiFi connect best networtk
# Version: 1.0
# Author: Olaf Splitt
# Description: This script searches for available WiFi networks, compares them with the configured networks in the wpa_supplicant.conf file, and automatically connects to the best available network.

LOG="/tmp/autoswitch_wifi.log"
echo $! > /var/run/mupi_autoconnect-wifi.pid
touch > ${LOG}
chmod 755 ${LOG}

while true; do


	# Extract SSIDs from wpa_supplicant.conf
	configured_ssids=$(grep -oP '(?<=ssid=").*?(?=")' /etc/wpa_supplicant/wpa_supplicant.conf)

	# Get currently connected network
	current_ssid=$(iwgetid -r)

	# Initialize best network
	best_ssid=""
	best_quality=-100  # Set to a negative minimum

	# Get and process scan results
	while read -r line; do
		ssid=$(echo "$line" | awk '{print $5}')
		# Match SSID with configured SSIDs
		for configured_ssid in $configured_ssids; do
			if [[ "$ssid" == "$configured_ssid" ]]; then
				quality=$(echo "$line" | awk '{print $3}')
				quality=$((quality+0))  # Convert to integer
				if [[ "$best_ssid" == "$current_ssid" ]]; then
					current_quality=$quality
				fi
				# Better quality than current best network?
				if ((quality > best_quality)); then
					best_quality=$quality
					best_ssid=$configured_ssid
				fi
			fi
		done
	done < <(wpa_cli -i wlan0 scan && wpa_cli -i wlan0 scan_results)

	# Print results
	echo "Current network:  $current_ssid / $current_quality" > ${LOG}
	echo "Best network:     $best_ssid / $best_quality" >> ${LOG}

	# Connect to the best network
	if [[ -n $best_ssid ]]; then
		if [[ "$best_ssid" != "$current_ssid" ]]; then
			killall wpa_supplicant >> ${LOG}
			rm /run/wpa_supplicant.wlan0.pid >> ${LOG}
			/sbin/wpa_supplicant -s -B -P /run/wpa_supplicant.wlan0.pid -i wlan0 -D nl80211,wext -c /etc/wpa_supplicant/wpa_supplicant.conf & >> /tmp/autoswitch_wifi.log
			#wpa_supplicant -B -i wlan0 -c /etc/wpa_supplicant/wpa_supplicant.conf -D wext -W -B & >> /tmp/autoswitch_wifi.log
			dhclient wlan0 >> ${LOG}
			echo "Switching to $best_ssid" >> ${LOG}
		else
			echo "No switch needed" >> ${LOG}
		fi
	else
		echo "No configured network in range found." >> ${LOG}
	fi
	sleep 10
done