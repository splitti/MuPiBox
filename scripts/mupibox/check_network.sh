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

if [ ! -f ${NETWORKCONFIG} ] || [ ! -s ${NETWORKCONFIG} ] || ! /usr/bin/jq -e 'type == "object"' ${NETWORKCONFIG} >/dev/null 2>&1; then
        # HIGH-14 (Phase-3) + Phase-5 follow-up: the previous "fix" piped
        # via `sudo tee` which produced a root-owned seed file in /tmp.
        # The next line's tempfile + mv ran as dietpi and silently failed
        # to replace the root-owned target — leaving the wrong (empty array)
        # seed in place forever. Drop sudo entirely (the script runs as
        # dietpi which can write /tmp directly), and seed as an OBJECT
        # `{}` since network.json is shaped as one (every consumer reads
        # it via `.onlinestate` etc). The existence-or-empty-or-wrong-
        # shape guard above also recovers from the broken state we
        # produced earlier without manual cleanup.
        rm -f "${NETWORKCONFIG}"
        echo -n "{}" > "${NETWORKCONFIG}"
        # Atomic-update (HIGH-8).
        _TMP="${NETWORKCONFIG}.tmp.$$"
        /usr/bin/jq -n --arg v "starting" '.onlinestate = $v' > "${_TMP}" && mv "${_TMP}" "${NETWORKCONFIG}" || rm -f "${_TMP}"
        OLD_ONLINESTATE="starting"
else
        OLD_ONLINESTATE=$(/usr/bin/jq -r .onlinestate ${NETWORKCONFIG})
fi

#wget -q --spider http://google.com

# Idempotent symlink reconciliation. Always points $link at $target —
# if the link already points there, no-op. Replaces the previous
# state-transition-only logic that depended on detecting a change
# from OLDSTATE → ONLINESTATE; that logic missed the case where
# check_network.sh starts up in a state that already matches stored
# OLD_ONLINESTATE but where the on-disk symlink is still pointing at
# the wrong target (e.g. after a pm2 restart while box was already
# online — both ONLINESTATE and OLD_ONLINESTATE = "online", no flip
# fired, but the symlink may still be pointing at offline_data.json
# from a prior offline session). Symptom: active_data.json never
# resolved to data.json post-reboot, so the API served the offline
# (Spotify-less) shape even though the box was clearly online.
ensure_symlink() {
	local target="$1"
	local link="$2"
	if [ ! -L "$link" ] || [ "$(readlink "$link")" != "$target" ]; then
		rm -f "$link"
		ln -s "$target" "$link"
		chown -h dietpi:dietpi "$link" 2>/dev/null || sudo chown -h dietpi:dietpi "$link"
	fi
}

