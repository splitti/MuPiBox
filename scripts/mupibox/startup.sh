#!/bin/bash

#JSON_TEMPLATE="https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/add_wifi.json"
WIFI_FILE="/boot/add_wifi.json"
FIRST_INSTALL="/home/dietpi/.mupi.install"
WPACONF="/etc/wpa_supplicant/wpa_supplicant.conf"
MUPIBOX_CONFIG="/etc/mupibox/mupiboxconfig.json"
NETWORKCONFIG="/tmp/network.json"
RESIZE_SERVICE="/etc/systemd/system/local-fs.target.wants/dietpi-fs_partition_resize.service"

restart_network() {
	sudo service ifup@wlan0 stop
	sudo service ifup@wlan0 start
	#sudo dhclient -r
	#sudo dhclient
	sudo wpa_cli -i wlan0 reconfigure
}

init_add_wifi () {
	sudo rm ${WIFI_FILE}
	sudo touch ${WIFI_FILE}
	echo '{' | sudo tee -a ${WIFI_FILE}
	echo ' "ssid": "Your Wifi-Name",' | sudo tee -a ${WIFI_FILE}
	echo ' "password": "Your Wifi-Password"' | sudo tee -a ${WIFI_FILE}
	echo '}' | sudo tee -a ${WIFI_FILE}
}


if [ -f "$RESIZE_SERVICE" ]; then
	sudo systemctl disable dietpi-fs_partition_resize
fi

### Check for new wifi network in /boot/add_wifi.json

if [ -f "$WIFI_FILE" ]; then
	SSID="$(/usr/bin/jq -r .ssid ${WIFI_FILE})"
	PSK="$(/usr/bin/jq -r .password ${WIFI_FILE})"
	if [ "${SSID}" = "" ] || [ "${PSK}" = "" ]; then
		init_add_wifi
	elif [ "${SSID}" = "clear" ] && [ "${PSK}" = "all"  ]; then
		init_add_wifi
		sudo rm ${WPACONF}
		sudo touch ${WPACONF}
		echo '# Grant all members of group "netdev" permissions to configure WiFi, e.g. via wpa_cli or wpa_gui' | sudo tee -a ${WPACONF}
		echo 'ctrl_interface=DIR=/run/wpa_supplicant GROUP=netdev' | sudo tee -a ${WPACONF}
		echo '# Allow wpa_cli/wpa_gui to overwrite this config file' | sudo tee -a ${WPACONF}
		echo 'update_config=1' | sudo tee -a ${WPACONF}
		restart_network
	elif [ "${SSID}" != "Your Wifi-Name" ]; then
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
		restart_network
		sleep 8
		sudo reboot
	fi
else
	init_add_wifi
fi

### Wait for internet connection and make final install-steps

sleep 5
ONLINESTATE=$(/usr/bin/jq -r .onlinestate ${NETWORKCONFIG})
if [ ${ONLINESTATE} != "online" ]; then
	restart_network
fi
while [ ${ONLINESTATE} != "online" ]; do
	sleep 15
	ONLINESTATE=$(sudo /usr/bin/jq -r .onlinestate ${NETWORKCONFIG})
done
if [ -f "$FIRST_INSTALL" ] && [ ${ONLINESTATE} = "online" ]; then
	OS="$(grep -E '^(VERSION_CODENAME)=' /etc/os-release)"
	OS="${OS:17}"
	ARCH=$(uname -m) 
	VERSION=$(sudo /usr/bin/jq -r .mupibox.version ${MUPIBOX_CONFIG})
	CPU=$(cat /proc/cpuinfo | grep Serial | cut -d ":" -f2 | sed 's/^ //')
	STATE=$(curl -X POST https://mupibox.de/mupi/ct.php -H "Content-Type: application/x-www-form-urlencoded" -d key1=${CPU} -d key2="Image Installation" -d key3="${VERSION}" -d key4="${ARCH}" -d key5="${OS}")
	if [ "$STATE" = "OK" ]; then
		rm ${FIRST_INSTALL}
	fi
fi
