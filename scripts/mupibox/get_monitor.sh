#!/bin/bash
#
# Get monitor blank information to block inputs if the screen is blank.

MONITOR_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/monitor.json"
minimumsize=18

while true
do

        actualsize=$(wc -c <"${MONITOR_FILE}")

        if [ ! -f ${MONITOR_FILE} ]; then
                sudo echo -n "{}" ${MONITOR_FILE}
                sudo chown dietpi:dietpi ${MONITOR_FILE}
                /usr/bin/cat <<< $(/usr/bin/jq -n --arg v "On" '.monitor = $v' ${MONITOR_FILE}) >  ${MONITOR_FILE}
        elif [ $actualsize -le $minimumsize ]; then
                sudo rm ${MONITOR_FILE}
                sudo echo -n "{}" ${MONITOR_FILE}
                sudo chown dietpi:dietpi ${MONITOR_FILE}
                /usr/bin/cat <<< $(/usr/bin/jq -n --arg v "On" '.monitor = $v' ${MONITOR_FILE}) >  ${MONITOR_FILE}
        else
                MONITOR=$(sudo -H -u root bash -c "vcgencmd display_power")
                MONITOR=(${MONITOR##*=})
                POWER=-1
                if [ ${MONITOR} == "-1" ]; then
                  POWER=$(cat /sys/class/backlight/*/bl_power)
                fi

                if [ ${MONITOR} == "0" ] || [ ${POWER} == "4" ]; then
                        /usr/bin/cat <<< $(/usr/bin/jq --arg v "Off" '.monitor = $v' ${MONITOR_FILE}) >  ${MONITOR_FILE}
                elif [ ${MONITOR} == "1" ] || [ ${POWER} == "0" ]; then
                        /usr/bin/cat <<< $(/usr/bin/jq --arg v "On" '.monitor = $v' ${MONITOR_FILE}) >  ${MONITOR_FILE}
                fi
        fi

	sleep 1
done
