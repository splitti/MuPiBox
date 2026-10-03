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

# Set default PRESS_DELAY if not configured
if [ "$PRESS_DELAY" = "null" ] || [ -z "$PRESS_DELAY" ]; then
    PRESS_DELAY=3
fi

echo "$(date) - INFO:  Press delay set to ${PRESS_DELAY} seconds" >> ${LOGFILE}

GPIO_CHIP=$(ls /dev/ | grep -m 1 gpiochip)
if [ -z "$GPIO_CHIP" ]; then
    echo "$(date) - ERROR: No GPIO chip found, aborting." >> ${LOGFILE}
    exit 1
else
    echo "$(date) - INFO:  GPIO chip found -> ${GPIO_CHIP}" >> ${LOGFILE}	
fi

# The tools of libgpiod changed with version 2 (Debian 13 "Trixie"): other options for gpioget and gpiomon. Debian 12
# "Bookworm" (libgpiod 1) keeps the calls it always had.
GPIOD_V2=0
gpiomon --version 2>/dev/null | grep -q ' v2\.' && GPIOD_V2=1
echo "$(date) - INFO:  libgpiod $([ ${GPIOD_V2} = 1 ] && echo 2 || echo 1)" >> ${LOGFILE}

# The pin's level: 0 or 1
read_pin() {
    if [ ${GPIOD_V2} = 1 ]; then
        sudo gpioget --chip ${GPIO_CHIP} --numeric ${TRIGGER_PIN}
    else
        sudo gpioget ${GPIO_CHIP} ${TRIGGER_PIN}
    fi
}

# Waits for one press (a falling edge) of the button
wait_for_press() {
    if [ ${GPIOD_V2} = 1 ]; then
        sudo gpiomon --chip ${GPIO_CHIP} --num-events=1 --edges=falling ${TRIGGER_PIN}
    else
        sudo gpiomon --num-events=1 --falling-edge ${GPIO_CHIP} ${TRIGGER_PIN}
    fi
}

# Check GPIO status
gpio_status=$(read_pin)
echo "$(date) - INFO:  GPIO${TRIGGER_PIN} status: ${gpio_status}" >> ${LOGFILE}

check_button_pressed() {
    local button_state=$(read_pin)
    if [ "$button_state" = "0" ]; then
        return 0  # Button is pressed
    else
        return 1  # Button is not pressed
    fi
}

# Main monitoring loop
while true; do
    echo "$(date) - INFO:  Waiting for button press..." >> ${LOGFILE}
    wait_for_press &>> ${LOGFILE} &
    GPIOMON_PID=$!
    if [ $? -ne 0 ]; then
        echo "$(date) - ERROR: Failed to start gpiomon for GPIO${TRIGGER_PIN}" >> ${LOGFILE}
        sleep 5
        continue
    else
        echo "$(date) - INFO:  gpiomon started with PID ${GPIOMON_PID}" >> ${LOGFILE}
    fi

    wait $GPIOMON_PID
    if [ $? -eq 0 ]; then
        echo "$(date) - INFO:  Button pressed, checking hold duration..." >> ${LOGFILE}
        
        # Check if button is held for the required duration
        button_held=true
        for ((i=0; i<PRESS_DELAY; i++)); do
            if ! check_button_pressed; then
                echo "$(date) - INFO:  Button released after ${i} seconds, aborting shutdown" >> ${LOGFILE}
                button_held=false
                break
            fi
            sleep 1
        done
        
        if [ "$button_held" = true ]; then
            echo "$(date) - INFO:  Button held for ${PRESS_DELAY} seconds, initiating shutdown" >> ${LOGFILE}

            # Actions when button is pressed
            # the goodbye picture before anything else (the sounds and the shutdown come after it)
            /usr/local/bin/mupibox/show_goodbye.sh
            # whatever plays is stopped first (as mupi_shutdown.sh does): the volume set below would make it jump
            curl -s -m 2 -o /dev/null http://127.0.0.1:5005/stop
            sleep 0.3
            /usr/bin/pactl set-sink-volume @DEFAULT_SINK@ ${START_VOLUME}%
            /usr/bin/aplay /home/dietpi/MuPiBox/sysmedia/sound/button_shutdown.wav

            echo "$(date) - INFO:  Stopping services" >> ${LOGFILE}
            # (systemctl, not service: for stop, service asks every socket unit of the system first - 2.3 s)
            sudo systemctl stop mupi_startstop
            # (--no-block: the LED's goodbye animation takes about 2 s and runs on while the box shuts down)
            sudo systemctl --no-block stop mupi_powerled

            echo "$(date) - INFO:  System shutdown initiated" >> ${LOGFILE}
            sudo poweroff
        else
            echo "$(date) - INFO:  Button press duration insufficient, continuing monitoring" >> ${LOGFILE}
        fi
    else
        echo "$(date) - ERROR: Error monitoring GPIO${TRIGGER_PIN}" >> ${LOGFILE}
        sleep 5
    fi
done
