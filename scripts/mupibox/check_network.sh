#!/bin/bash
#
# Get Network-Data and create Online / Offline Data.json for showing Media in MuPiBox

DATA_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json"
ACTIVE_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/active_data.json"
OFFLINE_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/offline_data.json"
RESUME_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/resume.json"
ACTIVERESUME_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/active_resume.json"
OFFLINERESUME_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/offline_resume.json"

# The library without what needs the internet. Podcasts with episodes on the SD card stay (their list then shows
# those only, see podcast-offline.ts; a resume tile of a kept episode too, by its address); the list is made again
# when that changes too.
PODCAST_INDEX="/home/dietpi/MuPiBox/podcasts/index.json"
offline_filter() {
	local index="${PODCAST_INDEX}"
	/usr/bin/jq -e 'type == "object"' "${index}" > /dev/null 2>&1 || index=/dev/null
	/usr/bin/jq --slurpfile off "${index}" '([$off[0].files[]?.feed] + [$off[0].files[]?.url]) as $feeds | .[] | select(.type != "spotify" and .type != "radio" and (.type != "rss" or (.id as $i | any($feeds[]; . == $i))))' < "$1"
}

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

# The file lives in /tmp and is gone after a reboot. It must be created when it is missing AND when
# it is empty or not a JSON object: every writer below uses jq on the existing file, so once an empty
# file exists nothing would ever fill it again (the display then shows no network state at all).
# (Before: `sudo echo -n "[]" file` had no redirect and wrote nothing.)
if [ ! -s ${NETWORKCONFIG} ] || ! /usr/bin/jq -e 'type == "object"' ${NETWORKCONFIG} > /dev/null 2>&1; then
        sudo rm -f ${NETWORKCONFIG}
        # Atomic write (HIGH-8): tempfile + mv, so a concurrent reader never sees a half-written file.
        # Ownership and mode are set after the mv, which replaces the inode.
        _TMP="${NETWORKCONFIG}.tmp.$$"
        /usr/bin/jq -n --arg v "starting" '.onlinestate = $v' > "${_TMP}" && mv "${_TMP}" "${NETWORKCONFIG}" || rm -f "${_TMP}"
        chown dietpi:dietpi ${NETWORKCONFIG}
        chmod 777 ${NETWORKCONFIG}
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
	# AR5-1 history: this used to be `if ( $(python3 ...) == ${TRUESTATE} )`,
	# a bash subshell that executed the python output as a command instead of
	# comparing strings — the condition was permanently false. Our fix back
	# then compared against the script's stdout ("true"/"false").
	# With 5.0.0 check_network.py was rewritten: it prints nothing and
	# signals via the exit code only, so the exit-code form below is the
	# correct one now. A stdout comparison would compare "" against "true"
	# and report the box as permanently offline.
	# ONLINESTATE keeps its "online"/"offline" values for downstream
	# consumers of /tmp/network.json.
	if /usr/bin/python3 /usr/local/bin/mupibox/check_network.py; then
		ONLINESTATE=${TRUESTATE}
		# Reconcile every tick (cheap when it is a no-op) instead of only on
		# state change — self-healing if a symlink was wrong.
		ensure_symlink "${DATA_FILE}" "${ACTIVE_FILE}"
		ensure_symlink "${RESUME_FILE}" "${ACTIVERESUME_FILE}"
	else
		ONLINESTATE=${FALSESTATE}
		if [ ! -f ${OFFLINE_FILE} ]; then
			echo -n "[" > ${OFFLINE_FILE}
			printf '%s' "$(offline_filter ${DATA_FILE} | /usr/bin/jq -c . | paste -sd,)" >> ${OFFLINE_FILE}
			echo -n "]" >> ${OFFLINE_FILE}
			sed -i 's/} {/}, {/g' ${OFFLINE_FILE}
			chown dietpi:dietpi ${OFFLINE_FILE}
		elif [ ! -s ${OFFLINE_FILE} ]; then
			rm ${OFFLINE_FILE}
			echo -n "[" > ${OFFLINE_FILE}
			printf '%s' "$(offline_filter ${DATA_FILE} | /usr/bin/jq -c . | paste -sd,)" >> ${OFFLINE_FILE}
			echo -n "]" >> ${OFFLINE_FILE}
			sed -i 's/} {/}, {/g' ${OFFLINE_FILE}
			chown dietpi:dietpi ${OFFLINE_FILE}
		elif [ $(stat --format='%Y' "${DATA_FILE}") -gt $(stat --format='%Y' "${OFFLINE_FILE}") ] || [ "${PODCAST_INDEX}" -nt "${OFFLINE_FILE}" ]; then
			echo -n "[" > ${OFFLINE_FILE}
			printf '%s' "$(offline_filter ${DATA_FILE} | /usr/bin/jq -c . | paste -sd,)" >> ${OFFLINE_FILE}
			echo -n "]" >> ${OFFLINE_FILE}
			sed -i 's/} {/}, {/g' ${OFFLINE_FILE}
		fi
		if [ ! -f ${OFFLINERESUME_FILE} ]; then
			echo -n "[" > ${OFFLINERESUME_FILE}
			printf '%s' "$(offline_filter ${RESUME_FILE} | /usr/bin/jq -c . | paste -sd,)" >> ${OFFLINERESUME_FILE}
			echo -n "]" >> ${OFFLINERESUME_FILE}
			sed -i 's/} {/}, {/g' ${OFFLINERESUME_FILE}
			chown dietpi:dietpi ${OFFLINERESUME_FILE}
		elif [ ! -s ${OFFLINERESUME_FILE} ]; then
			rm ${OFFLINERESUME_FILE}
			echo -n "[" > ${OFFLINERESUME_FILE}
			printf '%s' "$(offline_filter ${RESUME_FILE} | /usr/bin/jq -c . | paste -sd,)" >> ${OFFLINERESUME_FILE}
			echo -n "]" >> ${OFFLINERESUME_FILE}
			sed -i 's/} {/}, {/g' ${OFFLINERESUME_FILE}
			chown dietpi:dietpi ${OFFLINERESUME_FILE}
		elif [ $(stat --format='%Y' "${RESUME_FILE}") -gt $(stat --format='%Y' "${OFFLINERESUME_FILE}") ] || [ "${PODCAST_INDEX}" -nt "${OFFLINERESUME_FILE}" ]; then
			echo -n "[" > ${OFFLINERESUME_FILE}
			printf '%s' "$(offline_filter ${RESUME_FILE} | /usr/bin/jq -c . | paste -sd,)" >> ${OFFLINERESUME_FILE}
			echo -n "]" >> ${OFFLINERESUME_FILE}
			sed -i 's/} {/}, {/g' ${OFFLINERESUME_FILE}
		fi
		# Self-healing reconciliation, see ensure_symlink comment above.
		ensure_symlink "${OFFLINE_FILE}" "${ACTIVE_FILE}"
		ensure_symlink "${OFFLINERESUME_FILE}" "${ACTIVERESUME_FILE}"
	fi

	# Compared with what the file says, not with the last round: get_network.sh rewrites the whole file every
	# 30 s from the same old content, so a write of this loop that lands in between can be lost - and then the
	# display showed "offline" (no WiFi in the status bar) for good, because nothing wrote the state again.
	FILESTATE=$(/usr/bin/jq -r '.onlinestate // empty' "${NETWORKCONFIG}" 2>/dev/null)
	if [ "${ONLINESTATE}" != "${FILESTATE}" ]; then
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
	# The display counts the box as offline until the network file has an address (get_network.sh, from cron every
	# 30 s): after a start that took up to a minute, and the display set up nothing that needs the internet (the
	# Spotify player) until then. Online without an address: filled in now.
	if [ "${ONLINESTATE}" = "${TRUESTATE}" ] && ! /usr/bin/jq -e '.ip' "${NETWORKCONFIG}" > /dev/null 2>&1; then
		/usr/local/bin/mupibox/get_network.sh > /dev/null 2>&1
	fi
	OLDSTATE=${ONLINESTATE}

	# Every 2 s instead of 10 s while the box is not online yet in its first minute (the WiFi connects a few seconds
	# after this service started; the next check came 10 s later).
	if [ "${ONLINESTATE}" != "${TRUESTATE}" ] && [ "${SECONDS}" -lt 60 ]; then
		sleep 2
	else
		sleep 10
	fi
done
