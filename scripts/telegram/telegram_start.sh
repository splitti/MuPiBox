#!/bin/bash
#

CONFIG="/etc/mupibox/mupiboxconfig.json"
TELEGRAM=$(/usr/bin/jq -r .telegram.active ${CONFIG})
TELEGRAM_CHATID=$(/usr/bin/jq -r .telegram.chatId ${CONFIG})
TELEGRAM_TOKEN=$(/usr/bin/jq -r .telegram.token ${CONFIG})

while ! python3 /usr/local/bin/mupibox/check_network.py; do
    sleep 2  # Optional: Warte eine Sekunde, bevor die nächste Prüfung erfolgt
done

if [ "${TELEGRAM}" ] && [ ${#TELEGRAM_CHATID} -ge 1 ] && [ ${#TELEGRAM_TOKEN} -ge 1 ]; then
	/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "MuPiBox is starting";
fi

/usr/bin/python3 /usr/local/bin/mupibox/telegram_receiver.py