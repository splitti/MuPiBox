#!/bin/bash
#
# HOSTNAME

CONFIG="/etc/mupibox/mupiboxconfig.json"
HOSTNAME=$(/usr/bin/jq -r .mupibox.host ${CONFIG})

echo $(curl http://${HOSTNAME}:5005/getDevices) | jq '.[] | select(.name=='\"$HOSTNAME\"')' | jq '.id'
