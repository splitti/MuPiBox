#!/bin/sh
#
# OnOff SHIM exposed by cyperghost for retropie.org.uk
# This is optional as you can use any button trigger script as you like
# See this as a working example

sudo mkdir /tmp/.rrd
sudo rrdtool create /tmp/.rrd/cputemp.rrd  --start now  --step 10  --no-overwrite  DS:cpu_temp:GAUGE:120:U:U  RRA:AVERAGE:0.5:1:120
sudo rrdtool create /tmp/.rrd/cpuusage.rrd --start now  --step 60  --no-overwrite  DS:load1:GAUGE:120:0:U  DS:load5:GAUGE:120:0:U  DS:load15:GAUGE:120:0:U  RRA:AVERAGE:0.5:1:120  RRA:AVERAGE:0.5:5:120  RRA:AVERAGE:0.5:15:120  RRA:AVERAGE:0.5:60:120
sudo chmod 777 /tmp/.rrd/*.rrd

sleep 10

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

SHUT_SOUND=$(/usr/bin/jq -r .mupibox.shutSound ${CONFIG})
START_VOLUME=$(/usr/bin/jq -r .mupibox.startVolume ${CONFIG})
AUDIO_DEVICE=$(/usr/bin/jq -r .mupibox.audioDevice ${CONFIG})
/usr/bin/amixer sset ${AUDIO_DEVICE} ${START_VOLUME}%

/usr/bin/mplayer -volume 100 ${SHUT_SOUND}

#sudo shutdown -h now
poweroff