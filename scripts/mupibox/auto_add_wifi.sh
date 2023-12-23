#!/bin/bash

JSON_TEMPLATE="https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/add_wifi.json"
WIFI_FILE="/boot/add_wifi.json"
FIRST_INSTALL="/boot/mupi.install"
WPACONF="/etc/wpa_supplicant/wpa_supplicant.conf"
MUPIBOX_CONFIG="/etc/mupibox/mupiboxconfig.json"

if [ -f "$WIFI_FILE" ]; then
	SSID=$(/usr/bin/jq -r .ssid ${WIFI_FILE})
	PSK=$(/usr/bin/jq -r .password ${WIFI_FILE})
	if [ "${SSID}" != "Your Wifi-Name" ]; then
		sudo rm ${WIFI_FILE}
		sudo wget -q -O ${WIFI_FILE} ${JSON_TEMPLATE}
		sudo -i wpa_passphrase "${SSID}" "${PSK}" >> ${WPACONF}
	fi
else
	sudo wget -q -O ${WIFI_FILE} ${JSON_TEMPLATE}	
fi

sleep 30
if [ -f "$FIRST_INSTALL" ]; then
	sudo rm ${FIRST_INSTALL}
	VERSION=$(/usr/bin/jq -r .mupibox.version ${MUPIBOX_CONFIG})
	CPU=$(cat /proc/cpuinfo | grep Serial | cut -d ":" -f2 | sed 's/^ //')
	curl -X POST https://mupibox.de/mupi/ct.php -H "Content-Type: application/x-www-form-urlencoded" -d key1=${CPU} -d key2=Installation -d key3="${VERSION}"
fi
