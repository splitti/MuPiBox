#!/bin/bash
#
# Get Network-Data

CONFIG="/etc/mupibox/mupiboxconfig.json"
NETWORKCONFIG="/tmp/network.json"

if [ ! -f ${NETWORKCONFIG} ]; then
        sudo echo -n "[]" ${NETWORKCONFIG}
        chown dietpi:dietpi ${NETWORKCONFIG}
        chmod 777 ${NETWORKCONFIG}
        OLD_ONLINESTATE="starting"
        /usr/bin/cat <<< $(/usr/bin/jq -n --arg v "starting" '.onlinestate = $v' ${NETWORKCONFIG}) >  ${NETWORKCONFIG}
else
        OLD_ONLINESTATE=$(/usr/bin/jq -r .onlinestate ${NETWORKCONFIG})
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
