#!/bin/bash
#

WPACONF="/etc/wpa_supplicant/wpa_supplicant.conf"
NETWORKINTERFACES="/etc/network/interfaces"
# DietPi on Debian 13 and later: one file per adapter (wlan0.conf, wlan1.conf, ...), read by "source interfaces.d/*"
NETWORKINTERFACESD="/etc/network/interfaces.d"
# The new version is written next to the file (the same file system: the exchange is one step, nothing half written
# when the power goes) and readable by root only - it holds the WiFi passwords. Built in /tmp (another file system,
# so mv copied) it came out readable by everyone (0644).
TMP_FILE="${WPACONF}.mupibox-new"
umask 077

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
	# HIGH-13: `rm "$file.bak"` without -f errors on first run when no
	# .bak exists. Without `set -e` it's just a stderr noise; with set -e
	# (e.g. anyone tightening this script later) it would abort BEFORE
	# the cp can create the new backup, leaving no backup at all. Use -f
	# so the rm is idempotent.
	rm -f "$NETWORKINTERFACES.bak"
	cp "$NETWORKINTERFACES" "$NETWORKINTERFACES.bak"
	sed -i 's|wpa-conf /etc/wpa_supplicant/wpa_supplicant.conf|wpa-roam /etc/wpa_supplicant/wpa_supplicant.conf|' $NETWORKINTERFACES
	sed -i 's|iface wlan0 inet dhcp|iface wlan0 inet manual|' $NETWORKINTERFACES
	echo "iface default inet dhcp" | tee -a $NETWORKINTERFACES > /dev/null
fi

# The adapters defined in interfaces.d (see above) get the same roaming setup. Their backup goes next to
# /etc/network/interfaces, not into interfaces.d: everything in there is read as a definition.
for conf in "$NETWORKINTERFACESD"/wlan[0-9].conf; do
	[ -f "$conf" ] || continue
	if grep -q "^wpa-conf /etc/wpa_supplicant/wpa_supplicant.conf" "$conf"; then
		cp "$conf" "/etc/network/$(basename "$conf").bak"
		sed -i -e 's|^wpa-conf /etc/wpa_supplicant/wpa_supplicant.conf|wpa-roam /etc/wpa_supplicant/wpa_supplicant.conf|' -e 's|^iface \(wlan[0-9]\) inet dhcp|iface \1 inet manual|' "$conf"
	fi
done
# the roaming setup brings the address by the logical interface "default": it has to be defined once
if ! grep -qs "^iface default inet dhcp" "$NETWORKINTERFACES" "$NETWORKINTERFACESD"/*; then
	echo "iface default inet dhcp" >> "$NETWORKINTERFACES"
fi

# A second WiFi adapter (a USB one) is called wlan1: it is set up like the onboard one. Which of the two
# is used is decided by mupi_wifi_select.sh (USB preferred, onboard as fallback).
# One definition per adapter: an adapter that is defined twice (here and in interfaces.d/wlan1.conf, as an earlier
# version of this script left it) starts two wpa_supplicant that stop each other - the link comes up and goes down
# again a few seconds later, with no address.
if grep -qs "^iface wlan1 " "$NETWORKINTERFACESD"/*.conf && grep -q "^iface wlan1 " "$NETWORKINTERFACES"; then
	sed -i '/^allow-hotplug wlan1$/,/^wpa-roam .*wpa_supplicant\.conf$/d' "$NETWORKINTERFACES"
fi
if ! grep -qs "^iface wlan1 " "$NETWORKINTERFACES" "$NETWORKINTERFACESD"/*; then
	{
		echo ""
		echo "allow-hotplug wlan1"
		echo "iface wlan1 inet manual"
		echo "wireless-power off"
		echo "wpa-roam /etc/wpa_supplicant/wpa_supplicant.conf"
	} >> "$NETWORKINTERFACES"
fi

# /etc/wpa_supplicant/wpa_supplicant — same idempotency fix (HIGH-13).
rm -f "$WPACONF.bak"  # idempotent (HIGH-13)
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
# (also a file left readable by everyone by an earlier version, and its copy)
chown root:root "$WPACONF" "$WPACONF.bak" 2>/dev/null
chmod 600 "$WPACONF" "$WPACONF.bak" 2>/dev/null
