#!/bin/bash
#
# Get monitor blank information to block inputs if the screen is blank.

MONITOR_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/monitor.json"


if [ ! -f ${MONITOR_FILE} ]; then
        sudo echo -n "[]" ${MONITOR_FILE}
        chown dietpi:dietpi ${MONITOR_FILE}
        chmod 777 ${MONITOR_FILE}
fi

MONITOR=$(DISPLAY=:0 xset q | grep "Monitor" | awk '{print $3}')

if [ ${MONITOR} = 'Off' ]; then
        BLANK="true"
else
        BLANK="false"
fi

/usr/bin/cat <<< $(/usr/bin/jq --arg v "${BLANK}" '.blank = $v' ${MONITOR_FILE}) >  ${MONITOR_FILE}