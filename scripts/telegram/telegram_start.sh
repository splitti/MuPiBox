#!/bin/bash
#

CONFIG="/etc/mupibox/mupiboxconfig.json"
TELEGRAM=$(/usr/bin/jq -r .telegram.active ${CONFIG})
TELEGRAM_CHATID=$(/usr/bin/jq -r .telegram.chatId ${CONFIG})
TELEGRAM_TOKEN=$(/usr/bin/jq -r .telegram.token ${CONFIG})

while ! python3 /usr/local/bin/mupibox/check_network.py; do
    sleep 2  # Optional: Warte eine Sekunde, bevor die nächste Prüfung erfolgt
done

# "MuPiBox is starting" once per boot: the service is also restarted after every save of the Telegram settings and
# after a crash of the bot, and each time the message came again. /run is emptied at every boot.
BOOT_SENT="/run/mupibox-telegram-boot-sent"
if [ "${TELEGRAM}" = "true" ] && [ ${#TELEGRAM_CHATID} -ge 1 ] && [ ${#TELEGRAM_TOKEN} -ge 1 ] && [ ! -e "${BOOT_SENT}" ]; then
	touch "${BOOT_SENT}" 2>/dev/null
	/usr/bin/python3 /usr/local/bin/mupibox/telegram_send_message.py "MuPiBox is starting";
fi

/usr/bin/python3 /usr/local/bin/mupibox/telegram_receiver.py