#!/bin/sh
#
# 1. Shows Shutdown Splash (first of all, see show_goodbye.sh)
# 2. Plays shutdown sound (while the splash is shown)
# 3. Update settings

CONFIG="/etc/mupibox/mupiboxconfig.json"
SHUT_SOUND=$(/usr/bin/jq -r .mupibox.shutSound ${CONFIG})
AUDIO_DEVICE=$(/usr/bin/jq -r .mupibox.audioDevice ${CONFIG})
START_VOLUME=$(/usr/bin/jq -r .mupibox.startVolume ${CONFIG})
PLAYERSTATE="/tmp/playerstate"

# the goodbye picture first (the display's window is hidden, the picture drawn over it)
/usr/local/bin/mupibox/show_goodbye.sh "$1"

if [ "$(head -n1 ${PLAYERSTATE} 2>/dev/null)" = "play" ]; then
  curl -s http://127.0.0.1:5005/pause
fi

# The goodbye sound starts right away and plays while Chromium is ended and the goodbye picture is shown (ending
# Chromium takes about 2 s; the sound used to wait for it). Waited for at the end, so it is not cut off.
sudo -i -u dietpi /usr/local/bin/mupibox/./shutdown_sound.sh &
SOUND_PID=$!

#/usr/bin/pactl set-sink-volume @DEFAULT_SINK@ ${START_VOLUME}%
#/usr/bin/aplay ${SHUT_SOUND}

# Chromium ended; the picture only needs its window gone (hidden already), so no waiting (-w) until all of its
# processes have ended (about 2 s). The picture is drawn once more in case anything painted over it meanwhile.
killall -s 9 -q -r chromium
sleep 0.4
/usr/local/bin/mupibox/show_goodbye.sh "$1"
wled_shut_active=$(/usr/bin/jq -r .wled.shutdown_active ${CONFIG})
wled_shut_id=$(/usr/bin/jq -r .wled.shutdown_id ${CONFIG})
wled_baud_rate=$(/usr/bin/jq -r .wled.baud_rate ${CONFIG})
wled_com_port=$(/usr/bin/jq -r .wled.com_port ${CONFIG})
wled_brightness_def=$(/usr/bin/jq -r .wled.brightness_default ${CONFIG})

if [ "${wled_shut_active}" = true ]; then
	wled_data='{"ps":"'${wled_shut_id}'"}'
	python3 /usr/local/bin/mupibox/wled_send_data.py -s "${wled_com_port}" -b "${wled_baud_rate}" -j "${wled_data}"
	wled_data='{"bri":"'${wled_brightness_def}'"}'
	python3 /usr/local/bin/mupibox/wled_send_data.py -s "${wled_com_port}" -b "${wled_baud_rate}" -j "${wled_data}"
	wled_data='{"on":true}'
	python3 /usr/local/bin/mupibox/wled_send_data.py -s "${wled_com_port}" -b "${wled_baud_rate}" -j "${wled_data}"
fi
TELEGRAM=$(/usr/bin/jq -r .telegram.active ${CONFIG})
TELEGRAM_CHATID=$(/usr/bin/jq -r .telegram.chatId ${CONFIG})
TELEGRAM_TOKEN=$(/usr/bin/jq -r .telegram.token ${CONFIG})

# One message with the reason: the battery is empty (mupihat_automation.sh passes the battery picture), the box was
# idle too long (idle_shutdown.sh leaves the reason in /run) or any other shutdown.
REASON=$(cat /run/mupibox-shutdown-reason 2>/dev/null)
rm -f /run/mupibox-shutdown-reason
if [ "$1" = "/home/dietpi/MuPiBox/sysmedia/images/battery_low.jpg" ]; then
	TELEGRAM_KEY="n_box_shutdown_battery"
elif [ "${REASON}" = "idle" ]; then
	TELEGRAM_KEY="n_box_idle"
else
	TELEGRAM_KEY="n_box_shutdown"
fi
if [ "${TELEGRAM}" = true ] && [ ${#TELEGRAM_CHATID} -ge 1 ] && [ ${#TELEGRAM_TOKEN} -ge 1 ]; then
	/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py --key "${TELEGRAM_KEY}" &
fi

systemctl --no-block stop mupi_powerled

# disable execution of mupi_startstop service on shutdown again
systemctl set-environment DISABLE_MUPI_START_STOP=1

wait ${SOUND_PID}

#sudo /usr/local/bin/mupibox/./setting_update.sh
#sudo sh -c 'su - dietpi -s /usr/local/bin/mupibox/shutdown_sound.sh'
