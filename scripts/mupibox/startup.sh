#!/bin/bash

#JSON_TEMPLATE="https://raw.githubusercontent.com/splitti/MuPiBox/main/config/templates/add_wifi.json"
WIFI_FILE="/boot/add_wifi.json"
FIRST_INSTALL="/home/dietpi/.mupi.install"
WPACONF="/etc/wpa_supplicant/wpa_supplicant.conf"
MUPIBOX_CONFIG="/etc/mupibox/mupiboxconfig.json"
NETWORKCONFIG="/tmp/network.json"
RESIZE_SERVICE="/etc/systemd/system/local-fs.target.wants/dietpi-fs_partition_resize.service"
MUPIHAT_JSON="/tmp/mupihat.json"

#if [ ! -f $MUPIHAT_JSON ]; then
#	echo '{"Charger_Status": "Not Charging", "Vbat": 999, "Vbus": 5000, "Ibat": 0, "IBus": 999, "Temp": 10.0, "BatteryConnected": 0, "Bat_SOC": "100%", "Bat_Stat": "OK", "Bat_Type": "USB-C mode (no battery)"}' | sudo tee /tmp/mupihat.json
#fi

restart_network() {
	# the WiFi adapter in use (a USB adapter if there is one, else the onboard one)
	local WIFI_IF
	WIFI_IF=$(/usr/local/bin/mupibox/mupi_wifi_iface.sh)
	sudo service ifup@${WIFI_IF} stop
	sudo service ifup@${WIFI_IF} start
	#sudo dhclient -r
	#sudo dhclient
	sudo wpa_cli -i ${WIFI_IF} reconfigure
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
	# Exactly one JSON object in the file, else nothing is taken from it (as with an empty file): jq answers for an
	# object at the start and only then fails on what follows ({...}, with a comma behind it was taken as it was)
	if /usr/bin/jq -e -s 'length == 1 and (.[0] | type) == "object"' "${WIFI_FILE}" > /dev/null 2>&1; then
		SSID="$(/usr/bin/jq -r .ssid ${WIFI_FILE})"
		PSK="$(/usr/bin/jq -r .password ${WIFI_FILE})"
	else
		echo "startup.sh: ${WIFI_FILE} is not one JSON object - nothing taken from it" >&2
		SSID=""
		PSK=""
	fi
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
		killall -s 9 -w -q -r chromium
		/usr/local/bin/mupibox/maintenance_screen.sh wlan
		#sudo wget -q -O ${WIFI_FILE} ${JSON_TEMPLATE}
		# (the password over stdin: sudo writes its command line to the system log)
		# 8 to 63 characters (bytes), checked here: wpa_passphrase 2.9 reads only the first 63 from stdin, and a longer
		# password was cut and saved as a wrong key without a word
		# (no line break in it either: wpa_passphrase reads one line, the rest was dropped without a word)
		PSK_BYTES=$(printf '%s' "${PSK}" | LC_ALL=C wc -c)
		# (asked in the JSON itself: $(...) has already dropped line breaks at the end of PSK)
		PSK_BREAK=$(/usr/bin/jq -r '(.password // "") | tostring | test("[\r\n]")' "${WIFI_FILE}" 2>/dev/null) || PSK_BREAK="error"
		if [ "${PSK_BREAK}" != "false" ] || [[ ${PSK} == *$'\n'* || ${PSK} == *$'\r'* ]]; then
			WIFI_RESULT=""
			echo "startup.sh: the password in ${WIFI_FILE} has a line break - nothing written" >&2
		elif [ "${PSK_BYTES}" -ge 8 ] && [ "${PSK_BYTES}" -le 63 ]; then
			WIFI_RESULT=$(sudo wpa_passphrase "${SSID}" <<< "${PSK}")
		else
			WIFI_RESULT=""
			echo "startup.sh: the password in ${WIFI_FILE} has ${PSK_BYTES} bytes, 8 to 63 are allowed - nothing written" >&2
		fi
		# The network block as a whole, without the plain-text "#psk=" comment - not lines 1, 2, 4 and 5: wpa_passphrase 2.9
		# (Bullseye) prints "# reading passphrase from stdin" first on stdout, and those lines lost the ssid and the closing
		# brace and kept the password in plain text. Written only when the block is complete (a wrong password length gives
		# an error text and no block: nothing written, the WiFi stays as it was).
		WIFI_BLOCK=$(sed -n '/^network={$/,/^}$/p' <<< "${WIFI_RESULT}" | grep -v '^[[:space:]]*#psk=')
		if grep -q '^network={$' <<< "${WIFI_BLOCK}" && grep -q '^[[:space:]]*psk=[0-9a-f]\{64\}$' <<< "${WIFI_BLOCK}" && grep -q '^}$' <<< "${WIFI_BLOCK}"; then
			printf '%s\n' "${WIFI_BLOCK}" | sudo tee -a ${WPACONF} > /dev/null
		else
			echo "startup.sh: no network written from ${WIFI_FILE} (wpa_passphrase gave no complete block)" >&2
		fi
		unset WIFI_RESULT WIFI_BLOCK PSK_BYTES PSK_BREAK
		init_add_wifi
		restart_network
		sleep 2
		sudo reboot
	fi
else
	init_add_wifi
fi

### Wait for internet connection and make final install-steps

# The network is restarted only when the box got no address at all: the WiFi takes 15-30 s to connect after power-on,
# and this script runs ~13 s after it (the display starts that early). Restarting the WiFi then tore down the
# connection that was just being made - every start had 30 s more without network. So: up to 60 s for an address
# (WiFi or cable) first; the internet check (onlinestate) may lag behind an address that works.
has_address() { ip -4 -o addr show scope global 2>/dev/null | grep -q .; }
waited=0
while ! has_address && [ ${waited} -lt 60 ]; do
	sleep 3
	waited=$((waited + 3))
done
ONLINESTATE=$(/usr/bin/jq -r .onlinestate ${NETWORKCONFIG})
if [ "${ONLINESTATE}" != "online" ] && ! has_address; then
	restart_network
fi
while [ ${ONLINESTATE} != "online" ]; do
	sleep 15
	ONLINESTATE=$(sudo /usr/bin/jq -r .onlinestate ${NETWORKCONFIG})
done

if [ -f "/boot/run_once.sh" ]; then
	sudo mv /boot/run_once.sh /tmp/run_once.sh
	sudo chmod 755 /tmp/run_once.sh
    sudo /tmp/./run_once.sh
fi

# (the marker of an image's first start is not needed any more)
rm -f "${FIRST_INSTALL}"
