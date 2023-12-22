#!/bin/bash

WIFI_FILE="/boot/add_wifi.json"

if [ -f "$WIFI_FILE" ]; then
	SSID=$(/usr/bin/jq -r .ssid ${WIFI_FILE})
	PASSWORD=$(/usr/bin/jq -r .password ${WIFI_FILE})
	sudo rm ${WIFI_FILE}
	if [ "${SSID}" = "Your Wifi-Name" ]; then
		exit
	else
		echo $SSID
	fi
fi
