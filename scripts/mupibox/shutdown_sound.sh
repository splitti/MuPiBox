#!/bin/bash
#

CONFIG="/etc/mupibox/mupiboxconfig.json"
SHUT_SOUND=$(/usr/bin/jq -r .mupibox.shutSound ${CONFIG})
AUDIO_DEVICE=$(/usr/bin/jq -r .mupibox.audioDevice ${CONFIG})
#START_VOLUME=$(/usr/bin/jq -r .mupibox.startVolume ${CONFIG})

#/usr/bin/amixer sset ${AUDIO_DEVICE} ${START_VOLUME}% 
/usr/bin/mplayer -nolirc ${SHUT_SOUND}
