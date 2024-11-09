#!/bin/bash
#

WPACONF="/etc/wpa_supplicant/wpa_supplicant.conf"
NETWORKINTERFACES="/etc/network/interfaces"
TMP_FILE="/tmp/wpa_supplicant.conf.tmp"

add_config() {
	local SEARCH_ENTRY=$1
	if grep -q "$SEARCH_ENTRY" "$WPACONF"; then
		echo "'$SEARCH_ENTRY' already exist."
	else
		echo "'$SEARCH_ENTRY' will be added..."
		local SEARCH_ADDED=0
		{
			while IFS= read -r line; do
				if [[ "$line" != "$SEARCH_ENTRY" && "$line" == *"network={"* && $SEARCH_ADDED -eq 0 ]]; then
					echo "$SEARCH_ENTRY"
					SEARCH_ADDED=1
				fi
				echo "$line"
			done < "$WPACONF"
		} > "$TMP_FILE"
		mv "$TMP_FILE" "$WPACONF"
	fi
}

# /etc/network/interfaces
if ! grep -q "wpa-roam /etc/wpa_supplicant/wpa_supplicant.conf" "$NETWORKINTERFACES"; then
	rm "$NETWORKINTERFACES.bak"
	cp "$NETWORKINTERFACES" "$NETWORKINTERFACES.bak"
	sed -i 's|wpa-conf /etc/wpa_supplicant/wpa_supplicant.conf|wpa-roam /etc/wpa_supplicant/wpa_supplicant.conf|' $NETWORKINTERFACES
	sed -i 's|iface wlan0 inet dhcp|iface wlan0 inet manual|' $NETWORKINTERFACES
	echo "iface default inet dhcp" | tee -a $NETWORKINTERFACES > /dev/null
fi

# /etc/wpa_supplicant/wpa_supplicant
rm "$WPACONF.bak"
cp "$WPACONF" "$WPACONF.bak"
add_config 'bgscan="simple:30:-70:60"'
#add_config 'roam_timeout=5'
#add_config 'disable_pm=1'
add_config 'ap_scan=1'

in_network_block=0
{
    while IFS= read -r line; do
        # Wenn ein network{}-Block beginnt
        if [[ "$line" =~ ^network=\{ ]]; then
            in_network_block=1
            echo "$line" 
            scan_ssid_found=0
            continue
        fi

        if [[ $in_network_block -eq 1 ]]; then
            if [[ "$line" =~ ^\} ]]; then
                if [[ $scan_ssid_found -eq 0 ]]; then
                    echo "	scan_ssid=1"
                fi
                in_network_block=0
            fi
            if [[ "$line" =~ ^[[:space:]]*scan_ssid=1 ]]; then
                scan_ssid_found=1
            fi
        fi
        echo "$line"
    done < "$WPACONF"
} > "$TMP_FILE"

mv "$TMP_FILE" "$WPACONF"
