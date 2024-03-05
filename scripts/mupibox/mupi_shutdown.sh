#!/bin/sh
#
# 1. Shows Shutdown Splash
# 2. Update settings
# 3. Plays shutdown sound

CONFIG="/etc/mupibox/mupiboxconfig.json"
SHUT_SOUND=$(/usr/bin/jq -r .mupibox.shutSound ${CONFIG})
AUDIO_DEVICE=$(/usr/bin/jq -r .mupibox.audioDevice ${CONFIG})
START_VOLUME=$(/usr/bin/jq -r .mupibox.startVolume ${CONFIG})

/usr/bin/pactl set-sink-volume @DEFAULT_SINK@ ${START_VOLUME}% 
/usr/bin/aplay ${SHUT_SOUND} &

CONFIG="/etc/mupibox/mupiboxconfig.json"
SHUT_SPLASH=$(/usr/bin/jq -r .mupibox.shutSplash ${CONFIG})
killall -s 9 -w -q chromium-browser
if [ -n "$1" ]; then
    /usr/bin/fbv $1 &
else
    /usr/bin/fbv ${SHUT_SPLASH} &
fi
wled_shut_active=$(/usr/bin/jq -r .wled.shutdown_active ${CONFIG})
wled_shut_id=$(/usr/bin/jq -r .wled.shutdown_id ${CONFIG})
wled_baud_rate=$(/usr/bin/jq -r .wled.baud_rate ${CONFIG})
wled_com_port=$(/usr/bin/jq -r .wled.com_port ${CONFIG})
wled_brightness_def=$(/usr/bin/jq -r .wled.brightness_default ${CONFIG})
if [ "${wled_shut_active}" ]; then
	wled_data='{"ps":"'${wled_shut_id}'"}'
	sudo python3 /usr/local/bin/mupibox/wled_send_data.py -s ${wled_com_port} -b ${wled_baud_rate} -j ${wled_data}
	wled_data='{"bri":"'${wled_brightness_def}'"}'
	sudo python3 /usr/local/bin/mupibox/wled_send_data.py -s ${wled_com_port} -b ${wled_baud_rate} -j ${wled_data}
	wled_data='{"on":true}'
	sudo python3 /usr/local/bin/mupibox/wled_send_data.py -s ${wled_com_port} -b ${wled_baud_rate} -j ${wled_data}
fi
TELEGRAM=$(/usr/bin/jq -r .telegram.active ${CONFIG})
TELEGRAM_CHATID=$(/usr/bin/jq -r .telegram.chatId ${CONFIG})
TELEGRAM_TOKEN=$(/usr/bin/jq -r .telegram.token ${CONFIG})

if [ "${TELEGRAM}" ] && [ ${#TELEGRAM_CHATID} -ge 1 ] && [ ${#TELEGRAM_TOKEN} -ge 1 ]; then
	/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "MuPiBox shutdown" &
fi

#sudo /usr/local/bin/mupibox/./setting_update.sh
#sudo sh -c 'su - dietpi -s /usr/local/bin/mupibox/shutdown_sound.sh'
