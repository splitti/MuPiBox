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
        echo -n "[]" > ${DATA_FILE}
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
        echo -n "[]" > ${RESUME_FILE}
        chown dietpi:dietpi ${RESUME_FILE}
		rm ${RESUME_LOCK}
	fi
fi

# Writes the online state without disturbing the fields get_network.sh fills in.
# The update goes through a temporary file, so a reader never catches the file half
# written, and a file that is no longer valid JSON is rebuilt instead of staying
# broken for the rest of the uptime - that used to leave the box showing
# "no connection" until it was rebooted.
write_onlinestate() {
	local tmp
	tmp=$(/usr/bin/mktemp "${NETWORKCONFIG}.XXXXXX")
	if /usr/bin/jq --arg v "$1" '.onlinestate = $v' "${NETWORKCONFIG}" > "${tmp}" 2>/dev/null; then
		chmod 666 "${tmp}" 2>/dev/null
		mv -f "${tmp}" "${NETWORKCONFIG}"
	elif /usr/bin/jq -n --arg v "$1" '{onlinestate: $v}' > "${tmp}" 2>/dev/null; then
		chmod 666 "${tmp}" 2>/dev/null
		mv -f "${tmp}" "${NETWORKCONFIG}"
	else
		rm -f "${tmp}"
	fi
}

if [ ! -f ${NETWORKCONFIG} ]; then
        write_onlinestate "starting"
fi

#wget -q --spider http://google.com

while true
do
	if /usr/bin/python3 /usr/local/bin/mupibox/check_network.py; then
		ONLINESTATE=${TRUESTATE}
		if [ "${ONLINESTATE}" != "${OLDSTATE}" ]; then
			rm -f "${ACTIVE_FILE}"
			ln -s "${DATA_FILE}" "${ACTIVE_FILE}"
			chown dietpi:dietpi "${ACTIVE_FILE}"
			rm -f "${ACTIVERESUME_FILE}"
			ln -s "${RESUME_FILE}" "${ACTIVERESUME_FILE}"
			chown dietpi:dietpi "${ACTIVERESUME_FILE}"
		fi
	else
		ONLINESTATE=${FALSESTATE}
		if [ ! -f ${OFFLINE_FILE} ]; then
			echo -n "[" > ${OFFLINE_FILE}
			echo -n $(jq '.[] | select(.type != "spotify") | select(.type != "radio" | select(.type != "rss")' < ${DATA_FILE}) >> ${OFFLINE_FILE}
			echo -n "]" >> ${OFFLINE_FILE}
			sed -i 's/} {/}, {/g' ${OFFLINE_FILE}
			chown dietpi:dietpi ${OFFLINE_FILE}
		elif [ ! -s ${OFFLINE_FILE} ]; then
			rm ${OFFLINE_FILE}
			echo -n "[" > ${OFFLINE_FILE}
			echo -n $(jq '.[] | select(.type != "spotify") | select(.type != "radio" | select(.type != "rss")' < ${DATA_FILE}) >> ${OFFLINE_FILE}
			echo -n "]" >> ${OFFLINE_FILE}
			sed -i 's/} {/}, {/g' ${OFFLINE_FILE}
			chown dietpi:dietpi ${OFFLINE_FILE}
		elif [ $(stat --format='%Y' "${DATA_FILE}") -gt $(stat --format='%Y' "${OFFLINE_FILE}") ]; then
			echo -n "[" > ${OFFLINE_FILE}
			echo -n $(jq '.[] | select(.type != "spotify") | select(.type != "radio" | select(.type != "rss")' < ${DATA_FILE}) >> ${OFFLINE_FILE}
			echo -n "]" >> ${OFFLINE_FILE}
			sed -i 's/} {/}, {/g' ${OFFLINE_FILE}
		fi
		if [ ! -f ${OFFLINERESUME_FILE} ]; then
			echo -n "[" > ${OFFLINERESUME_FILE}
			echo -n $(jq '.[] | select(.type != "spotify") | select(.type != "radio" | select(.type != "rss")' < ${RESUME_FILE}) >> ${OFFLINERESUME_FILE}
			echo -n "]" >> ${OFFLINERESUME_FILE}
			sed -i 's/} {/}, {/g' ${OFFLINERESUME_FILE}
			chown dietpi:dietpi ${OFFLINERESUME_FILE}
		elif [ ! -s ${OFFLINERESUME_FILE} ]; then
			rm ${OFFLINERESUME_FILE}
			echo -n "[" > ${OFFLINERESUME_FILE}
			echo -n $(jq '.[] | select(.type != "spotify") | select(.type != "radio" | select(.type != "rss")' < ${RESUME_FILE}) >> ${OFFLINERESUME_FILE}
			echo -n "]" >> ${OFFLINERESUME_FILE}
			sed -i 's/} {/}, {/g' ${OFFLINERESUME_FILE}
			chown dietpi:dietpi ${OFFLINERESUME_FILE}
		elif [ $(stat --format='%Y' "${RESUME_FILE}") -gt $(stat --format='%Y' "${OFFLINERESUME_FILE}") ]; then
			echo -n "[" > ${OFFLINERESUME_FILE}
			echo -n $(jq '.[] | select(.type != "spotify") | select(.type != "radio" | select(.type != "rss")' < ${RESUME_FILE}) >> ${OFFLINERESUME_FILE}
			echo -n "]" >> ${OFFLINERESUME_FILE}
			sed -i 's/} {/}, {/g' ${OFFLINERESUME_FILE}
		fi
		if [ "${ONLINESTATE}" != "${OLDSTATE}" ]; then
			rm -f "${ACTIVE_FILE}"
			ln -s "${OFFLINE_FILE}" "${ACTIVE_FILE}"
			chown dietpi:dietpi "${ACTIVE_FILE}"
			rm -f "${ACTIVERESUME_FILE}"
			ln -s "${OFFLINERESUME_FILE}" "${ACTIVERESUME_FILE}"
			chown dietpi:dietpi "${ACTIVERESUME_FILE}"
		fi
	fi

	# Written on every pass, not only when the state changes: should a parallel
	# get_network.sh run have overwritten it, this puts it back within ten seconds
	# instead of leaving a wrong state behind until the next real change.
	write_onlinestate "${ONLINESTATE}"

	if [ "${ONLINESTATE}" != "${OLDSTATE}" ]; then
		echo "Online state changed to ${ONLINESTATE}."
	#	if [ "${ONLINESTATE}" == "${FALSESTATE}" ] && [ "${OLDSTATE}" != "starting" ]; then
	#		#sudo dhclient -r
	#		sudo service ifup@wlan0 stop
	#		sleep 5
	#		sudo service ifup@wlan0 start
	#		#sudo dhclient
	#	fi
	fi
	OLDSTATE=${ONLINESTATE}
	
	sleep 10
done
