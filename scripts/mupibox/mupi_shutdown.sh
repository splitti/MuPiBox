#!/bin/sh
#
# 1. Shows Shutdown Splash
# 2. Update settings
# 3. Plays shutdown sound

CONFIG="/etc/mupibox/mupiboxconfig.json"
SHUT_SPLASH=$(/usr/bin/jq -r .mupibox.shutSplash ${CONFIG})
TELEGRAM=$(/usr/bin/jq -r .telegram.active ${CONFIG})
TELEGRAM_CHATID=$(/usr/bin/jq -r .telegram.chatId ${CONFIG})
TELEGRAM_TOKEN=$(/usr/bin/jq -r .telegram.token ${CONFIG})
if [ "${TELEGRAM}" ] && [ ${#TELEGRAM_CHATID} -ge 1 ] && [ ${#TELEGRAM_TOKEN} -ge 1 ]; then
	/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "MuPiBox shutdown"
fi

killall -s 9 -w -q chromium-browser
/usr/bin/fbv ${SHUT_SPLASH} &
sudo /usr/local/bin/mupibox/./setting_update.sh
#sudo sh -c 'su - dietpi -s /usr/local/bin/mupibox/shutdown_sound.sh'
