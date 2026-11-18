#!/bin/bash
#

. /usr/local/bin/mupibox/mupi_paths.sh

MUPIWIFI="${MUPI_SERVER_CONFIG}/wlan.json"
WPACONF="/etc/wpa_supplicant/wpa_supplicant.conf"
TMP_WPACONF="/tmp/wpa_supplicant.conf"
NETWORKCONFIG="/tmp/network.json"
NETWORKINTERFACES="/etc/network/interfaces"
TRY_FILE="/run/mupibox-wifi-try"
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

# A second WiFi adapter (a USB stick next to the Pi's own WiFi) has its own wpa_supplicant, which reads the file only when
# it starts: it kept its old list, and its next save_config wrote that back (see wifiSyncOthers in wpa-ssid.ts). Called
# once the file is final - after the try (a failed network saved as disabled).
sync_others() {
	local wifi n
	wifi=$(/usr/local/bin/mupibox/mupi_wifi_iface.sh)
	for n in /sys/class/net/*/phy80211; do
		[ -e "${n}" ] || continue
		n=$(basename "$(dirname "${n}")")
		[ "${n}" = "${wifi}" ] || sudo wpa_cli -i "${n}" reconfigure > /dev/null 2>&1
	done
}

# The configuration holds the key of every network. A file left readable by everyone by an earlier save_config goes back
# to root only; the folder keeps others out while save_config writes it (its temporary file is readable by everyone, and
# chmod afterwards does not help whoever has opened it). wpa_supplicant and its scripts run as root.
sudo chmod 600 "${WPACONF}" 2>/dev/null
sudo chmod 700 "$(dirname "${WPACONF}")" 2>/dev/null
# A network's name as wpa_cli prints it: a byte outside ASCII as \xNN, a backslash and a quote with a backslash.
wpa_cli_name() {
	local b out=""
	for b in $(printf '%s' "$1" | od -An -tu1 -v); do
		case "${b}" in
			34) out+='\"' ;;
			92) out+='\\' ;;
			*)
				if [ "${b}" -lt 32 ] || [ "${b}" -gt 126 ]; then
					out+=$(printf '\\x%02x' "${b}")
				else
					out+=$(printf "\\$(printf '%03o' "${b}")")
				fi
				;;
		esac
	done
	printf '%s' "${out}"
}

# The flags of the network's access points in the last scan, one per line ("[WPA2-PSK+SAE-CCMP][ESS]").
scan_flags() {
	NAME="$(wpa_cli_name "$1")" awk -F'\t' '$5 == ENVIRON["NAME"] { print $4 }' \
		<<< "$(sudo wpa_cli -i "$(/usr/local/bin/mupibox/mupi_wifi_iface.sh)" scan_results)"
}

# The Pi's own WiFi (driver brcmfmac: Pi 3B+, 4, 5) is there? It cannot move to another access point of a WPA3 network
# while it is connected: the authentication there times out (Raspberry Pi sets roamoff=1, the WPA3 handshake runs in
# wpa_supplicant), the box was gone for 12 to 16 s, and bgscan tried it every minute. With WPA2 it moves without a gap.
# A USB stick (rtl8192cu, mt76, ...) does both - but next to the Pi's own WiFi both read the same configuration (and
# the stick may be pulled out later): there the entry has to suit the Pi's own WiFi too.
own_wifi() {
	local d
	for d in /sys/class/net/*/device/driver; do
		if [ "$(basename "$(readlink -f "${d}" 2>/dev/null)")" = "brcmfmac" ]; then
			basename "$(dirname "$(dirname "${d}")")"
			return 0
		fi
	done
	return 1
}
roams_badly() {
	own_wifi > /dev/null
}

