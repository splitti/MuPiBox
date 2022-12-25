#!/bin/bash
#
# Sleep timer script; sleeptimer in seconds

sleeptimer=$1
currtime=0
sec2sleep=1

echo ${sleeptimer} > /tmp/.time2sleep

while (( ${sleeptimer} >= ${currtime} )); do
	sleep ${sec2sleep}
	currtime=$((${currtime}+${sec2sleep}))
	resttime=$((${sleeptimer}-${currtime}))
	echo ${resttime} > /tmp/.time2sleep
done

poweroff
