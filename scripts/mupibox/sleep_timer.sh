#!/bin/bash
#
# Sleep timer script

sleeptimer=$1
currtime=0
sec2sleep=60

echo ${sleeptimer} > /tmp/.time2sleep

while ${sleeptimer} >= ${currtime}:
do
	sleep ${sec2sleep}
	currtime=${currtime}+${sec2sleep}
	resttime=${sleeptimer}-${currtime}
	echo ${resttime} > /tmp/.time2sleep
done
poweroff