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
	# HIGH-15: previous code had no trap, so a perl/jq crash, a SIGTERM
	# from systemd, or an out-of-disk during the temp writes left
	# DATA_LOCK behind. Subsequent invocations would see the stale lock
	# and exit, blocking m3u_generator's index pass forever — observable
	# as "new audiobook folder shows up but never gets an index, so
	# resume can't address it." Trap the common termination signals so
	# the lock is removed even when the script dies mid-write.
	trap 'rm -f "${DATA_LOCK}"' EXIT INT TERM HUP

	/usr/bin/cat ${DATA} | grep -v '"index":' > ${TMP_DATA}
    /usr/bin/perl -pe 'BEGIN{$k=-1};s/{/$& . "\n        \"index\": " .  ++$k . ","/e' ${TMP_DATA} > ${DATA}
    /usr/bin/rm ${TMP_DATA}
    /usr/bin/echo $(/usr/bin/jq -c . ${DATA}) | /usr/bin/jq . > ${TMP_DATA}
    /usr/bin/mv ${TMP_DATA} ${DATA}
    /usr/bin/chown dietpi:dietpi ${DATA}
	echo "Index is finished"
	# Lock removal happens via the EXIT trap above; the explicit rm here
	# is now redundant but kept to preserve the original log-line ordering.
fi