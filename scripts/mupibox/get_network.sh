#!/bin/bash
#
# Get Network-Data and create Online / Offline Data.json for showing Media in MuPiBox

DATA_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json"
ACTIVE_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/active_data.json"
OFFLINE_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/offline_data.json"
RESUME_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/resume.json"
ACTIVERESUME_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/active_resume.json"
OFFLINERESUME_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/offline_resume.json"
CONFIG="/etc/mupibox/mupiboxconfig.json"
NETWORKCONFIG="/tmp/network.json"
#FRONTENDCONFIG="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json"
#PLAYERSTATE=$(cat /tmp/playerstate)
DATA_LOCK="/tmp/.data.lock"
RESUME_LOCK="/tmp/.resume.lock"


if [ -f "${DATA_LOCK}" ]; then
	echo "Data-file locked."
    exit
else
	touch ${DATA_LOCK}
	if [ ! -f ${DATA_FILE} ]; then
			echo -n "[]" > ${DATA_FILE}
			chown dietpi:dietpi ${DATA_FILE}
	fi
	rm ${DATA_LOCK}
fi

if [ -f "${RESUME_LOCK}" ]; then
	echo "Resume-file locked."
    exit
else
	touch ${RESUME_LOCK}
	if [ ! -f ${RESUME_FILE} ]; then
			echo -n "[]" > ${RESUME_FILE}
			chown dietpi:dietpi ${RESUME_FILE}
	fi
	rm ${RESUME_LOCK}
fi

# The file lives in /tmp and is gone after a reboot. It must be created when it is missing AND when
# it is empty or not a JSON object: every writer below uses jq on the existing file, so once an empty
# file exists nothing would ever fill it again (the display then shows no network state at all).
# (Before: `sudo echo -n "[]" file` had no redirect and wrote nothing.)
if [ ! -s ${NETWORKCONFIG} ] || ! /usr/bin/jq -e 'type == "object"' ${NETWORKCONFIG} > /dev/null 2>&1; then
        sudo rm -f ${NETWORKCONFIG}
        OLD_ONLINESTATE="starting"
        # Atomic-update (HIGH-8).
        _TMP="${NETWORKCONFIG}.tmp.$$"
        /usr/bin/jq -n --arg v "starting" '.onlinestate = $v' > "${_TMP}" && mv "${_TMP}" "${NETWORKCONFIG}" || rm -f "${_TMP}"
        chown dietpi:dietpi ${NETWORKCONFIG}
        chmod 777 ${NETWORKCONFIG}
else
        OLD_ONLINESTATE=$(/usr/bin/jq -r .onlinestate ${NETWORKCONFIG})
fi

if [ ! -f ${OFFLINE_FILE} ]; then
        echo -n "[" > ${OFFLINE_FILE}
        echo -n $(jq '.[] | select(.type != "spotify") | select(.type != "radio") | select(.type != "rss")' < ${DATA_FILE}) >> ${OFFLINE_FILE}
        echo -n "]" >> ${OFFLINE_FILE}
        sed -i 's/} {/}, {/g' ${OFFLINE_FILE}
        chown dietpi:dietpi ${OFFLINE_FILE}
elif [ $(stat --format='%Y' "${DATA_FILE}") -gt $(stat --format='%Y' "${OFFLINE_FILE}") ]; then
        echo -n "[" > ${OFFLINE_FILE}
        echo -n $(jq '.[] | select(.type != "spotify") | select(.type != "radio") | select(.type != "rss")' < ${DATA_FILE}) >> ${OFFLINE_FILE}
        echo -n "]" >> ${OFFLINE_FILE}
        sed -i 's/} {/}, {/g' ${OFFLINE_FILE}
fi

if [ ! -f ${OFFLINERESUME_FILE} ]; then
        echo -n "[" > ${OFFLINERESUME_FILE}
        echo -n $(jq '.[] | select(.type != "spotify") | select(.type != "radio") | select(.type != "rss")' < ${RESUME_FILE}) >> ${OFFLINERESUME_FILE}
        echo -n "]" >> ${OFFLINERESUME_FILE}
        sed -i 's/} {/}, {/g' ${OFFLINERESUME_FILE}
        chown dietpi:dietpi ${OFFLINERESUME_FILE}
