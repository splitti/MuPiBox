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
	# the parents hear of a low battery once (Telegram), again only after the box was charging in between
	LOW_SENT=0
	while true; do
		if [ -f ${JSON_FILE} ]; then
			VBUS=$(jq -r '.Vbus' ${JSON_FILE})
            if [ "$VBUS" -gt 1000 ]; then
				LOW_SENT=0
			fi
            if [ "$VBUS" -le 1000 ]; then
				STATE=$(jq -r '.Bat_Stat' ${JSON_FILE})
				if [ "${STATE}" = "LOW" ]; then
					play_sound
					echo "Battery state low"
					if [ "${LOW_SENT}" -eq 0 ] && [ "$(jq -r .telegram.active ${CONFIG})" = true ]; then
						LOW_SENT=1
						/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py --key n_battery_low "soc=$(jq -r '.Bat_SOC' ${JSON_FILE})" &
					fi
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