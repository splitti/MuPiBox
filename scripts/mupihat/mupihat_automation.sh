#!/bin/bash

SOUND_FILE="/home/dietpi/MuPiBox/sysmedia/sound/low.mp3"
JSON_FILE="/tmp/mupihat.json"
BATTERY_LOW="/home/dietpi/MuPiBox/sysmedia/images/battery_low.jpg"
CONFIG="/etc/mupibox/mupiboxconfig.json"

play_sound() {
    mplayer -nolirc "$SOUND_FILE" > /dev/null
}

echo $! > /run/mupi_hat_control.pid

BAT_CONNECTED=$(jq -r '.BatteryConnected' ${JSON_FILE})

if [ "${BAT_CONNECTED}" -eq 1 ]; then
	while true; do
		if [ -f ${JSON_FILE} ]; then
			IBUS=$(jq -r '.IBus' ${JSON_FILE})
			if [ "$IBUS" -eq 0 ]; then
				STATE=$(jq -r '.Bat_Stat' ${JSON_FILE})
				if [ "${STATE}" = "LOW" ]; then
					play_sound
					echo "Battery state low"
				elif [ "${STATE}" = "SHUTDOWN" ]; then
					/usr/local/bin/mupibox/mupi_shutdown.sh ${BATTERY_LOW}
					echo "Battery state to low - shutdown initiated"
					service mupi_powerled stop 
					poweroff
				fi
			fi
		fi
		sleep 60
	done
else
	echo "No Battery connected, service stopped"
fi