elif [ $(stat --format='%Y' "${RESUME_FILE}") -gt $(stat --format='%Y' "${OFFLINERESUME_FILE}") ]; then
        echo -n "[" > ${OFFLINERESUME_FILE}
        echo -n $(jq '.[] | select(.type != "spotify") | select(.type != "radio") | select(.type != "rss")' < ${RESUME_FILE}) >> ${OFFLINERESUME_FILE}
        echo -n "]" >> ${OFFLINERESUME_FILE}
        sed -i 's/} {/}, {/g' ${OFFLINERESUME_FILE}
fi

# the WiFi adapter in use (a USB adapter if there is one, else the onboard one)
WIFI_IF=$(/usr/local/bin/mupibox/mupi_wifi_iface.sh)
WIFI_IF=${WIFI_IF:-wlan0}
GW=$(ip route show 0.0.0.0/0 dev ${WIFI_IF} | cut -d\  -f3)
MAC=$(cat /sys/class/net/${WIFI_IF}/address)
# sed instead of `grep ssid | awk '{print $2}'`: keeps SSIDs that contain spaces intact.
WIFI=$(sudo iw dev ${WIFI_IF} info | sed -n 's/^[[:space:]]*ssid //p')
WIFILINK=$(sudo iwconfig ${WIFI_IF} | awk '/Link Quality/{split($2,a,"=|/");print int((a[2]/a[3])*100)"%"}')
WIFISIGNAL=$(sudo iwconfig ${WIFI_IF} | awk '/Signal level/{split($4,a,"=|/");print a[2]" dBm"}')
# Some drivers (e.g. the USB adapter's) report "Signal level" as a percentage, not in dBm: then the real
# value comes from the WiFi supplicant.
case "${WIFISIGNAL}" in
	-*) ;;
	*)
		RSSI=$(sudo wpa_cli -i ${WIFI_IF} signal_poll 2>/dev/null | awk -F= '/^RSSI=/{print $2}')
		if [ -n "${RSSI}" ]; then
			WIFISIGNAL="${RSSI} dBm"
		fi
		;;
esac
HOSTN=$(/usr/bin/hostname)
IPA=$(/usr/bin/hostname -I | awk '{print $1}')
DNS=$(echo $(sudo cat /etc/resolv.conf | grep 'nameserver ') | sed 's/nameserver //g')
SUBNET=$(/sbin/ifconfig ${WIFI_IF} | awk '/netmask/{split($4,a,":"); print a[1]}')

# Atomic-update (HIGH-8). Bundle all field updates into a single jq
# pipeline so we only do one tempfile-write-rename cycle, not ten — same
# correctness, a tenth of the SD-card writes.
# .interface is the WiFi adapter in use (shown next to the title of the WiFi page).
_TMP="${NETWORKCONFIG}.tmp.$$"
/usr/bin/jq \
    --arg host "${HOSTN}" \
    --arg ip "${IPA}" \
    --arg mac "${MAC}" \
    --arg wifi "${WIFI}" \
    --arg wifilink "${WIFILINK}" \
    --arg wifisignal "${WIFISIGNAL}" \
    --arg gateway "${GW}" \
    --arg dns "${DNS}" \
    --arg subnet "${SUBNET}" \
    --arg iface "${WIFI_IF}" \
    '.host = $host | .ip = $ip | .mac = $mac | .wifi = $wifi | .wifilink = $wifilink | .wifisignal = $wifisignal | .gateway = $gateway | .dns = $dns | .subnet = $subnet | .interface = $iface' \
    "${NETWORKCONFIG}" > "${_TMP}" && mv "${_TMP}" "${NETWORKCONFIG}" || rm -f "${_TMP}"
#/usr/bin/cat <<< $(/usr/bin/jq --arg v "${HOSTN}" '."node-sonos-http-api".server = $v' ${FRONTENDCONFIG}) >  ${FRONTENDCONFIG}
#/usr/bin/cat <<< $(/usr/bin/jq --arg v "${IPA}" '."node-sonos-http-api".ip = $v' ${FRONTENDCONFIG}) >  ${FRONTENDCONFIG}