# What the network asks for: psk (WPA2), sae (only WPA3) or both. A network that offers both is taken as WPA2 on the Pi's
# own WiFi (see roams_badly). Not in the scan (hidden, out of reach): both - the box takes what the network turns out
# to use.
key_kind() {
	local flags
	flags=$(scan_flags "$1")
	if [ -z "${flags}" ]; then
		sudo wpa_cli -i "$(/usr/local/bin/mupibox/mupi_wifi_iface.sh)" scan > /dev/null 2>&1
		sleep 4
		flags=$(scan_flags "$1")
	fi
	if [ -z "${flags}" ]; then
		echo both
	elif ! grep -q SAE <<< "${flags}"; then
		echo psk
	elif grep -q PSK <<< "${flags}"; then
		if roams_badly; then echo psk; else echo both; fi
	else
		echo sae
	fi
}

# The network the box is connected to now? Its key is not replaced by this: a mistyped password would take the box
# offline, with no way back from the app.
is_connected() {
	[ "$(sudo wpa_cli -i "$(/usr/local/bin/mupibox/mupi_wifi_iface.sh)" status | sed -n 's/^ssid=//p')" = "$(wpa_cli_name "$1")" ]
}

# The network into the configuration: its key lines ($3) in the block saved for that name - its other settings (band,
# fixed address) stay, a further block of the same name goes ("added again" left two) - or a new block. The file is
# replaced in one step and stays readable by root only: it can hold the password as it is (see below).
# $1 the ssid line, $2 the name, $3 the key lines.
put_network() {
	local new="${WPACONF}.mupibox-new"
	(
		umask 077
		SSID_LINE="$1" SSID_HEX="$(printf '%s' "$2" | od -An -tx1 -v | tr -d ' \n')" KEYS="$3" awk '
			function flush(   i, line, ours) {
				ours = 0
				for (i = 1; i <= n; i++) {
					line = block[i]
					sub(/^[ \t]+/, "", line)
					if (line == ENVIRON["SSID_LINE"] || line == "ssid=" ENVIRON["SSID_HEX"]) ours = 1
				}
				if (ours && done) { n = 0; return }
				for (i = 1; i <= n; i++) {
					line = block[i]
					if (ours && line ~ /^[ \t]*#?(psk|sae_password|key_mgmt|ieee80211w|bgscan|scan_ssid|disabled)=/) continue
					print line
					if (ours && line ~ /^[ \t]*ssid=/) print ENVIRON["KEYS"]
				}
				if (ours) done = 1
				n = 0
			}
			inside { block[++n] = $0; if ($0 ~ /^[ \t]*}/) { inside = 0; flush() } next }
			/^[ \t]*network=\{/ { inside = 1; block[++n] = $0; next }
			{ print }
			END {
				if (inside) flush()
				if (!done) { print "network={"; print "\t" ENVIRON["SSID_LINE"]; print ENVIRON["KEYS"]; print "}" }
			}
		' "${WPACONF}" > "${new}"
	) && [ -s "${new}" ] && chown root:root "${new}" && chmod 600 "${new}" && mv -f "${new}" "${WPACONF}"
}

# A network just saved is tried once, on its own. Left to wpa_supplicant, a wrong password had the box leave the working
# network again and again for another try. It fails (the password, most likely; wpa_supplicant cannot tell for WPA3): the
# entry is saved as disabled, the app shows it, and the box goes back. Not found within the time (out of reach): the entry
# stays as it is. The name in TRY_FILE: while it is there, the other networks are "disabled" for this try only.
# $1 the ssid line, $2 the name, $3 the key lines.
try_network() {
	local wifi name saved id others i flags status failed=""
	wifi=$(/usr/local/bin/mupibox/mupi_wifi_iface.sh)
	name=$(wpa_cli_name "$2")
	printf '%s' "$2" > "${TRY_FILE}"
	restart_network
	saved=$(sudo wpa_cli -i "${wifi}" list_networks | tail -n +2)
	id=$(NAME="${name}" awk -F'\t' '$2 == ENVIRON["NAME"] { print $1; exit }' <<< "${saved}")
	# (the networks to give back afterwards: not one disabled before this)
	others=$(ID="${id}" awk -F'\t' '$1 != ENVIRON["ID"] && $4 !~ /\[DISABLED\]/ { print $1 }' <<< "${saved}")
	if [ -n "${id}" ]; then
		sudo wpa_cli -i "${wifi}" select_network "${id}" > /dev/null
		for i in $(seq 1 15); do
			sleep 2
			status=$(sudo wpa_cli -i "${wifi}" status)
			if grep -q '^wpa_state=COMPLETED' <<< "${status}" && [ "$(sed -n 's/^ssid=//p' <<< "${status}")" = "${name}" ]; then
				break
			fi
			flags=$(ID="${id}" awk -F'\t' '$1 == ENVIRON["ID"] { print $4 }' <<< "$(sudo wpa_cli -i "${wifi}" list_networks | tail -n +2)")
			if [[ "${flags}" == *TEMP-DISABLED* ]]; then
				failed=1
				break
			fi
		done
		if [ -n "${failed}" ]; then
			echo "add_wifi.sh: '$2' did not connect, saved as disabled" >&2
			sudo wpa_cli -i "${wifi}" disable_network "${id}" > /dev/null
			put_network "$1" "$2" "$3"$'\n\tdisabled=1'
		fi
		for i in ${others}; do
			sudo wpa_cli -i "${wifi}" enable_network "${i}" > /dev/null
		done
	fi
	rm -f "${TRY_FILE}"
	sync_others
}

# WPA3 on the Pi's own WiFi: bgscan is off for such a network (bgscan="", see roams_badly), and a weak access point
# would keep the box (watched there - also while a USB stick is the WiFi in use: it reads the same entry). Checked once a
# minute: below SAE_WEAK dBm three times in a row (two minutes), the connection is
# set up anew (disconnect, reconnect: about 3 s, the address stays - see wpa_action_guard.sh; wpa_supplicant then takes
# the strongest access point of the network). Back with the same one (no better one in reach): not again for an hour,
# else not for 10 minutes.
SAE_WEAK=-75
sae_low=0
sae_tick=0
sae_next=0
sae_watch() {
	local wifi status rssi bssid now
	now=$(date +%s)
	[ "${now}" -ge "${sae_tick}" ] || return 0
	sae_tick=$((now + 60))
	[ "${now}" -ge "${sae_next}" ] && [ ! -f "${TRY_FILE}" ] || return 0
	wifi=$(own_wifi) || return 0
	status=$(sudo wpa_cli -i "${wifi}" status)
	rssi=$(sudo wpa_cli -i "${wifi}" signal_poll | sed -n 's/^RSSI=//p')
	if ! grep -q '^wpa_state=COMPLETED' <<< "${status}" || ! grep -q '^key_mgmt=.*SAE' <<< "${status}" ||
		! [[ "${rssi}" =~ ^-?[0-9]+$ ]] || [ "${rssi}" -ge "${SAE_WEAK}" ] ||
		[ "$(sudo wpa_cli -i "${wifi}" get_network "$(sed -n 's/^id=//p' <<< "${status}")" bgscan)" != '""' ]; then
		sae_low=0
		return 0
	fi
	sae_low=$((sae_low + 1))
	[ "${sae_low}" -ge 3 ] || return 0
	sae_low=0
	bssid=$(sed -n 's/^bssid=//p' <<< "${status}")
	echo "add_wifi.sh: WPA3 signal ${rssi} dBm at ${bssid} - connecting anew" >&2
	sudo wpa_cli -i "${wifi}" disconnect > /dev/null
	sudo wpa_cli -i "${wifi}" reconnect > /dev/null
	sleep 10
	if [ "$(sudo wpa_cli -i "${wifi}" status | sed -n 's/^bssid=//p')" = "${bssid}" ]; then
		sae_next=$((now + 3600))
	else
		sae_next=$((now + 600))
	fi
}

rm -f "${TRY_FILE}"

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
			sync_others
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
			elif is_connected "${SSID}"; then
				echo "add_wifi.sh: '${SSID}' is the connected network, left as it is" >&2
			else
				# Not escaped: wpa_supplicant reads a quoted ssid up to the LAST quote of its line (wpa_config_parse_string)
				# and knows no escapes there - a \" put in became part of the name, and the box never found the network.
				# One line can hold any name without a line break, as wpa_passphrase writes it for the other networks.
				# key_mgmt=NONE: without it wpa_supplicant takes the network for WPA and never connects to it
				put_network "ssid=\"${SSID}\"" "${SSID}" $'\tscan_ssid=1\n\tkey_mgmt=NONE' && try_network "ssid=\"${SSID}\"" "${SSID}" $'\tscan_ssid=1\n\tkey_mgmt=NONE'
			fi
		else
			# wpa_passphrase prints its error ("Passphrase must be 8..63 characters") on stdout and
			# exits 1. That text used to be appended as the first line of wpa_supplicant.conf, which
			# then could not be parsed any more: no WiFi on any adapter until the SD card was fixed
			# by hand. So: check the length first, then the exit code and the shape of the output.
			if [ ${#PSK} -lt 8 ] || [ ${#PSK} -gt 63 ]; then
				echo "add_wifi.sh: password for '${SSID}' rejected (must be 8..63 characters)" >&2
			# (the password over stdin: sudo writes its command line to the system log)
			elif ! WIFI_RESULT=$(sudo wpa_passphrase "${SSID}" <<< "${PSK}") || ! grep -q '^network={' <<< "${WIFI_RESULT}"; then
				echo "add_wifi.sh: wpa_passphrase failed for '${SSID}', nothing written" >&2
			elif is_connected "${SSID}"; then
				echo "add_wifi.sh: '${SSID}' is the connected network, left as it is" >&2
			else
				SSID_LINE=$(sed -n 's/^[[:space:]]*\(ssid=.*\)$/\1/p' <<< "${WIFI_RESULT}")
				HASH_LINE=$(sed -n 's/^[[:space:]]*\(psk=.*\)$/\1/p' <<< "${WIFI_RESULT}")
				KIND=$(key_kind "${SSID}")
				# WPA3 cannot use the key worked out from the password that WPA2 keeps (psk=): it needs the password itself,
				# as sae_password. A quote and later a # in it would cut the line when wpa_supplicant reads it (a comment
				# outside a quoted part): such a password stays with WPA2.
				case "${PSK}" in
					*\"*#*)
						if [ "${KIND}" = "sae" ]; then
							echo "add_wifi.sh: password for '${SSID}' not usable with WPA3 (a quote before a #), nothing written" >&2
							KIND=""
						else
							KIND=psk
						fi
						;;
				esac
				# (bgscan="" with WPA3 on the Pi's own WiFi: no moving to another access point while connected - it fails, see
				# roams_badly; the box reconnects by itself where the signal stays weak, see sae_watch)
				QUIET=""
				roams_badly && QUIET=$'\n\tbgscan=""'
				case "${KIND}" in
					psk) KEYS=$'\tscan_ssid=1\n\t'"${HASH_LINE}" ;;
					both) KEYS=$'\tscan_ssid=1\n\tkey_mgmt=WPA-PSK SAE\n\tieee80211w=1'"${QUIET}"$'\n\t'"${HASH_LINE}"$'\n\tsae_password="'"${PSK}"'"' ;;
					sae) KEYS=$'\tscan_ssid=1\n\tkey_mgmt=SAE\n\tieee80211w=2'"${QUIET}"$'\n\tsae_password="'"${PSK}"'"' ;;
					*) KEYS="" ;;
				esac
				if [ -n "${KEYS}" ]; then
					put_network "${SSID_LINE}" "${SSID}" "${KEYS}" && try_network "${SSID_LINE}" "${SSID}" "${KEYS}"
				fi
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
	sae_watch
	sleep 2
done
