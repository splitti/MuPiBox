#!/bin/bash
#
# HOSTNAME

CONFIG="/etc/mupibox/mupiboxconfig.json"
HOSTNAME=$(sudo /usr/bin/jq -r .mupibox.host ${CONFIG})
DEVICES=$(curl http://${HOSTNAME}:5005/getDevices 2>/dev/null)
devID=$(echo ${DEVICES} | jq '.[] | select(.name=='\"${HOSTNAME}\"')' | jq '.id')
devID=$(echo ${devID} | sed 's/\"//g')
if [ ${#devID} > 5 ];
then
        sudo /usr/bin/cat <<< $(/usr/bin/jq --arg v "${devID}" '.spotify.deviceId = $v' ${CONFIG}) > ${CONFIG}

fi
sudo /usr/local/bin/mupibox/./setting_update.sh
sudo /usr/local/bin/mupibox/./spotify_restart.sh
