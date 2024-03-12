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

if [ ! -f ${NETWORKCONFIG} ]; then
        sudo echo -n "[]" ${NETWORKCONFIG}
        chown dietpi:dietpi ${NETWORKCONFIG}
        chmod 777 ${NETWORKCONFIG}
        OLD_ONLINESTATE="starting"
        /usr/bin/cat <<< $(/usr/bin/jq -n --arg v "starting" '.onlinestate = $v' ${NETWORKCONFIG}) >  ${NETWORKCONFIG}
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

GW=$(ip route show 0.0.0.0/0 dev wlan0 | cut -d\  -f3)
MAC=$(cat /sys/class/net/wlan0/address)
WIFI=$(sudo iw dev wlan0 info | grep ssid | awk '{print $2}')
WIFILINK=$(sudo iwconfig wlan0 | awk '/Link Quality/{split($2,a,"=|/");print int((a[2]/a[3])*100)"%"}')
WIFISIGNAL=$(sudo iwconfig wlan0 | awk '/Signal level/{split($4,a,"=|/");print a[2]" dBm"}')
HOSTN=$(/usr/bin/hostname)
IPA=$(/usr/bin/hostname -I | awk '{print $1}')
DNS=$(echo $(sudo cat /etc/resolv.conf | grep 'nameserver ') | sed 's/nameserver //g')
SUBNET=$(/sbin/ifconfig wlan0 | awk '/netmask/{split($4,a,":"); print a[1]}')

/usr/bin/cat <<< $(/usr/bin/jq --arg v "${HOSTN}" '.host = $v' ${NETWORKCONFIG}) >  ${NETWORKCONFIG}
/usr/bin/cat <<< $(/usr/bin/jq --arg v "${IPA}" '.ip = $v' ${NETWORKCONFIG}) >  ${NETWORKCONFIG}
/usr/bin/cat <<< $(/usr/bin/jq --arg v "${MAC}" '.mac = $v' ${NETWORKCONFIG}) >  ${NETWORKCONFIG}
/usr/bin/cat <<< $(/usr/bin/jq --arg v "${WIFI}" '.wifi = $v' ${NETWORKCONFIG}) >  ${NETWORKCONFIG}
/usr/bin/cat <<< $(/usr/bin/jq --arg v "${WIFILINK}" '.wifilink = $v' ${NETWORKCONFIG}) >  ${NETWORKCONFIG}
/usr/bin/cat <<< $(/usr/bin/jq --arg v "${WIFISIGNAL}" '.wifisignal = $v' ${NETWORKCONFIG}) >  ${NETWORKCONFIG}
/usr/bin/cat <<< $(/usr/bin/jq --arg v "${GW}" '.gateway = $v' ${NETWORKCONFIG}) >  ${NETWORKCONFIG}
/usr/bin/cat <<< $(/usr/bin/jq --arg v "${DNS}" '.dns = $v' ${NETWORKCONFIG}) >  ${NETWORKCONFIG}
/usr/bin/cat <<< $(/usr/bin/jq --arg v "${SUBNET}" '.subnet = $v' ${NETWORKCONFIG}) >  ${NETWORKCONFIG}
#/usr/bin/cat <<< $(/usr/bin/jq --arg v "${HOSTN}" '."node-sonos-http-api".server = $v' ${FRONTENDCONFIG}) >  ${FRONTENDCONFIG}
#/usr/bin/cat <<< $(/usr/bin/jq --arg v "${IPA}" '."node-sonos-http-api".ip = $v' ${FRONTENDCONFIG}) >  ${FRONTENDCONFIG}