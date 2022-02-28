#!/bin/sh
#
# 1. Shows Shutdown Splash
# 2. Update settings
# 3. Plays shutdown sound

CONFIG="/etc/mupibox/mupiboxconfig.json"
SHUT_SOUND=$(/usr/bin/jq -r .mupibox.shutSound ${CONFIG})
SHUT_SPLASH=$(/usr/bin/jq -r .mupibox.shutSplash ${CONFIG})
AUDIO_DEVICE=$(/usr/bin/jq -r .mupibox.audioDevice ${CONFIG})
START_VOLUME=$(/usr/bin/jq -r .mupibox.startVolume ${CONFIG})

/usr/bin/fbv ${SHUT_SPLASH}
sudo /usr/local/bin/mupibox/./setting_update.sh
sudo sh -c 'su - dietpi -s /usr/bin/amixer sset ${AUDIO_DEVICE} ${START_VOLUME}% && /usr/bin/mplayer ${SHUT_SOUND}'
