#!/bin/bash
#
# Get monitor blank information to block inputs if the screen is blank.

MONITOR_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/monitor.json"


if [ ! -f ${MONITOR_FILE} ]; then
        sudo echo -n '{"blank": "Off"}' ${MONITOR_FILE}
        chown dietpi:dietpi ${MONITOR_FILE}
        chmod 777 ${MONITOR_FILE}
fi

while true
do

        MONITOR=$(DISPLAY=:0 xset q | grep "Monitor" | awk '{print $3}')

        /usr/bin/cat <<< $(/usr/bin/jq --arg v "${MONITOR}" '.blank = $v' ${MONITOR_FILE}) >  ${MONITOR_FILE}

	sleep 2
done