#!/bin/bash

SOUND_FILE="/home/dietpi/MuPiBox/sysmedia/sound/low.mp3"
JSON_FILE="/tmp/mupihat.json"
BATTERY_LOW="/home/dietpi/MuPiBox/sysmedia/images/battery_low.jpg"
CONFIG="/etc/mupibox/mupiboxconfig.json"

play_sound() {
    mplayer -nolirc "$SOUND_FILE" > /dev/null
}

#echo $! > /run/mupi_hat.pid

while true; do
	if [ -f ${JSON_FILE} ]; then
		BATTERY=$(/usr/bin/jq -r .mupihat.selected_battery ${CONFIG})
		if [ "${BATTERY}" != "Powerbank" ]; then
			STATE=$(jq -r '.Bat_Stat' ${JSON_FILE})
			if [ "${STATE}" = "LOW" ]; then
				play_sound
			elif [ "${STATE}" = "SHUTDOWN" ]; then
				/usr/local/bin/mupibox/mupi_shutdown.sh ${BATTERY_LOW}
				service mupi_powerled stop 
				poweroff
			fi
		fi
	fi
    sleep 60
done
