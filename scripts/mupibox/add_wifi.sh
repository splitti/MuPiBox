#!/bin/bash
#


MUPIWIFI="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/wlan.json"
WPACONF="/etc/wpa_supplicant/wpa_supplicant.conf"


while true
do
	if test -f "${MUPIWIFI}"; then
		SSID=$(/usr/bin/jq -r .[].ssid ${MUPIWIFI})
		PSK=$(/usr/bin/jq -r .[].pw ${MUPIWIFI})
		cat << _EOF_ >> ${WPACONF}
network={
        ssid="${SSID}"
        scan_ssid=1
        key_mgmt=WPA-PSK
        psk="${PSK}"
}
_EOF_
		rm ${MUPIWIFI}
		sudo service ifup@wlan0 restart
	fi
	sleep 2
done
