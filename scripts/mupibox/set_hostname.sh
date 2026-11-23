#!/bin/bash
#
# Set Hostname in node-sonos-config

. /usr/local/bin/mupibox/mupi_paths.sh

FRONTENDCONFIG="${MUPI_SERVER_CONFIG}/config.json"

HOSTN=$(/usr/bin/hostname)

# Atomic-update (HIGH-8).
_TMP="${FRONTENDCONFIG}.tmp.$$"
/usr/bin/jq --arg v "${HOSTN}" '."node-sonos-http-api".server = $v' "${FRONTENDCONFIG}" > "${_TMP}" && mv "${_TMP}" "${FRONTENDCONFIG}" || rm -f "${_TMP}"