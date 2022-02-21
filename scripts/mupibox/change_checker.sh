#!/bin/bash
#
# Check for changes in MuPiBox Media directory

CONFIG="/etc/mupibox/mupiboxconfig.json"
CHECK_TIMER=$(/usr/bin/jq -r .mupibox.mediaCheckTimer ${CONFIG})

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

