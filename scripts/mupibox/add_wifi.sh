#!/bin/bash
#

MUPIWIFI="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/wlan.json"
WPACONF="/etc/wpa_supplicant/wpa_supplicant.conf"
TMP_WPACONF="/tmp/wpa_supplicant.conf"
NETWORKCONFIG="/tmp/network.json"
NETWORKINTERFACES="/etc/network/interfaces"
ONLINESTATE=$(/usr/bin/jq -r .onlinestate ${NETWORKCONFIG})

restart_network() {
	#sudo service wpa_supplicant restart
	#sudo service networking restart
	#sudo service ifup@wlan0 restart
	#sudo service ifup@wlan0 start
	#sudo dhclient -r
	#sudo dhclient
	sudo wpa_cli -i wlan0 reconfigure
}

while true
do
	if test -f "${MUPIWIFI}"
	then
		SSID="$(/usr/bin/jq -r .[].ssid ${MUPIWIFI})"
		PSK="$(/usr/bin/jq -r .[].pw ${MUPIWIFI})"
		if [ "${SSID}" = "" ]
		then
			sudo rm ${MUPIWIFI}
		elif [ "${SSID}" = "clear" ]
		then
			sudo rm ${TMP_WPACONF} > /dev/null 2>&1
			echo '# Grant all members of group "netdev" permissions to configure WiFi, e.g. via wpa_cli or wpa_gui' | sudo tee -a ${TMP_WPACONF}
			echo 'ctrl_interface=DIR=/run/wpa_supplicant GROUP=netdev' | sudo tee -a ${TMP_WPACONF}
			echo '# Allow wpa_cli/wpa_gui to overwrite this config file' | sudo tee -a ${TMP_WPACONF}
			echo 'update_config=1' | sudo tee -a ${TMP_WPACONF}
			echo 'bgscan="simple:30:-70:60"' | sudo tee -a ${TMP_WPACONF}
			#echo 'roam_timeout=5' | sudo tee -a ${TMP_WPACONF}
			#echo 'disable_pm=1' | sudo tee -a ${TMP_WPACONF}
			echo 'ap_scan=1' | sudo tee -a ${TMP_WPACONF}
			sudo mv -f ${TMP_WPACONF} ${WPACONF}
			sudo chmod 600 ${WPACONF}
			sudo chown root:root ${WPACONF}
			restart_network
		elif [ "${PSK}" = "" ]
		then
			echo 'network={' | sudo tee -a ${WPACONF}
			echo '	ssid="'${SSID}'"' | sudo tee -a ${WPACONF}
			echo '	scan_ssid=1' | sudo tee -a ${WPACONF}
			echo '}' | sudo tee -a ${WPACONF}
			restart_network
		else
			WIFI_RESULT=$(sudo -i wpa_passphrase "${SSID}" "${PSK}")
			IFS=$'\n'
			i=0
			new_line='scan_ssid=1'
			# Ersetze mit sed und füge die Zeile hinzu
			WIFI_RESULT=$(echo "$WIFI_RESULT" | sed '/#psk=.*$/a\'$'\n'"\t$new_line")
			#echo $WIFI_RESULT
			for LINES in ${WIFI_RESULT}
			do
					i=$((i+1))
					if [ "${i}" = "1" ] || [ "${i}" = "2" ] || [ "${i}" = "4" ] || [ "${i}" = "5" ] || [ "${i}" = "6" ]; then
						echo $LINES | sudo tee -a ${WPACONF}
					fi
			done
			unset IFS
			restart_network
		fi
		sudo rm ${MUPIWIFI}
	fi
	sleep 60
done
