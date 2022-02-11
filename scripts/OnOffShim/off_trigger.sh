#!/bin/sh
#
# OnOff SHIM exposed by cyperghost for retropie.org.uk
# This is optional as you can use any button trigger script as you like
# See this as a working example


trigger_pin="17"
/bin/echo $trigger_pin > /sys/class/gpio/export
/bin/echo in > /sys/class/gpio/gpio$trigger_pin/direction

power=$(cat /sys/class/gpio/gpio$trigger_pin/value)
[ $power = 0 ] && switchtype="1" #Not a momentary button
[ $power = 1 ] && switchtype="0" #Momentary button

until [ $power = $switchtype ]; do
    power=$(cat /sys/class/gpio/gpio$trigger_pin/value)
    sleep 1
done

mpg123 /home/pi/RPi-Jukebox-RFID/shared/shutdownsound.mp3
poweroff