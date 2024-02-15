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
                MONITOR=$(DISPLAY=:0 xset q | grep "Monitor" | awk '{print $3}')
                /usr/bin/cat <<< $(/usr/bin/jq --arg v "${MONITOR}" '.monitor = $v' ${MONITOR_FILE}) >  ${MONITOR_FILE}
        fi

	sleep 1
done