
#!/bin/bash
#
# Get IP Address

CONFIG="/etc/mupibox/mupiboxconfig.json"
NETWORKCONFIG="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/network.json"

WIFI=$(sudo iw dev wlan0 info | grep ssid | awk '{print $2}')
WIFILINK=$(sudo iwconfig wlan0 | awk '/Link Quality/{split($2,a,"=|/");print int((a[2]/a[3])*100)"%"}')
WIFISIGNAL=$(sudo iwconfig wlan0 | awk '/Signal level/{split($4,a,"=|/");print a[2]" dBm"}')
HOSTN=$(/usr/bin/hostname)
IPA=$(/usr/bin/hostname -I | awk '{print $1}')

/usr/bin/cat <<< $(/usr/bin/jq --arg v "${HOSTN}" '.[].host = $v' ${NETWORKCONFIG}) >  ${NETWORKCONFIG}
/usr/bin/cat <<< $(/usr/bin/jq --arg v "${IPA}" '.[].ip = $v' ${NETWORKCONFIG}) >  ${NETWORKCONFIG}
/usr/bin/cat <<< $(/usr/bin/jq --arg v "${WIFI}" '.[].wifi = $v' ${NETWORKCONFIG}) >  ${NETWORKCONFIG}
/usr/bin/cat <<< $(/usr/bin/jq --arg v "${WIFILINK}" '.[].wifilink = $v' ${NETWORKCONFIG}) >  ${NETWORKCONFIG}
/usr/bin/cat <<< $(/usr/bin/jq --arg v "${WIFISIGNAL}" '.[].wifisignal = $v' ${NETWORKCONFIG}) >  ${NETWORKCONFIG}