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
	sudo wpa_cli -i $(/usr/local/bin/mupibox/mupi_wifi_iface.sh) reconfigure
}

while true
do
	if test -f "${MUPIWIFI}"
	then
		# HIGH-11: previous filter was `jq -r .[].ssid` which iterates and
		# emits N newline-separated SSIDs when the array has N entries.
		# wpa_passphrase / the "network={ ssid=…" emit below then receive
		# a multi-line string and write garbage into wpa_supplicant.conf.
		# Handle index 0 per loop iteration; further queued entries stay in
		# the file and are handled in the next iterations (see the end of
		# the loop body).
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
			# represent (newlines) outright. A NUL cannot be in a bash variable at all: the former
			# extra test for one expanded to an empty pattern and rejected EVERY open network.
			if [[ "${SSID}" == *$'\n'* ]]; then
				echo "add_wifi.sh: SSID rejected (newline in name)" >&2
			else
				_ESCAPED_SSID="${SSID//\\/\\\\}"
				_ESCAPED_SSID="${_ESCAPED_SSID//\"/\\\"}"
				# key_mgmt=NONE: without it wpa_supplicant takes the network for WPA and never connects to it
				printf 'network={\n\tssid="%s"\n\tscan_ssid=1\n\tkey_mgmt=NONE\n}\n' "${_ESCAPED_SSID}" | sudo tee -a ${WPACONF} >/dev/null
				restart_network
			fi
		else
			# wpa_passphrase prints its error ("Passphrase must be 8..63 characters") on stdout and
			# exits 1. That text used to be appended as the first line of wpa_supplicant.conf, which
			# then could not be parsed any more: no WiFi on any adapter until the SD card was fixed
			# by hand. So: check the length first, then the exit code and the shape of the output.
			if [ ${#PSK} -lt 8 ] || [ ${#PSK} -gt 63 ]; then
				echo "add_wifi.sh: password for '${SSID}' rejected (must be 8..63 characters)" >&2
			elif ! WIFI_RESULT=$(sudo wpa_passphrase "${SSID}" "${PSK}") || ! grep -q '^network={' <<< "${WIFI_RESULT}"; then
				echo "add_wifi.sh: wpa_passphrase failed for '${SSID}', nothing written" >&2
			else
				# drop the plain-text "#psk=" comment, add scan_ssid=1 after the ssid line
				grep -v '^[[:space:]]*#psk=' <<< "${WIFI_RESULT}" \
					| sed '/^[[:space:]]*ssid=/a\	scan_ssid=1' \
					| sudo tee -a ${WPACONF} > /dev/null
				restart_network
			fi
		fi
		# Only the entry just handled leaves the queue (the parents' app can queue several; the
		# old `rm` of the whole file dropped the rest).
		_REST=$(/usr/bin/jq -c '.[1:]' ${MUPIWIFI} 2>/dev/null)
		if [ -n "${_REST}" ] && [ "${_REST}" != "[]" ]; then
			_TMP="${MUPIWIFI}.tmp.$$"
			printf '%s' "${_REST}" | sudo tee "${_TMP}" > /dev/null && sudo chown dietpi:dietpi "${_TMP}" && sudo mv -f "${_TMP}" ${MUPIWIFI}
		else
			sudo rm -f ${MUPIWIFI}
		fi
	fi
	sleep 2
done
