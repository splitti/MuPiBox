#!/bin/sh
#

MUPIBOX_CONFIG="/etc/mupibox/mupiboxconfig.json"

ledPin=$(/usr/bin/jq -r .shim.ledPin ${MUPIBOX_CONFIG})
ledMax=$(/usr/bin/jq -r .shim.ledBrightnessMax ${MUPIBOX_CONFIG})

echo "${ledPin}=${ledMax}" > /dev/pi-blaster