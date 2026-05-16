#!/bin/bash
#
# Set Hostname in node-sonos-config

FRONTENDCONFIG="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json"

HOSTN=$(/usr/bin/hostname)

# Atomic-update (HIGH-8).
_TMP="${FRONTENDCONFIG}.tmp.$$"
/usr/bin/jq --arg v "${HOSTN}" '."node-sonos-http-api".server = $v' "${FRONTENDCONFIG}" > "${_TMP}" && mv "${_TMP}" "${FRONTENDCONFIG}" || rm -f "${_TMP}"