while true
do
	# AR5-1: was `if ( $(python3 ...) == ${TRUESTATE} )` — that's a bash
	# subshell executing the python output as a command (with `==` and the
	# literal string as args), not a string comparison. Subshell exit 127
	# made the if-condition permanently false.
	# AR5-1.1: ALSO — check_network.py prints the string "true"/"false"
	# (not "online"/"offline"), so even a correct string-test against
	# ${TRUESTATE}="online" would always be false. The original bash-bug
	# was masking this mismatch. Compare against the actual python output.
	# ONLINESTATE keeps its "online"/"offline" values for downstream
	# consumers of /tmp/network.json.
	if [ "$(/usr/bin/python3 /usr/local/bin/mupibox/check_network.py)" = "true" ]; then
		ONLINESTATE=${TRUESTATE}
		# Reconcile every tick (cheap when no-op) instead of only on
		# state change. Self-healing if the symlink was wrong.
		ensure_symlink "${DATA_FILE}" "${ACTIVE_FILE}"
		ensure_symlink "${RESUME_FILE}" "${ACTIVERESUME_FILE}"
	else
		ONLINESTATE=${FALSESTATE}
		if [ ! -f ${OFFLINE_FILE} ]; then
			echo -n "[" > ${OFFLINE_FILE}
			echo -n $(jq '.[] | select(.type != "spotify" and .type != "radio" and .type != "rss")' < ${DATA_FILE}) >> ${OFFLINE_FILE}
			echo -n "]" >> ${OFFLINE_FILE}
			sed -i 's/} {/}, {/g' ${OFFLINE_FILE}
			chown dietpi:dietpi ${OFFLINE_FILE}
		elif [ ! -s ${OFFLINE_FILE} ]; then
			rm ${OFFLINE_FILE}
			echo -n "[" > ${OFFLINE_FILE}
			echo -n $(jq '.[] | select(.type != "spotify" and .type != "radio" and .type != "rss")' < ${DATA_FILE}) >> ${OFFLINE_FILE}
			echo -n "]" >> ${OFFLINE_FILE}
			sed -i 's/} {/}, {/g' ${OFFLINE_FILE}
			chown dietpi:dietpi ${OFFLINE_FILE}
		elif [ $(stat --format='%Y' "${DATA_FILE}") -gt $(stat --format='%Y' "${OFFLINE_FILE}") ]; then
			echo -n "[" > ${OFFLINE_FILE}
			echo -n $(jq '.[] | select(.type != "spotify" and .type != "radio" and .type != "rss")' < ${DATA_FILE}) >> ${OFFLINE_FILE}
			echo -n "]" >> ${OFFLINE_FILE}
			sed -i 's/} {/}, {/g' ${OFFLINE_FILE}
		fi
		if [ ! -f ${OFFLINERESUME_FILE} ]; then
			echo -n "[" > ${OFFLINERESUME_FILE}
			echo -n $(jq '.[] | select(.type != "spotify" and .type != "radio" and .type != "rss")' < ${RESUME_FILE}) >> ${OFFLINERESUME_FILE}
			echo -n "]" >> ${OFFLINERESUME_FILE}
			sed -i 's/} {/}, {/g' ${OFFLINERESUME_FILE}
			chown dietpi:dietpi ${OFFLINERESUME_FILE}
		elif [ ! -s ${OFFLINERESUME_FILE} ]; then
			rm ${OFFLINERESUME_FILE}
			echo -n "[" > ${OFFLINERESUME_FILE}
			echo -n $(jq '.[] | select(.type != "spotify" and .type != "radio" and .type != "rss")' < ${RESUME_FILE}) >> ${OFFLINERESUME_FILE}
			echo -n "]" >> ${OFFLINERESUME_FILE}
			sed -i 's/} {/}, {/g' ${OFFLINERESUME_FILE}
			chown dietpi:dietpi ${OFFLINERESUME_FILE}
		elif [ $(stat --format='%Y' "${RESUME_FILE}") -gt $(stat --format='%Y' "${OFFLINERESUME_FILE}") ]; then
			echo -n "[" > ${OFFLINERESUME_FILE}
			echo -n $(jq '.[] | select(.type != "spotify" and .type != "radio" and .type != "rss")' < ${RESUME_FILE}) >> ${OFFLINERESUME_FILE}
			echo -n "]" >> ${OFFLINERESUME_FILE}
			sed -i 's/} {/}, {/g' ${OFFLINERESUME_FILE}
		fi
		# Self-healing reconciliation, see ensure_symlink comment above.
		ensure_symlink "${OFFLINE_FILE}" "${ACTIVE_FILE}"
		ensure_symlink "${OFFLINERESUME_FILE}" "${ACTIVERESUME_FILE}"
	fi

	if [ "${ONLINESTATE}" != "${OLDSTATE}" ]; then
		# Atomic-update (HIGH-8).
		_TMP="${NETWORKCONFIG}.tmp.$$"
		/usr/bin/jq --arg v "${ONLINESTATE}" '.onlinestate = $v' "${NETWORKCONFIG}" > "${_TMP}" && mv "${_TMP}" "${NETWORKCONFIG}" || rm -f "${_TMP}"
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