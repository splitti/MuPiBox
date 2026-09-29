#!/bin/bash
#
# Config repair in node-sonos-config

FRONTENDCONFIG="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json"
SRC="https://mupibox.de/version/latest"
HOSTN=$(/usr/bin/hostname)

rm ${FRONTENDCONFIG}
wget ${SRC}/config/templates/www.json -O ${FRONTENDCONFIG}

/usr/local/bin/mupibox/./set_hostname.sh
# Atomic-update (HIGH-8).
_TMP="${FRONTENDCONFIG}.tmp.$$"
/usr/bin/jq --arg v "${HOSTN}" '."node-sonos-http-api".server = $v' "${FRONTENDCONFIG}" > "${_TMP}" && mv "${_TMP}" "${FRONTENDCONFIG}" || rm -f "${_TMP}"
chown dietpi:dietpi ${FRONTENDCONFIG}
