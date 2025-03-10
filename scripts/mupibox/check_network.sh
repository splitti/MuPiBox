#!/bin/bash
#
# Get Network-Data

NETWORKCONFIG="/tmp/network.json"
OLDSTATE="starting"
TRUESTATE="online"
FALSESTATE="offline"

if [ ! -f ${NETWORKCONFIG} ]; then
        sudo echo -n "[]" ${NETWORKCONFIG}
        chown dietpi:dietpi ${NETWORKCONFIG}
        chmod 777 ${NETWORKCONFIG}
        /usr/bin/cat <<< $(/usr/bin/jq -n --arg v "starting" '.onlinestate = $v' ${NETWORKCONFIG}) >  ${NETWORKCONFIG}
else
        OLD_ONLINESTATE=$(/usr/bin/jq -r .onlinestate ${NETWORKCONFIG})
fi

#wget -q --spider http://google.com

while true
do
	if ( $(/usr/bin/python3 /usr/local/bin/mupibox/check_network.py) == ${TRUESTATE} ); then
		ONLINESTATE=${TRUESTATE}
	else
		ONLINESTATE=${FALSESTATE}
	fi

	if [ "${ONLINESTATE}" != "${OLDSTATE}" ]; then
		/usr/bin/cat <<< $(/usr/bin/jq --arg v "${ONLINESTATE}" '.onlinestate = $v' ${NETWORKCONFIG}) >  ${NETWORKCONFIG}
	fi
	OLDSTATE=${ONLINESTATE}
	
	sleep 10
done
