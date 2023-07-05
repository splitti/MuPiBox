#!/bin/bash
#
# Activates the shutdown after the end of the current album.

ALBUMSTOP_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/albumstop.json"

if [ ! -f ${ALBUMSTOP_FILE} ]; then
        sudo echo -n "{}" ${ALBUMSTOP_FILE}
        chown dietpi:dietpi ${ALBUMSTOP_FILE}
        /usr/bin/cat <<< $(/usr/bin/jq -n --arg v "On" '.albumStop = $v' ${ALBUMSTOP_FILE}) >  ${ALBUMSTOP_FILE}
else
        /usr/bin/cat <<< $(/usr/bin/jq --arg v "On" '.albumStop = $v' ${ALBUMSTOP_FILE}) >  ${ALBUMSTOP_FILE}
fi