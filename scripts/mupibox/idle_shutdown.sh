#!/bin/bash
#
# Auto shutdown after idle time.

CONFIG="/etc/mupibox/mupiboxconfig.json"
LOG="/tmp/idle_shutdown.log"
current_idle_ticks=0
PLAYERSTATE="/tmp/playerstate"

touch ${PLAYERSTATE}
chown dietpi:dietpi ${PLAYERSTATE}
touch ${LOG}
echo "$(date +'%d/%m/%Y %H:%M:%S')  # SERVICE STARTED" >>${LOG}

max_idle_time=$(/usr/bin/jq -r .timeout.idlePiShutdown ${CONFIG})
sleep_sec=60

while true; do
  sleep ${sleep_sec}

  if ((${max_idle_time} > 0)); then
    if [[ $(head -n1 ${PLAYERSTATE}) != "play" ]]; then
      ((current_idle_ticks++))
      idle_min=$((current_idle_time * ${sleep_sec} / 60))

      if ((${idle_min} >= ${max_idle_time})); then
        TELEGRAM=$(/usr/bin/jq -r .telegram.active ${CONFIG})
        TELEGRAM_CHATID=$(/usr/bin/jq -r .telegram.chatId ${CONFIG})
        TELEGRAM_TOKEN=$(/usr/bin/jq -r .telegram.token ${CONFIG})

        if [ "${TELEGRAM}" ] && [ ${#TELEGRAM_CHATID} -ge 1 ] && [ ${#TELEGRAM_TOKEN} -ge 1 ]; then
          /usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "MuPiBox is to long idle"
        fi

        echo "$(date +'%d/%m/%Y %H:%M:%S')  # CURRENT IDLE TIME = ${idle_min}" >>${LOG}
        echo "$(date +'%d/%m/%Y %H:%M:%S')  # MAX IDLE TIME REACHED - SHUTDOWN NOW" >>${LOG}
        sudo /usr/local/bin/mupibox/./shutdown.sh
      fi

    else
      current_idle_ticks=0
      echo "$(date +'%d/%m/%Y %H:%M:%S')  # CURRENT IDLE TIME = 0" >>${LOG}
    fi

  else
    current_idle_ticks=0
  fi

  echo "$(date +'%d/%m/%Y %H:%M:%S')  # CURRENT IDLE TIME = ${idle_min}" >>${LOG}
done
