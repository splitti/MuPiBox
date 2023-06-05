#!/bin/sh
#
# 1. Shows Shutdown Splash
# 2. Update settings
# 3. Plays shutdown sound

CONFIG="/etc/mupibox/mupiboxconfig.json"
SHUT_SPLASH=$(/usr/bin/jq -r .mupibox.shutSplash ${CONFIG})

TELEGRAM=$(/usr/bin/jq -r .mupibox.telegram.active ${CONFIG})
if [ "${TELEGRAM}" ]; then
  /usr/bin/python3 /usr/local/bin/mupibox/telegram_shutdown.py
fi 
/usr/bin/fbv ${SHUT_SPLASH}
sudo /usr/local/bin/mupibox/./setting_update.sh
#sudo sh -c 'su - dietpi -s /usr/local/bin/mupibox/shutdown_sound.sh'
