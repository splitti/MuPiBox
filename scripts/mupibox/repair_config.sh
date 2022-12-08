#!/bin/bash
#
# Config repair in node-sonos-config

FRONTENDCONFIG="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json"
SRC="https://mupibox.de/version/latest"
HOSTN=$(/usr/bin/hostname)

wget ${SRC}/config/templates/www.json -O ~/.mupibox/Sonos-Kids-Controller-master/server/config/config.json

/usr/local/bin/mupibox/./set_hostname.sh
/usr/bin/cat <<< $(/usr/bin/jq --arg v "${HOSTN}" '."node-sonos-http-api".server = $v' ${FRONTENDCONFIG}) >  ${FRONTENDCONFIG}
chown dietpi:dietpi ${FRONTENDCONFIG}
