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

# Start gpiomon, um auf Ereignisse zu warten
gpiomon --num-events=1 --rising-edge ${GPIO_CHIP} ${TRIGGER_PIN} &
GPIOMON_PID=$!

wait $GPIOMON_PID
if [ $? -eq 0 ]; then
    echo "$(date): Button pressed, initiating shutdown" >> ${LOGFILE}

    # Aktionen bei Button-Druck
    /usr/bin/pactl set-sink-volume @DEFAULT_SINK@ ${START_VOLUME}%
    /usr/bin/aplay /home/dietpi/MuPiBox/sysmedia/sound/button_shutdown.wav

    echo "$(date): Stopping services" >> ${LOGFILE}
    sudo service mupi_startstop stop
    sudo service mupi_powerled stop

    echo "$(date): System shutdown initiated" >> ${LOGFILE}
    sudo poweroff
else
    echo "$(date): Error monitoring GPIO${TRIGGER_PIN}" >> ${LOGFILE}
fi
