#!/bin/bash
#

MUPIWIFI="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/wlan.json"
WPACONF="/etc/wpa_supplicant/wpa_supplicant.conf"
NETWORKCONFIG="/tmp/network.json"
ONLINESTATE=$(/usr/bin/jq -r .onlinestate ${NETWORKCONFIG})

while true
do
	if test -f "${MUPIWIFI}"; then
		SSID=$(/usr/bin/jq -r .[].ssid ${MUPIWIFI})
		PSK=$(/usr/bin/jq -r .[].pw ${MUPIWIFI})
		if [ "${SSID}" != "" ] || [ "${PSK}" != "" ]; then
			sudo rm ${MUPIWIFI}
		elif [ ${SSID} = "all" ] && [ ${PSK} = "clear"  ]
		then
			sudo rm ${WPACONF}
			cat << _EOF_ >> ${WPACONF}
# Grant all members of group "netdev" permissions to configure WiFi, e.g. via wpa_cli or wpa_gui
ctrl_interface=DIR=/run/wpa_supplicant GROUP=netdev
# Allow wpa_cli/wpa_gui to overwrite this config file
update_config=1


_EOF_
		else
			#sudo -i wpa_passphrase "${SSID}" "${PSK}" >> ${WPACONF}
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
			if [ ${ONLINESTATE} != "online" ]; then
				#sudo dhclient -r
				sudo service ifup@wlan0 stop
				sudo service ifup@wlan0 start
				#sudo dhclient
			fi
		fi
		sudo rm ${MUPIWIFI} > /dev/null
	fi
	sleep 2
done