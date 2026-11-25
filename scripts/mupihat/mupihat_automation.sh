#!/bin/bash

SOUND_FILE="/home/dietpi/MuPiBox/sysmedia/sound/low.wav"
JSON_FILE="/tmp/mupihat.json"
BATTERY_LOW="/home/dietpi/MuPiBox/sysmedia/images/battery_low.jpg"
CONFIG="/etc/mupibox/mupiboxconfig.json"

# (with mpv; paplay where mpv is missing - the sound is a WAV)
play_sound() {
    if command -v mpv >/dev/null 2>&1; then
        mpv --no-video --really-quiet --no-config --ao=pulse,alsa "$SOUND_FILE" > /dev/null 2>&1
    else
        paplay "$SOUND_FILE" > /dev/null 2>&1
    fi
}

sleep 30

# A HAT without a battery (USB-C mode) waits for one - checked every minute - instead of ending: ended, the service
# was restarted every 30 s (its old ExecStop failed). Once there, as always: the battery is not looked for again.
if [ "$(jq -r '.BatteryConnected' ${JSON_FILE} 2>/dev/null)" != "1" ]; then
	echo "No Battery connected - checking again every minute"
	until [ "$(jq -r '.BatteryConnected' ${JSON_FILE} 2>/dev/null)" = "1" ]; do
		sleep 60
	done
	echo "Battery connected"
fi

# the parents hear of a low battery once (Telegram), again only after the box was charging in between
LOW_SENT=0
INVALID_ROUNDS=0
while true; do
	# Values of a charger that was reset and is not set up again (mupihat.py: Measurement_Valid false) are those of
	# before the reset - no warning and no shutdown from them. Said in the log at once and every 30 minutes while it
	# lasts; the service sets the chip up again by itself.
	if [ -f ${JSON_FILE} ] && [ "$(jq -r '.Measurement_Valid' ${JSON_FILE})" = "false" ]; then
		if [ $((INVALID_ROUNDS % 30)) -eq 0 ]; then
			echo "Battery values not valid (charger being set up again) for ${INVALID_ROUNDS} min - no battery decisions"
		fi
		INVALID_ROUNDS=$((INVALID_ROUNDS + 1))
		sleep 60
		continue
	fi
	INVALID_ROUNDS=0
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