#!/bin/sh
#
# OnOff SHIM exposed by cyperghost for retropie.org.uk
# This is mandatory for proper SHIM shutdown!

CONFIG="/etc/mupibox/mupiboxconfig.json"
POWEROFF_PIN=$(/usr/bin/jq -r .shim.poweroffPin ${CONFIG})
CUT_PIN=$(/usr/bin/jq -r .shim.cutPin ${CONFIG})

if [ "$1" = "poweroff" ]; then
    # added by schlizbaeda:
    /usr/bin/gpioset $(/usr/bin/gpiofind GPIO${TRIGGER_PIN})=1
    /usr/bin/gpioset $(/usr/bin/gpiofind GPIO${POWEROFF_PIN})=0
fi
