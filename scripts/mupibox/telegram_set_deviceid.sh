#!/bin/bash
#

CONFIG="/etc/mupibox/mupiboxconfig.json"
TELEGRAM_TOKEN=$(/usr/bin/jq -r .telegram.token ${CONFIG})

CHAT_ID=$(/usr/bin/curl -s https://api.telegram.org/bot${TELEGRAM_TOKEN}/getUpdates | /usr/bin/jq .result[0].message.chat.id)
/usr/bin/cat <<< $(/usr/bin/jq --arg v "${CHAT_ID}" '.telegram.chatId = $v' ${CONFIG}) >  ${CONFIG}