#!/bin/bash
#
# Shuts down the MupiBox after finishing the album

ALBUMSTOP_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/albumstop.json"


if [ ! -f ${ALBUMSTOP_FILE} ]; then
        sudo echo -n "{}" ${ALBUMSTOP_FILE}
        chown dietpi:dietpi ${ALBUMSTOP_FILE}
        /usr/bin/cat <<< $(/usr/bin/jq -n --arg v "Off" '.albumStop = $v' ${ALBUMSTOP_FILE}) >  ${ALBUMSTOP_FILE}
        sleep 10
        sudo bash /usr/local/bin/mupibox/shutdown.sh
else
        /usr/bin/cat <<< $(/usr/bin/jq --arg v "Off" '.albumStop = $v' ${ALBUMSTOP_FILE}) >  ${ALBUMSTOP_FILE}
        sleep 10
        sudo bash /usr/local/bin/mupibox/shutdown.sh
fi