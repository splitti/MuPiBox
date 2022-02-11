#!/bin/sh
#
# OnOff SHIM exposed by cyperghost for retropie.org.uk
# This is mandatory for proper SHIM shutdown!


poweroff_pin="4"
led_pin="17"
cut_pin="27" # added by schlizbäda

if [ "$1" = "poweroff" ]; then
    # added by schlizbäda:
    /bin/echo $cut_pin > /sys/class/gpio/export
    /bin/echo out > /sys/class/gpio/gpio$cut_pin/direction
    /bin/echo 1 > /sys/class/gpio/gpio$cut_pin/value

    /bin/echo $led_pin > /sys/class/gpio/export
    /bin/echo out > /sys/class/gpio/gpio$led_pin/direction

        for iteration in 1 2 3 4; do
            /bin/echo 0 > /sys/class/gpio/gpio$led_pin/value
            /bin/sleep 0.2
            /bin/echo 1 > /sys/class/gpio/gpio$led_pin/value
            /bin/sleep 0.2
       done

    /bin/echo $poweroff_pin > /sys/class/gpio/export
    /bin/echo out > /sys/class/gpio/gpio$poweroff_pin/direction
    /bin/echo 0 > /sys/class/gpio/gpio$poweroff_pin/value
fi