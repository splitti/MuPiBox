#!/bin/bash
#
# Service: Update Mupibox Settings
# Will be done before Shutdown, or by the Setup

MUPIBOX_CONFIG="/etc/mupibox/mupiboxconfig.json"
SONOS_CONFIG="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json"
NETWORK_CONFIG="/tmp/network.json"
SPOTIFYCONTROLLER_CONFIG="/home/dietpi/.mupibox/spotifycontroller-main/config/config.json"
SPOTIFYD_CONFIG="/etc/spotifyd/spotifyd.conf"
DISPLAY_STANDBY="/etc/X11/xorg.conf.d/98-dietpi-disable_dpms.conf"
THEME_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/active_theme.css"
NEW_THEME=$(/usr/bin/jq -r .mupibox.theme ${MUPIBOX_CONFIG})

newTheme=$(ls -l ${THEME_FILE} | grep ${NEW_THEME})
if (( ${#newTheme} == 0 ))
then
 xargs rm <<< ${THEME_FILE}
 ln -s /home/dietpi/MuPiBox/themes/${NEW_THEME}.css ${THEME_FILE}
fi

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

ttsLanguage=$(/usr/bin/jq -r .mupibox.ttsLanguage ${MUPIBOX_CONFIG})
/usr/bin/cat <<< $(/usr/bin/jq --arg v "$ttsLanguage" '.ttsLanguage = $v' ${SPOTIFYCONTROLLER_CONFIG}) >  ${SPOTIFYCONTROLLER_CONFIG}

ip_control_backend=$(/usr/bin/jq -r .mupibox.ip_control_backend ${MUPIBOX_CONFIG})
if [ "$ip_control_backend" = true ] ; then
        IP=$(hostname -I)
		if [ "$IP" = "" ] ; then
			IP=$(/usr/bin/jq -r .ip ${NETWORK_CONFIG})
		fi		
        /usr/bin/cat <<< $(/usr/bin/jq --arg v "${IP}" '.["node-sonos-http-api"].ip = $v' ${SONOS_CONFIG}) >  ${SONOS_CONFIG}
fi
if [ "$ip_control_backend" = false ] ; then
        /usr/bin/cat <<< $(/usr/bin/jq '.["node-sonos-http-api"].ip = ""' ${SONOS_CONFIG}) > ${SONOS_CONFIG}
fi
/usr/bin/cat <<< $(/usr/bin/jq --arg v "5005" '.["node-sonos-http-api"].port = $v' ${SONOS_CONFIG}) >  ${SONOS_CONFIG}


username=$(/usr/bin/jq -r .spotify.username ${MUPIBOX_CONFIG})
/usr/bin/sed -i 's/.*username.*/  username = '\"${username}\"'/g' ${SPOTIFYD_CONFIG}
password=$(/usr/bin/jq -r .spotify.password ${MUPIBOX_CONFIG})
/usr/bin/sed -i 's/.*password.*/  password = '\"${password}\"'/g' ${SPOTIFYD_CONFIG}
hostname=$(/usr/bin/jq -r .mupibox.host ${MUPIBOX_CONFIG})
/usr/bin/sed -i 's/.*device_name.*/  device_name = '\"${hostname}\"'/g' ${SPOTIFYD_CONFIG}

timeout=$(/usr/bin/jq -r .timeout.idleDisplayOff ${MUPIBOX_CONFIG})
/usr/bin/sed -i 's/.*Option \"BlankTime\".*/    Option \"BlankTime\" '\"${timeout}\"'/g' ${DISPLAY_STANDBY}

#currentIP=$(hostname -I)
#/usr/bin/cat <<< $(/usr/bin/jq --arg v "${currentIP}" '.ip = $v' ${SONOS_NETWORK}) >  ${SONOS_NETWORK}
#currentHost=$(hostname)
#/usr/bin/cat <<< $(/usr/bin/jq --arg v "${currentHost}" '.host = $v' ${SONOS_NETWORK}) >  ${SONOS_NETWORK}

echo "Setting Update finished"
