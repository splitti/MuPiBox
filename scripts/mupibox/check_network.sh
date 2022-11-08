#!/bin/bash
#
# Get Network-Data and create Online / Offline Data.json for showing Media in MuPiBox

DATA_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json"
ACTIVE_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/active_data.json"
OFFLINE_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/offline_data.json"
NETWORKCONFIG="/tmp/network.json"
OLDSTATE="unchecked"
TRUESTATE="online"
FALSESTATE="offline"

if [ ! -f ${DATA_FILE} ]; then
        echo -n "[]" > ${DATA_FILE}
        chown dietpi:dietpi ${DATA_FILE}
fi

if [ ! -f ${NETWORKCONFIG} ]; then
        sudo echo -n "[]" ${NETWORKCONFIG}
        chown dietpi:dietpi ${NETWORKCONFIG}
        chmod 777 ${NETWORKCONFIG}
        OLD_ONLINESTATE="starting"
        /usr/bin/cat <<< $(/usr/bin/jq -n --arg v "starting" '.onlinestate = $v' ${NETWORKCONFIG}) >  ${NETWORKCONFIG}
else
        OLD_ONLINESTATE=$(/usr/bin/jq -r .onlinestate ${NETWORKCONFIG})
fi

if [ ! -f ${OFFLINE_FILE} ]; then
        echo -n "[" > ${OFFLINE_FILE}
        echo -n $(jq '.[] | select(.type != "spotify") | select(.type != "show") | select(.type != "radio")' < ${DATA_FILE}) >> ${OFFLINE_FILE}
        echo -n "]" >> ${OFFLINE_FILE}
        sed -i 's/} {/}, {/g' ${OFFLINE_FILE}
        chown dietpi:dietpi ${OFFLINE_FILE}
elif [ $(stat --format='%Y' "${DATA_FILE}") -gt $(stat --format='%Y' "${OFFLINE_FILE}") ]; then
        echo -n "[" > ${OFFLINE_FILE}
        echo -n $(jq '.[] | select(.type != "spotify") | select(.type != "radio")' < ${DATA_FILE}) >> ${OFFLINE_FILE}
        echo -n "]" >> ${OFFLINE_FILE}
        sed -i 's/} {/}, {/g' ${OFFLINE_FILE}
fi

#wget -q --spider http://google.com

while true
do
	if ( $(/usr/bin/python3 /usr/local/bin/mupibox/check_network.py) == ${TRUESTATE} ); then
		ONLINESTATE=${TRUESTATE}
		if [ "${ONLINESTATE}" != "${OLDSTATE}" ]; then
			if [ ! -f ${ACTIVE_FILE} ]; then
				ln -s ${DATA_FILE} ${ACTIVE_FILE}
				chown dietpi:dietpi ${ACTIVE_FILE}
			elif [[ ${OLD_ONLINESTATE} != "online" ]]; then
				rm ${ACTIVE_FILE}
				ln -s ${DATA_FILE} ${ACTIVE_FILE}
				chown dietpi:dietpi ${ACTIVE_FILE}
			fi
		fi
	else
		ONLINESTATE=${FALSESTATE}	
		if [ "${ONLINESTATE}" != "${OLDSTATE}" ]; then
			if [ ! -f ${ACTIVE_FILE} ]; then
				ln -s ${OFFLINE_FILE} ${ACTIVE_FILE}
				chown dietpi:dietpi ${ACTIVE_FILE}
			elif [[ ${OLD_ONLINESTATE} != "offline" ]]; then
				rm ${ACTIVE_FILE}
				ln -s ${OFFLINE_FILE} ${ACTIVE_FILE}
				chown dietpi:dietpi ${ACTIVE_FILE}
			fi
		fi
		sudo ifconfig wlan0 down && sleep 2 && sudo ifconfig wlan0 up
	fi

	if [ "${ONLINESTATE}" != "${OLDSTATE}" ]; then
		/usr/bin/cat <<< $(/usr/bin/jq --arg v "${ONLINESTATE}" '.onlinestate = $v' ${NETWORKCONFIG}) >  ${NETWORKCONFIG}
	fi
	OLDSTATE=${ONLINESTATE}
	
	sleep 2
done