#!/bin/sh
#
# 1. Shows Shutdown Splash
# 2. Plays shutdown sound (while the splash is shown)
# 3. Update settings

CONFIG="/etc/mupibox/mupiboxconfig.json"
SHUT_SOUND=$(/usr/bin/jq -r .mupibox.shutSound ${CONFIG})
AUDIO_DEVICE=$(/usr/bin/jq -r .mupibox.audioDevice ${CONFIG})
START_VOLUME=$(/usr/bin/jq -r .mupibox.startVolume ${CONFIG})
PLAYERSTATE="/tmp/playerstate"

if [ "$(head -n1 ${PLAYERSTATE} 2>/dev/null)" = "play" ]; then
  curl -s http://127.0.0.1:5005/pause
fi

# The goodbye sound starts right away and plays while Chromium is ended and the goodbye picture is shown (ending
# Chromium takes about 2 s; the sound used to wait for it). Waited for at the end, so it is not cut off.
sudo -i -u dietpi /usr/local/bin/mupibox/./shutdown_sound.sh &
SOUND_PID=$!

#/usr/bin/pactl set-sink-volume @DEFAULT_SINK@ ${START_VOLUME}%
#/usr/bin/aplay ${SHUT_SOUND}

CONFIG="/etc/mupibox/mupiboxconfig.json"
SHUT_SPLASH=$(/usr/bin/jq -r .mupibox.shutSplash ${CONFIG})

# goodbye / battery empty: the pictures of the boot screen's scene of this start (bootscreen_update.sh), else as before
BS_OUT="/home/dietpi/MuPiBox/sysmedia/images/bootscreen"
BS_SCENE=$(cat ${BS_OUT}/current 2>/dev/null)
case "$1" in
	*battery_low*) BS_KIND="battery" ;;
	"") BS_KIND="goodbye" ;;
	*) BS_KIND="" ;;
esac
BS_PIC="${BS_OUT}/${BS_KIND}-${BS_SCENE}.png"
# not put together yet: the default's ready-made picture
[ -f "${BS_PIC}" ] && [ -n "${BS_SCENE}" ] || { BS_SCENE="karte"; BS_PIC="/home/dietpi/MuPiBox/sysmedia/bootscreens/prerendered/en/${BS_KIND}-karte.png"; }

killall -s 9 -w -q -r chromium
if [ -n "${BS_KIND}" ] && [ -n "${BS_SCENE}" ] && [ -f "${BS_PIC}" ]; then
    /usr/bin/fbv "${BS_PIC}" &
elif [ -n "$1" ]; then
    /usr/bin/fbv $1 &
else
    /usr/bin/fbv ${SHUT_SPLASH} &
fi
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

if [ "${TELEGRAM}" = true ] && [ ${#TELEGRAM_CHATID} -ge 1 ] && [ ${#TELEGRAM_TOKEN} -ge 1 ]; then
	/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "MuPiBox shutdown" &
fi

systemctl --no-block stop mupi_powerled

# disable execution of mupi_startstop service on shutdown again
systemctl set-environment DISABLE_MUPI_START_STOP=1

wait ${SOUND_PID}

#sudo /usr/local/bin/mupibox/./setting_update.sh
#sudo sh -c 'su - dietpi -s /usr/local/bin/mupibox/shutdown_sound.sh'
