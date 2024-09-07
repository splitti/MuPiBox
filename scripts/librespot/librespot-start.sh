#!/bin/bash
#

MUPIBOX_CONFIG="/etc/mupibox/mupiboxconfig.json"

export LIBRESPOT_CACHE=$(/usr/bin/jq -r .spotify.cachepath ${MUPIBOX_CONFIG})
export LIBRESPOT_CACHE_SIZE_LIMIT="$(/usr/bin/jq -r .spotify.maxcachesize ${MUPIBOX_CONFIG})G"
export LIBRESPOT_NAME=$(/usr/bin/jq -r .mupibox.host ${MUPIBOX_CONFIG})
export LIBRESPOT_ONEVENT="/usr/bin/python3 /usr/local/bin/mupibox/telegram_Track_Spotify.py"
export LIBRESPOT_BITRATE=160
export LIBRESPOT_INITIAL_VOLUME=100
export LIBRESPOT_ENABLE_VOLUME_NORMALISATION=1
export LIBRESPOT_NORMALISATION_PREGAIN=0
cachestate=$(/usr/bin/jq -r .spotify.cachestate ${MUPIBOX_CONFIG})
if ! $cachestate ; then
    export LIBRESPOT_NAME_DISABLE_AUDIO_CACHE=1
fi
username=$( jq -r .username ${LIBRESPOT_CACHE}/credentials.json )
if [[ ! -z "$var" ]]; then
  export LIBRESPOT_USERNAME=${username}
fi

/usr/bin/librespot -q