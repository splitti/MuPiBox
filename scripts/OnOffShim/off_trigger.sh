#!/bin/bash
#

sudo mkdir /tmp/.rrd
sudo rrdtool create /tmp/.rrd/cputemp.rrd  --start now  --step 10  --no-overwrite  DS:cpu_temp:GAUGE:120:U:U  RRA:AVERAGE:0.5:1:120
sudo rrdtool create /tmp/.rrd/ram.rrd  --start now  --step 10  --no-overwrite  DS:ram:GAUGE:120:U:U  RRA:AVERAGE:0.5:1:120  DS:swap:GAUGE:120:U:U  RRA:AVERAGE:0.5:1:120
sudo rrdtool create /tmp/.rrd/cpuusage.rrd --start now  --step 10  --no-overwrite  DS:load1:GAUGE:120:0:U  DS:load5:GAUGE:120:0:U  DS:load15:GAUGE:120:0:U  RRA:AVERAGE:0.5:1:120  RRA:AVERAGE:0.5:5:120  RRA:AVERAGE:0.5:15:120  RRA:AVERAGE:0.5:60:120
sudo chmod 777 /tmp/.rrd/*.rrd

sleep 30

LOGFILE="/tmp/shutdown_control.log"
echo "$(date) - INFO:  Script started with PID $$" >> ${LOGFILE}

CONFIG="/etc/mupibox/mupiboxconfig.json"
TRIGGER_PIN=$(/usr/bin/jq -r .shim.triggerPin ${CONFIG} || echo "17")
PRESS_DELAY=$(/usr/bin/jq -r .timeout.pressDelay ${CONFIG})
START_VOLUME=$(/usr/bin/jq -r .mupibox.startVolume ${CONFIG})


GPIO_CHIP=$(ls /dev/ | grep -m 1 gpiochip)
if [ -z "$GPIO_CHIP" ]; then
    echo "$(date) - ERROR: No GPIO chip found, aborting." >> ${LOGFILE}
    exit 1
else
    echo "$(date) - INFO:  GPIO chip found -> ${GPIO_CHIP}" >> ${LOGFILE}	
fi

# Überprüfe den GPIO-Status
gpio_status=$(sudo gpioget ${GPIO_CHIP} ${TRIGGER_PIN})
echo "$(date) - INFO:  GPIO${TRIGGER_PIN} status: ${gpio_status}" >> ${LOGFILE}


sudo gpiomon --num-events=1 --falling-edge ${GPIO_CHIP} ${TRIGGER_PIN} &>> ${LOGFILE} &
GPIOMON_PID=$!
if [ $? -ne 0 ]; then
    echo "$(date) - ERROR: Failed to start gpiomon for GPIO${TRIGGER_PIN}" >> ${LOGFILE}
    exit 1
else
    echo "$(date) - INFO:  gpiomon started with PID ${GPIOMON_PID}" >> ${LOGFILE}
fi
wait $GPIOMON_PID
if [ $? -eq 0 ]; then
    echo "$(date) - INFO:  Button pressed, initiating shutdown" >> ${LOGFILE}

    # Aktionen bei Button-Druck
    /usr/bin/pactl set-sink-volume @DEFAULT_SINK@ ${START_VOLUME}%
    /usr/bin/aplay /home/dietpi/MuPiBox/sysmedia/sound/button_shutdown.wav

    echo "$(date) - INFO:  Stopping services" >> ${LOGFILE}
    sudo service mupi_startstop stop
    sudo service mupi_powerled stop

    echo "$(date) - INFO:  System shutdown initiated" >> ${LOGFILE}
    sudo poweroff
else
    echo "$(date) - ERROR: Error monitoring GPIO${TRIGGER_PIN}" >> ${LOGFILE}
fi
