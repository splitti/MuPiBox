#!/bin/sh
#
# OnOff SHIM exposed by cyperghost for retropie.org.uk
# This is mandatory for proper SHIM shutdown!

MUPIBOX_CONFIG="/etc/mupibox/mupiboxconfig.json"
POWEROFF_PIN=$(/usr/bin/jq -r .shim.poweroffPin ${MUPIBOX_CONFIG})
CUT_PIN=$(/usr/bin/jq -r .shim.cutPin ${MUPIBOX_CONFIG})

if [ "$1" = "poweroff" ]; then
    # added by schlizbaeda:
    /usr/bin/gpioset $(/usr/bin/gpiofind GPIO${CUT_PIN})=1
    /usr/bin/gpioset $(/usr/bin/gpiofind GPIO${POWEROFF_PIN})=0
fi
