#!/usr/bin/python3

import sys
import subprocess
import json
import telepot

with open("/etc/mupibox/mupiboxconfig.json") as file:
    config = json.load(file)

if not config['telegram']['active']:
    sys.exit()

TOKEN = config['telegram']['token']
bot = telepot.Bot(TOKEN)
chat_id = config['telegram']['chatId']

if len(sys.argv) > 1:
    msg = "\n".join(sys.argv[1:])
    bot.sendMessage(chat_id, msg)

subprocess.run(["sudo", "rm", "-f", "/tmp/telegram_screen.png"])
subprocess.run(["sudo", "-H", "-u", "dietpi", "bash", "-c", "DISPLAY=:0 scrot /tmp/telegram_screen.png"])
bot.sendPhoto(chat_id, open('/tmp/telegram_screen.png', 'rb'))
