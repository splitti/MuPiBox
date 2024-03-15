#!/bin/bash
#
# Get Network-Data and create Online / Offline Data.json for showing Media in MuPiBox

DATA_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json"
ACTIVE_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/active_data.json"
OFFLINE_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/offline_data.json"
RESUME_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/resume.json"
ACTIVERESUME_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/active_resume.json"
OFFLINERESUME_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/offline_resume.json"
NETWORKCONFIG="/tmp/network.json"
OLDSTATE="starting"
TRUESTATE="online"
FALSESTATE="offline"
DATA_LOCK="/tmp/.data.lock"
RESUME_LOCK="/tmp/.resume.lock"

if [ ! -f ${DATA_FILE} ]; then
	if [ -f "${DATA_LOCK}" ]; then
		echo "Data-file locked."
		exit
	else
		touch ${DATA_LOCK}
		echo -n "[]" >${DATA_FILE}
		chown dietpi:dietpi ${DATA_FILE}
		rm ${DATA_LOCK}
	fi
fi

if [ ! -f ${RESUME_FILE} ]; then
	if [ -f "${RESUME_LOCK}" ]; then
		echo "Resume-file locked."
		exit
	else
		touch ${RESUME_LOCK}
		echo -n "[]" >${RESUME_FILE}
		chown dietpi:dietpi ${RESUME_FILE}
		rm ${RESUME_LOCK}
	fi
fi

if [ ! -f ${NETWORKCONFIG} ]; then
	sudo echo -n "[]" ${NETWORKCONFIG}
	chown dietpi:dietpi ${NETWORKCONFIG}
	chmod 777 ${NETWORKCONFIG}
	/usr/bin/cat <<<$(/usr/bin/jq -n --arg v "starting" '.onlinestate = $v' ${NETWORKCONFIG}) >${NETWORKCONFIG}
else
	OLD_ONLINESTATE=$(/usr/bin/jq -r .onlinestate ${NETWORKCONFIG})
fi

#wget -q --spider http://google.com

while true; do
	if ($(/usr/bin/python3 /usr/local/bin/mupibox/check_network.py) == ${TRUESTATE}); then
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
			if [ ! -f ${ACTIVERESUME_FILE} ]; then
				ln -s ${RESUME_FILE} ${ACTIVERESUME_FILE}
				chown dietpi:dietpi ${ACTIVERESUME_FILE}
			elif [[ ${OLD_ONLINESTATE} != "online" ]]; then
				rm ${ACTIVERESUME_FILE}
				ln -s ${RESUME_FILE} ${ACTIVERESUME_FILE}
				chown dietpi:dietpi ${ACTIVERESUME_FILE}
			fi
		fi
	else
		ONLINESTATE=${FALSESTATE}
		if [ ! -f ${OFFLINE_FILE} ]; then
			echo -n "[" >${OFFLINE_FILE}
			echo -n $(jq '.[] | select(.type != "spotify") | select(.type != "radio" | select(.type != "rss")' <${DATA_FILE}) >>${OFFLINE_FILE}
			echo -n "]" >>${OFFLINE_FILE}
			sed -i 's/} {/}, {/g' ${OFFLINE_FILE}
			chown dietpi:dietpi ${OFFLINE_FILE}
		elif [ ! -s ${OFFLINE_FILE} ]; then
			rm ${OFFLINE_FILE}
			echo -n "[" >${OFFLINE_FILE}
			echo -n $(jq '.[] | select(.type != "spotify") | select(.type != "radio" | select(.type != "rss")' <${DATA_FILE}) >>${OFFLINE_FILE}
			echo -n "]" >>${OFFLINE_FILE}
			sed -i 's/} {/}, {/g' ${OFFLINE_FILE}
			chown dietpi:dietpi ${OFFLINE_FILE}
		elif [ $(stat --format='%Y' "${DATA_FILE}") -gt $(stat --format='%Y' "${OFFLINE_FILE}") ]; then
			echo -n "[" >${OFFLINE_FILE}
			echo -n $(jq '.[] | select(.type != "spotify") | select(.type != "radio" | select(.type != "rss")' <${DATA_FILE}) >>${OFFLINE_FILE}
			echo -n "]" >>${OFFLINE_FILE}
			sed -i 's/} {/}, {/g' ${OFFLINE_FILE}
		fi
		if [ ! -f ${OFFLINERESUME_FILE} ]; then
			echo -n "[" >${OFFLINERESUME_FILE}
			echo -n $(jq '.[] | select(.type != "spotify") | select(.type != "radio" | select(.type != "rss")' <${RESUME_FILE}) >>${OFFLINERESUME_FILE}
			echo -n "]" >>${OFFLINERESUME_FILE}
			sed -i 's/} {/}, {/g' ${OFFLINERESUME_FILE}
			chown dietpi:dietpi ${OFFLINERESUME_FILE}
		elif [ ! -s ${OFFLINERESUME_FILE} ]; then
			rm ${OFFLINERESUME_FILE}
			echo -n "[" >${OFFLINERESUME_FILE}
			echo -n $(jq '.[] | select(.type != "spotify") | select(.type != "radio" | select(.type != "rss")' <${RESUME_FILE}) >>${OFFLINERESUME_FILE}
			echo -n "]" >>${OFFLINERESUME_FILE}
			sed -i 's/} {/}, {/g' ${OFFLINERESUME_FILE}
			chown dietpi:dietpi ${OFFLINERESUME_FILE}
		elif [ $(stat --format='%Y' "${RESUME_FILE}") -gt $(stat --format='%Y' "${OFFLINERESUME_FILE}") ]; then
			echo -n "[" >${OFFLINERESUME_FILE}
			echo -n $(jq '.[] | select(.type != "spotify") | select(.type != "radio" | select(.type != "rss")' <${RESUME_FILE}) >>${OFFLINERESUME_FILE}
			echo -n "]" >>${OFFLINERESUME_FILE}
			sed -i 's/} {/}, {/g' ${OFFLINERESUME_FILE}
		fi
		if [ "${ONLINESTATE}" != "${OLDSTATE}" ]; then
			if [ ! -f ${ACTIVE_FILE} ]; then
				ln -s ${OFFLINE_FILE} ${ACTIVE_FILE}
				chown dietpi:dietpi ${ACTIVE_FILE}
			elif [[ ${OLD_ONLINESTATE} != "offline" ]]; then
				rm ${ACTIVE_FILE}
				ln -s ${OFFLINE_FILE} ${ACTIVE_FILE}
				chown dietpi:dietpi ${ACTIVE_FILE}
			fi
			if [ ! -f ${ACTIVERESUME_FILE} ]; then
				ln -s ${OFFLINERESUME_FILE} ${ACTIVERESUME_FILE}
				chown dietpi:dietpi ${ACTIVERESUME_FILE}
			elif [[ ${OLD_ONLINESTATE} != "offline" ]]; then
				rm ${ACTIVERESUME_FILE}
				ln -s ${OFFLINERESUME_FILE} ${ACTIVERESUME_FILE}
				chown dietpi:dietpi ${ACTIVERESUME_FILE}
			fi
		fi
	fi

	if [ "${ONLINESTATE}" != "${OLDSTATE}" ]; then
		/usr/bin/cat <<<$(/usr/bin/jq --arg v "${ONLINESTATE}" '.onlinestate = $v' ${NETWORKCONFIG}) >${NETWORKCONFIG}
		if [ "${ONLINESTATE}" == ${TRUESTATE} ]; then
			/usr/local/bin/mupibox/./get_network.sh
		fi
	fi
	OLDSTATE=${ONLINESTATE}

	sleep 60
done
