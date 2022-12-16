#!/bin/bash
#
# Sleep timer script

sleeptimer=$1
currtime=0

while ${sleeptimer} >= ${currtime}:
do
	sleep 60
	currtime=${currtime}+1
	resttime=${sleeptimer}-${currtime}
	echo ${resttime} > /tmp/.time2sleep
done
poweroff