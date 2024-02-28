#!/bin/bash

SOUND_FILE="/home/dietpi/MuPiBox/sysmedia/sound/low.mp3"
JSON_FILE="/tmp/mupihat.json"
BATTERY_LOW_PNG="/home/dietpi/MuPiBox/sysmedia/images/battery_low.png"

play_sound() {
    mplayer -nolirc "$SOUND_FILE" > /dev/null
}

echo $! > /run/mupi_hat.pid

while true; do
	if [ -f ${JSON_FILE} ]; then
		STATE = $(jq -r '.Bat_Stat' ${JSON_FILE})
		if [ "${STATE}" == "OK" ]; then
			play_sound
		elif [ "${STATE}" == "SHUTDOWN" ]; then
			/usr/local/bin/mupibox/mupi_shutdown.sh ${BATTERY_LOW_PNG}
		fi
	fi
    sleep 60
done
