#!/bin/bash

SOUND_FILE="/home/dietpi/MuPiBox/sysmedia/sound/low.wav"
JSON_FILE="/tmp/mupihat.json"
BATTERY_LOW="/home/dietpi/MuPiBox/sysmedia/images/battery_low.jpg"
CONFIG="/etc/mupibox/mupiboxconfig.json"

play_sound() {
    mplayer -nolirc "$SOUND_FILE" > /dev/null
}

echo $! > /run/mupi_hat_control.pid
sleep 30

BAT_CONNECTED=$(jq -r '.BatteryConnected' ${JSON_FILE})

if [ "${BAT_CONNECTED}" -eq 1 ]; then
	while true; do
		if [ -f ${JSON_FILE} ]; then
			VBUS=$(jq -r '.Vbus' ${JSON_FILE})
            if [ "$VBUS" -le 1000 ]; then
				STATE=$(jq -r '.Bat_Stat' ${JSON_FILE})
				if [ "${STATE}" = "LOW" ]; then
					play_sound
					echo "Battery state low"
				elif [ "${STATE}" = "SHUTDOWN" ]; then
					echo "Battery state to low - shutdown initiated"
					/usr/local/bin/mupibox/./mupi_shutdown.sh ${BATTERY_LOW}
					poweroff
				fi
			fi
		fi
		sleep 60
	done
else
	echo "No Battery connected, service stopped"
fi