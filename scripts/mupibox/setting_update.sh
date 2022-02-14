#!/bin/bash
#
# Service: Update Mupibox Settings
# Will be done before Shutdown, or by the Setup

MUPIBOX_CONFIG="/etc/mupibox/mupiboxconfig.json"
SONOS_CONFIG="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json"
SPOTIFYCONTROLLER_CONFIG="/home/dietpi/.mupibox/spotifycontroller-main/config/config.json"
SPOTIFYD_CONFIG="/etc/spotifyd/spotifyd.conf"
DISPLAY_STANDBY="/etc/X11/xorg.conf.d/98-dietpi-disable_dpms.conf"

deviceId=$(/usr/bin/jq -r .spotify.deviceId ${MUPIBOX_CONFIG})
/usr/bin/cat <<< $(/usr/bin/jq --arg v "${deviceId}" '.["node-sonos-http-api"].rooms = [$v]' ${SONOS_CONFIG}) >  ${SONOS_CONFIG}
/usr/bin/cat <<< $(/usr/bin/jq --arg v "${deviceId}" '.spotify.deviceId = $v' ${SPOTIFYCONTROLLER_CONFIG}) >  ${SPOTIFYCONTROLLER_CONFIG}

clientId=$(/usr/bin/jq -r .spotify.clientId ${MUPIBOX_CONFIG})
/usr/bin/cat <<< $(/usr/bin/jq --arg v "${clientId}" '.spotify.clientId = $v' ${SONOS_CONFIG}) >  ${SONOS_CONFIG}
/usr/bin/cat <<< $(/usr/bin/jq --arg v "${clientId}" '.spotify.clientId = $v' ${SPOTIFYCONTROLLER_CONFIG}) >  ${SPOTIFYCONTROLLER_CONFIG}

clientSecret=$(/usr/bin/jq -r .spotify.clientSecret ${MUPIBOX_CONFIG})
/usr/bin/cat <<< $(/usr/bin/jq --arg v "${clientSecret}" '.spotify.clientSecret = $v' ${SONOS_CONFIG}) >  ${SONOS_CONFIG}
/usr/bin/cat <<< $(/usr/bin/jq --arg v "${clientSecret}" '.spotify.clientSecret = $v' ${SPOTIFYCONTROLLER_CONFIG}) >  ${SPOTIFYCONTROLLER_CONFIG}

accessToken=$(/usr/bin/jq -r .spotify.accessToken ${MUPIBOX_CONFIG})
/usr/bin/cat <<< $(/usr/bin/jq --arg v "${accessToken}" '.spotify.accessToken = $v' ${SPOTIFYCONTROLLER_CONFIG}) >  ${SPOTIFYCONTROLLER_CONFIG}

refreshToken=$(/usr/bin/jq -r .spotify.refreshToken ${MUPIBOX_CONFIG})
/usr/bin/cat <<< $(/usr/bin/jq --arg v "$refreshToken" '.spotify.refreshToken = $v' ${SPOTIFYCONTROLLER_CONFIG}) >  ${SPOTIFYCONTROLLER_CONFIG}

username=$(/usr/bin/jq -r .spotify.username ${MUPIBOX_CONFIG})
/usr/bin/sed -i 's/.*username.*/  username = '\"${username}\"'/g' ${SPOTIFYD_CONFIG}
password=$(/usr/bin/jq -r .spotify.password ${MUPIBOX_CONFIG})
/usr/bin/sed -i 's/.*password.*/  password = '\"${password}\"'/g' ${SPOTIFYD_CONFIG}

timeout=$(/usr/bin/jq -r .timeout.idleDisplayOff ${MUPIBOX_CONFIG})
/usr/bin/sed -i 's/.*Option \"BlankTime\".*/    Option \"BlankTime\" '\"${timeout}\"'/g' ${DISPLAY_STANDBY}
