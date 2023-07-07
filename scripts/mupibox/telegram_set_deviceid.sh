#!/bin/bash
#

CONFIG="/etc/mupibox/mupiboxconfig.json"
TELEGRAM_TOKEN=$(sudo /usr/bin/jq -r .telegram.token ${CONFIG})
CHAT_ID=$(/usr/bin/curl -s https://api.telegram.org/bot${TELEGRAM_TOKEN}/getUpdates | /usr/bin/jq .result[-1].message.chat.id)
if [ ${CHAT_ID} == "null" ]
then
  CHAT_ID=$(/usr/bin/curl -s https://api.telegram.org/bot${TELEGRAM_TOKEN}/getUpdates | /usr/bin/jq .result[-1].my_chat_member.chat.id)
fi
#$(/usr/bin/cat <<< $(/usr/bin/jq --arg v "${CHAT_ID}" '.telegram.chatId = $v' ${CONFIG}) >  ${CONFIG})
echo $CHAT_ID