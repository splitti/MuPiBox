#!/bin/sh
#
# OnOff SHIM exposed by cyperghost for retropie.org.uk
# This is optional as you can use any button trigger script as you like
# See this as a working example

CONFIG="/etc/mupibox/mupiboxconfig.json"
TRIGGER_PIN=$(/usr/bin/jq -r .shim.triggerPin ${CONFIG})

# Check if OnOff-Button is pressed
/bin/echo ${TRIGGER_PIN} > /sys/class/gpio/export
/bin/echo in > /sys/class/gpio/gpio${TRIGGER_PIN}/direction

power=$(cat /sys/class/gpio/gpio${TRIGGER_PIN}/value)
[ $power = 0 ] && switchtype="1" #Not a momentary button
[ $power = 1 ] && switchtype="0" #Momentary button

until [ $power = $switchtype ]; do
    power=$(cat /sys/class/gpio/gpio${TRIGGER_PIN}/value)
    sleep 1
done

poweroff