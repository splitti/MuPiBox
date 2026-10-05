#!/bin/bash
#

CONFIG="/etc/mupibox/mupiboxconfig.json"
SHUT_SOUND=$(/usr/bin/jq -r .mupibox.shutSound ${CONFIG})
AUDIO_DEVICE=$(/usr/bin/jq -r .mupibox.audioDevice ${CONFIG})
START_VOLUME=$(/usr/bin/jq -r .mupibox.startVolume ${CONFIG})

# (never louder than now: music that has not stopped yet is not raised under the goodbye sound)
/usr/local/bin/mupibox/lower_volume_to.sh "${START_VOLUME}"
/usr/bin/aplay ${SHUT_SOUND}
