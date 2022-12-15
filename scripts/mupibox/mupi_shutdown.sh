#!/bin/sh
#
# 1. Shows Shutdown Splash
# 2. Update settings
# 3. Plays shutdown sound

nohup /usr/local/bin/mupibox/./mupi_stop_led.sh &

CONFIG="/etc/mupibox/mupiboxconfig.json"
SHUT_SPLASH=$(/usr/bin/jq -r .mupibox.shutSplash ${CONFIG})

/usr/bin/fbv ${SHUT_SPLASH}
sudo /usr/local/bin/mupibox/./setting_update.sh
#sudo sh -c 'su - dietpi -s /usr/local/bin/mupibox/shutdown_sound.sh'
