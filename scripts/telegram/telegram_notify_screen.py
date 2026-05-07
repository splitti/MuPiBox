#!/usr/bin/python3

import sys
import subprocess
import json
import telepot
from telegram_chats import normalize_chat_ids, send_to_all, photo_to_all

with open("/etc/mupibox/mupiboxconfig.json") as file:
    config = json.load(file)

if not config['telegram']['active']:
    sys.exit()

chat_ids = normalize_chat_ids(config['telegram'].get('chatId'))
if not chat_ids:
    sys.exit()

bot = telepot.Bot(config['telegram']['token'])

if len(sys.argv) > 1:
    msg = "\n".join(sys.argv[1:])
    send_to_all(bot, msg, chat_ids)

subprocess.run(["sudo", "rm", "-f", "/tmp/telegram_screen.png"])
subprocess.run(["sudo", "-H", "-u", "dietpi", "bash", "-c", "DISPLAY=:0 scrot /tmp/telegram_screen.png"])
photo_to_all(bot, '/tmp/telegram_screen.png', chat_ids)
