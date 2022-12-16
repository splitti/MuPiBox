#!/bin/sh
#

MUPIBOX_CONFIG="/etc/mupibox/mupiboxconfig.json"

ledPin=$(/usr/bin/jq -r .shim.ledPin ${MUPIBOX_CONFIG})
ledMax=$(/usr/bin/jq -r .shim.ledBrightnessMax ${MUPIBOX_CONFIG})
ledMax=$(echo "scale=2; $ledMax/100" | bc)
touch /tmp/.power_led

echo "${ledPin}=${ledMax}" > /dev/pi-blaster
sleep 30

while [ -f /tmp/.power_led ]
do
        sleep 1
        ledPin=$(/usr/bin/jq -r .shim.ledPin ${MUPIBOX_CONFIG})
        ledMax=$(/usr/bin/jq -r .shim.ledBrightnessMax ${MUPIBOX_CONFIG})
        ledMin=$(/usr/bin/jq -r .shim.ledBrightnessMin ${MUPIBOX_CONFIG})
        ledMin=$(echo "scale=2; $ledMin/100" | bc)
        ledMax=$(echo "scale=2; $ledMax/100" | bc)
        displayState=`vcgencmd display_power | grep -o '.$'`
        if [ ${displayState} -eq 0 ]
        then
                echo "${ledPin}=${ledMin}" > /dev/pi-blaster
        else
                echo "${ledPin}=${ledMax}" > /dev/pi-blaster            
        fi
done
