#!/bin/bash
#
# Auto shutdown after idle time.

CONFIG="/etc/mupibox/mupiboxconfig.json"
LOG="/tmp/idle_shutdown.log"
current_idle_time=0
PLAYERSTATE="/tmp/playerstate"
PHOTOS_AWAKE="/tmp/mupibox-photos-awake"
# The log got one or two lines every 10 s ("CURRENT IDLE TIME = 0" over and over); now only when the idle minutes
# change (and at start and shutdown).
last_logged=""
log_idle() {
  if [ "$1" != "${last_logged}" ]; then
    echo "$(date +'%d/%m/%Y %H:%M:%S')  # CURRENT IDLE TIME = $1" >> ${LOG}
    last_logged="$1"
  fi
}

touch ${PLAYERSTATE}
chown dietpi:dietpi ${PLAYERSTATE}
touch ${LOG}
echo "$(date +'%d/%m/%Y %H:%M:%S')  # SERVICE STARTED" >> ${LOG}

while true
do
  sleep 10
  max_idle_time=$(/usr/bin/jq -r .timeout.idlePiShutdown ${CONFIG})
  if (( $max_idle_time > 0 ))
  then
    # (photos looked at on the display - touched within the last minutes - count as not idle: the display touches
    # PHOTOS_AWAKE every minute while that lasts, backend-api app-api/photos/albums.ts)
    photos_awake=0
    if [ -e "${PHOTOS_AWAKE}" ] && (( $(date +%s) - $(stat -c %Y "${PHOTOS_AWAKE}" 2>/dev/null || echo 0) < 150 )); then photos_awake=1; fi
    if [[ $(head -n1 ${PLAYERSTATE}) != "play" ]] && (( photos_awake == 0 ))
    then
		((current_idle_time++))
		idle=$(( current_idle_time / 6 ))
		if ((${idle} >= ${max_idle_time}))
		then
      # The reason for mupi_shutdown.sh: its Telegram message says the box was idle ("... idle too long and is
      # shutting down") - one message instead of two.
      echo idle > /run/mupibox-shutdown-reason 2>/dev/null
      log_idle "${idle}"
			echo "$(date +'%d/%m/%Y %H:%M:%S')  # MAX IDLE TIME REACHED - SHUTDOWN NOW" >> ${LOG}
			sudo /usr/local/bin/mupibox/./shutdown.sh
		  fi
    else
		current_idle_time=0
		idle=0
    fi
  else
		current_idle_time=0
		idle=0
  fi
  log_idle "${idle}"
done
