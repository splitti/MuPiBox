#!/bin/bash
#

CONFIG="/etc/mupibox/mupiboxconfig.json"
SHUT_SOUND=$(/usr/bin/jq -r .mupibox.shutSound ${CONFIG})
AUDIO_DEVICE=$(/usr/bin/jq -r .mupibox.audioDevice ${CONFIG})
START_VOLUME=$(/usr/bin/jq -r .mupibox.startVolume ${CONFIG})

/usr/bin/pactl set-sink-volume @DEFAULT_SINK@ ${START_VOLUME}% 
/usr/bin/aplay ${SHUT_SOUND}
