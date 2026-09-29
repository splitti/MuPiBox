#!/bin/bash
#
# Check for changes in MuPiBox Media directory

CONFIG="/etc/mupibox/mupiboxconfig.json"
CHECK_TIMER=$(/usr/bin/jq -r .mupibox.mediaCheckTimer ${CONFIG})
# MED-22: a fresh image without `mediaCheckTimer` in mupiboxconfig.json
# gets `null` from jq -r, so `sleep null` returns immediately and the
# while loop pegs one CPU at 100% — observable on a fresh box as the
# system fan ramping up before the first config save. Default to 60s
# (same cadence m3u_generator.sh runs at on real boxes).
if [ -z "${CHECK_TIMER}" ] || [ "${CHECK_TIMER}" = "null" ]; then
  CHECK_TIMER=60
fi

while true
do
  for dir in /home/dietpi/MuPiBox/media/* ; do
    difference=$(($(date +%s) - $(stat -c %Z "${dir}") - ${CHECK_TIMER}))
        if ((${difference} < 1))
        then
          /usr/local/bin/mupibox/./m3u_generator.sh &
          break
        fi
  done
  sleep ${CHECK_TIMER}
done

