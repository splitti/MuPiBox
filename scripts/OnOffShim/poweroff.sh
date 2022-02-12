#!/bin/sh
#
# OnOff SHIM exposed by cyperghost for retropie.org.uk
# This is mandatory for proper SHIM shutdown!

CONFIG="/etc/mupibox/mupiboxconfig.json"
LED_PIN=`/usr/bin/jq -r .shim.triggerPin ${CONFIG}`
POWEROFF_PIN=`/usr/bin/jq -r .shim.poweroffPin ${CONFIG}`
CUT_PIN=`/usr/bin/jq -r .shim.cutPin ${CONFIG}`

if [ "$1" = "poweroff" ]; then
    # added by schlizbäda:
    /bin/echo ${CUT_PIN} > /sys/class/gpio/export
    /bin/echo out > /sys/class/gpio/gpio${CUT_PIN}/direction
    /bin/echo 1 > /sys/class/gpio/gpio${CUT_PIN}/value

    /bin/echo ${LED_PIN} > /sys/class/gpio/export
    /bin/echo out > /sys/class/gpio/gpio${LED_PIN}/direction

        for iteration in 1 2 3 4; do
            /bin/echo 0 > /sys/class/gpio/gpio${LED_PIN}/value
            /bin/sleep 0.2
            /bin/echo 1 > /sys/class/gpio/gpio${LED_PIN}/value
            /bin/sleep 0.2
       done

    /bin/echo ${POWEROFF_PIN} > /sys/class/gpio/export
    /bin/echo out > /sys/class/gpio/gpio${POWEROFF_PIN}/direction
    /bin/echo 0 > /sys/class/gpio/gpio${POWEROFF_PIN}/value
fi