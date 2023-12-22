#!/bin/bash

JSON_TEMPLATE="https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/add_wifi.json"
WIFI_FILE="/boot/add_wifi.json"
WPACONF="/etc/wpa_supplicant/wpa_supplicant.conf"

if [ -f "$WIFI_FILE" ]; then
	SSID=$(/usr/bin/jq -r .ssid ${WIFI_FILE})
	PSK=$(/usr/bin/jq -r .password ${WIFI_FILE})
	if [ "${SSID}" = "Your Wifi-Name" ]; then
		exit
	else
		sudo rm ${WIFI_FILE}
		sudo wget -q -O ${WIFI_FILE} ${JSON_TEMPLATE}
		sudo -i wpa_passphrase "${SSID}" "${PSK}" >> ${WPACONF}
	fi
else
	sudo wget -q -O ${WIFI_FILE} ${JSON_TEMPLATE}	
fi
