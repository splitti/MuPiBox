#!/bin/bash
#
# lösche alle Einträge mit Category resume.

DATA="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/resume.json"
DATA_LOCK="/tmp/.resume.lock"

if [ "$EUID" -ne 0 ]
  then echo "Please run as root"
  exit
fi

if [ -f "${DATA_LOCK}" ]; then
	echo "Resume-file locked."
    exit
else
	touch ${DATA_LOCK}

	jq 'map(select(.category != "resume"))' ${DATA} > ${DATA}.tmp && mv ${DATA}.tmp ${DATA}

	/usr/bin/chown dietpi:dietpi ${DATA}
	echo "Resume.json cleaned from resume"
	rm ${DATA_LOCK}
fi