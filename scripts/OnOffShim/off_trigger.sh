#!/bin/sh
#
# OnOff SHIM exposed by cyperghost for retropie.org.uk
# This is optional as you can use any button trigger script as you like
# See this as a working example

sudo mkdir /tmp/.rrd
sudo rrdtool create /tmp/.rrd/cputemp.rrd  --start now  --step 10  --no-overwrite  DS:cpu_temp:GAUGE:120:U:U  RRA:AVERAGE:0.5:1:120
sudo rrdtool create /tmp/.rrd/ram.rrd  --start now  --step 10  --no-overwrite  DS:ram:GAUGE:120:U:U  RRA:AVERAGE:0.5:1:120  DS:swap:GAUGE:120:U:U  RRA:AVERAGE:0.5:1:120
sudo rrdtool create /tmp/.rrd/cpuusage.rrd --start now  --step 10  --no-overwrite  DS:load1:GAUGE:120:0:U  DS:load5:GAUGE:120:0:U  DS:load15:GAUGE:120:0:U  RRA:AVERAGE:0.5:1:120  RRA:AVERAGE:0.5:5:120  RRA:AVERAGE:0.5:15:120  RRA:AVERAGE:0.5:60:120
sudo chmod 777 /tmp/.rrd/*.rrd

sleep 10

CONFIG="/etc/mupibox/mupiboxconfig.json"
TRIGGER_PIN=$(/usr/bin/jq -r .shim.triggerPin ${CONFIG})
PRESS_DELAY=$(/usr/bin/jq -r .timeout.pressDelay ${CONFIG})
START_VOLUME=$(/usr/bin/jq -r .mupibox.startVolume ${CONFIG})

# Check if OnOff-Button is pressed
/bin/echo ${TRIGGER_PIN} > /sys/class/gpio/export
/bin/echo in > /sys/class/gpio/gpio${TRIGGER_PIN}/direction

power=$(cat /sys/class/gpio/gpio${TRIGGER_PIN}/value)
[ $power = 0 ] && switchtype="1" #Not a momentary button
[ $power = 1 ] && switchtype="0" #Momentary button

until [ $power = $switchtype ]; do
	sleep ${PRESS_DELAY}
    power=$(cat /sys/class/gpio/gpio${TRIGGER_PIN}/value)
	if [ $power = $switchtype ]; then
		power=$(cat /sys/class/gpio/gpio${TRIGGER_PIN}/value)
		/usr/bin/pactl set-sink-volume @DEFAULT_SINK@ ${START_VOLUME}% 
		/usr/bin/aplay /home/dietpi/MuPiBox/sysmedia/sound/button_shutdown.wav
		#/usr/bin/mplayer -volume ${START_VOLUME} ${START_SOUND} &
	fi
    sleep 0.05
done

sudo service mupi_startstop stop
#sudo su - -c 'nohup /usr/local/bin/mupibox/./mupi_stop_led.sh > /dev/null 2>&1 &'
sudo service mupi_powerled stop 

#sudo shutdown -h now
poweroff
