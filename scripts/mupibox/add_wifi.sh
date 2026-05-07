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
		# HIGH-11: previous filter was `jq -r .[].ssid` which iterates and
		# emits N newline-separated SSIDs when the array has N entries.
		# wpa_passphrase / the "network={ ssid=…" emit below then receive
		# a multi-line string and write garbage into wpa_supplicant.conf.
		# The frontend always queues exactly one entry per save event, so
		# pin to index 0; if there are leftover entries they're picked up
		# on the next loop iteration after `sudo rm ${MUPIWIFI}` clears
		# the file.
		SSID="$(/usr/bin/jq -r '.[0].ssid // empty' ${MUPIWIFI})"
		PSK="$(/usr/bin/jq -r '.[0].pw // empty' ${MUPIWIFI})"
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
			# HIGH-12: previous code spliced ${SSID} unquoted into a
			# single-quoted echo, so an SSID containing `"` or a newline
			# could escape the quoted string and inject arbitrary blocks
			# into wpa_supplicant.conf (root-owned, security-relevant).
			# Use wpa_passphrase's open-network shape via printf with %s,
			# which can't be reinterpreted by the shell, then escape any
			# embedded `"` for the JSON-style ssid field.
			# Reject SSIDs containing characters wpa_supplicant.conf can't
			# represent (newlines / NUL) outright.
			if [[ "${SSID}" == *$'\n'* || "${SSID}" == *$'\0'* ]]; then
				echo "add_wifi.sh: SSID rejected (newline / NUL in name)" >&2
			else
				_ESCAPED_SSID="${SSID//\\/\\\\}"
				_ESCAPED_SSID="${_ESCAPED_SSID//\"/\\\"}"
				printf 'network={\n\tssid="%s"\n\tscan_ssid=1\n}\n' "${_ESCAPED_SSID}" | sudo tee -a ${WPACONF} >/dev/null
				restart_network
			fi
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
	sleep 2
done
