#!/bin/sh
#

DATA="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json"
TMP_DATA="/tmp/.data.json"
DATA_LOCK="/tmp/.data.lock"




if [ "$EUID" -ne 0 ]
  then echo "Please run as root"
  exit
fi

if [ -f "${DATA_LOCK}" ]; then
	echo "Data-file locked."
    exit
else
	touch ${DATA_LOCK}

	/usr/bin/cat ${DATA} | grep -v '"index":' > ${TMP_DATA}
    /usr/bin/perl -pe 'BEGIN{$k=-1};s/{/$& . "\n        \"index\": " .  ++$k . ","/e' ${TMP_DATA} > ${DATA}
    /usr/bin/rm ${TMP_DATA}
    /usr/bin/echo $(/usr/bin/jq -c . ${DATA}) | /usr/bin/jq . > ${TMP_DATA}
    /usr/bin/mv ${TMP_DATA} ${DATA}
    /usr/bin/chown dietpi:dietpi ${DATA}
	echo "Index is finished"
	rm ${DATA_LOCK}
fi