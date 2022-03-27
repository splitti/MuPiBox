#!/bin/bash
#
# Get IP Address

CONFIG="/etc/mupibox/mupiboxconfig.json"
NETWORKCONFIG="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/network.json"

HOSTN=$(/usr/bin/hostname)
IPA=$(/usr/bin/hostname -I | awk '{print $1}')

/usr/bin/cat <<< $(/usr/bin/jq --arg v "${HOSTN}" '.[].host = $v' ${NETWORKCONFIG}) >  ${NETWORKCONFIG}
/usr/bin/cat <<< $(/usr/bin/jq --arg v "${IPA}" '.[].ip = $v' ${NETWORKCONFIG}) >  ${NETWORKCONFIG}