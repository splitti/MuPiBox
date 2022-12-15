#!/bin/sh
#

MUPIBOX_CONFIG="/etc/mupibox/mupiboxconfig.json"

ledPin=$(/usr/bin/jq -r .shim.ledPin ${MUPIBOX_CONFIG})
ledMax=$(($(/usr/bin/jq -r .shim.ledBrightnessMax ${MUPIBOX_CONFIG})/100))

echo "${ledPin}=${ledMax}" > /dev/pi-blaster

while :
do
	sleep 1
	ledPin=$(/usr/bin/jq -r .shim.ledPin ${MUPIBOX_CONFIG})
	ledMax=$(($(/usr/bin/jq -r .shim.ledBrightnessMax ${MUPIBOX_CONFIG})/100))
	ledMin=$(($(/usr/bin/jq -r .shim.ledBrightnessMin ${MUPIBOX_CONFIG})/100))
	displayState=$(sudo vcgencmd display_power | grep -o '.$')
	if [ displayState = 0 ]
	then
		echo "${ledPin}=${ledMin}" > /dev/pi-blaster
	else
		echo "${ledPin}=${ledMax}" > /dev/pi-blaster		
	fi
done