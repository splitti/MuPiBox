#!/bin/bash
#
# Get Network-Data and create Online / Offline Data.json for showing Media in MuPiBox

DATA_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json"
ACTIVE_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/active_data.json"
OFFLINE_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/offline_data.json"
NETWORKCONFIG="/tmp/network.json"
OLDSTATE="SCRIPTINIT"
TRUESTATE='<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="24" height="24" viewBox="0 0 24 24"><path d="M12,21L15.6,16.2C14.6,15.45 13.35,15 12,15C10.65,15 9.4,15.45 8.4,16.2L12,21M12,3C7.95,3 4.21,4.34 1.2,6.6L3,9C5.5,7.12 8.62,6 12,6C15.38,6 18.5,7.12 21,9L22.8,6.6C19.79,4.34 16.05,3 12,3M12,9C9.3,9 6.81,9.89 4.8,11.4L6.6,13.8C8.1,12.67 9.97,12 12,12C14.03,12 15.9,12.67 17.4,13.8L19.2,11.4C17.19,9.89 14.7,9 12,9Z" /></svg>'
FALSESTATE='<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="24" height="24" viewBox="0 0 24 24"><path d="M2.28,3L1,4.27L2.47,5.74C2.04,6 1.61,6.29 1.2,6.6L3,9C3.53,8.6 4.08,8.25 4.66,7.93L6.89,10.16C6.15,10.5 5.44,10.91 4.8,11.4L6.6,13.8C7.38,13.22 8.26,12.77 9.2,12.47L11.75,15C10.5,15.07 9.34,15.5 8.4,16.2L12,21L14.46,17.73L17.74,21L19,19.72M12,3C9.85,3 7.8,3.38 5.9,4.07L8.29,6.47C9.5,6.16 10.72,6 12,6C15.38,6 18.5,7.11 21,9L22.8,6.6C19.79,4.34 16.06,3 12,3M12,9C11.62,9 11.25,9 10.88,9.05L14.07,12.25C15.29,12.53 16.43,13.07 17.4,13.8L19.2,11.4C17.2,9.89 14.7,9 12,9Z" /></svg>'

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
        echo -n $(jq '.[] | select(.type != "spotify") | select(.type != "tunein")' < ${DATA_FILE}) >> ${OFFLINE_FILE}
        echo -n "]" >> ${OFFLINE_FILE}
        sed -i 's/} {/}, {/g' ${OFFLINE_FILE}
        chown dietpi:dietpi ${OFFLINE_FILE}
elif [ $(stat --format='%Y' "${DATA_FILE}") -gt $(stat --format='%Y' "${OFFLINE_FILE}") ]; then
        echo -n "[" > ${OFFLINE_FILE}
        echo -n $(jq '.[] | select(.type != "spotify") | select(.type != "tunein")' < ${DATA_FILE}) >> ${OFFLINE_FILE}
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
	fi

	if [ "${ONLINESTATE}" != "${OLDSTATE}" ]; then
		/usr/bin/cat <<< $(/usr/bin/jq --arg v "${ONLINESTATE}" '.onlinestate = $v' ${NETWORKCONFIG}) >  ${NETWORKCONFIG}
	fi
	OLDSTATE=${ONLINESTATE}
	
	sleep 2
done