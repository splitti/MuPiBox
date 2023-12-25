#!/bin/bash

#JSON_TEMPLATE="https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/add_wifi.json"
WIFI_FILE="/boot/add_wifi.json"
FIRST_INSTALL="/home/dietpi/.mupi.install"
WPACONF="/etc/wpa_supplicant/wpa_supplicant.conf"
MUPIBOX_CONFIG="/etc/mupibox/mupiboxconfig.json"
NETWORKCONFIG="/tmp/network.json"

init_add_wifi () {
	sudo rm ${WIFI_FILE} > /dev/null
	sudo touch ${WIFI_FILE}
	echo '{' | sudo tee -a ${WIFI_FILE}
	echo ' "ssid": "Your Wifi-Name",' | sudo tee -a ${WIFI_FILE}
	echo ' "password": "Your Wifi-Password"' | sudo tee -a ${WIFI_FILE}
	echo '}' | tee -a ${WIFI_FILE}
}

### Check for new wifi network in /boot/add_wifi.json

if [ -f "$WIFI_FILE" ]; then
	SSID=$(/usr/bin/jq -r .ssid ${WIFI_FILE})
	PSK=$(/usr/bin/jq -r .password ${WIFI_FILE})
	if [ "${SSID}" != "" ] || [ "${PSK}" != "" ]; then
		init_add_wifi
	elif [ "${SSID}" != "Your Wifi-Name" ; then
		#sudo wget -q -O ${WIFI_FILE} ${JSON_TEMPLATE}
		WIFI_RESULT=$(sudo -i wpa_passphrase "${SSID}" "${PSK}") 
		IFS=$'\n'
		i=0
		for LINES in ${WIFI_RESULT}
		do
				i=$((i+1))
				if [ "${i}" = "1" ] || [ "${i}" = "2" ] || [ "${i}" = "4" ] || [ "${i}" = "5" ]; then
					echo $LINES | sudo tee -a ${WPACONF}
				fi
		done
		unset IFS
		init_add_wifi
		ONLINESTATE=$(/usr/bin/jq -r .onlinestate ${NETWORKCONFIG})
		if [ ${ONLINESTATE} != "online" ]; then
			sudo service ifup@wlan0 stop
			sudo service ifup@wlan0 start
			sudo dhclient -r
			sudo dhclient
		fi
		sleep 5
		ONLINESTATE=$(/usr/bin/jq -r .onlinestate ${NETWORKCONFIG})
		if [ ${ONLINESTATE} != "online" ]; then
			sudo reboot
		fi
	fi
else
	init_add_wifi
fi

### Wait for internet connection and make final install-steps

sleep 5
ONLINESTATE=$(/usr/bin/jq -r .onlinestate ${NETWORKCONFIG})
if [ ${ONLINESTATE} != "online" ]; then
	sudo service ifup@wlan0 stop
	sudo service ifup@wlan0 start
	sudo dhclient -r
	sudo dhclient
fi
while [ ${ONLINESTATE} != "online" ]; do
	sleep 15
	ONLINESTATE=$(sudo /usr/bin/jq -r .onlinestate ${NETWORKCONFIG})
done
if [ -f "$FIRST_INSTALL" ] && [ ${ONLINESTATE} = "online" ]; then
	VERSION=$(sudo /usr/bin/jq -r .mupibox.version ${MUPIBOX_CONFIG})
	CPU=$(cat /proc/cpuinfo | grep Serial | cut -d ":" -f2 | sed 's/^ //')
	STATE=$(curl -s -X POST https://mupibox.de/mupi/ct.php -H "Content-Type: application/x-www-form-urlencoded" -d key1=${CPU} -d key2=Installation -d key3="${VERSION}")
	if [ "$STATE" = "OK" ]; then
		rm ${FIRST_INSTALL}
	fi
fi
