#!/usr/bin/python3

import telepot
import json
import requests
import subprocess
from telegram_chats import normalize_chat_ids, send_to_all, photo_to_all

with open("/etc/mupibox/mupiboxconfig.json") as file:
    config = json.load(file)

if not config['telegram']['active']:
    quit()

chat_ids = normalize_chat_ids(config['telegram'].get('chatId'))
if not chat_ids:
    quit()

local = requests.get('http://127.0.0.1:5005/local').json()

bot = telepot.Bot(config['telegram']['token'])

msg = local['album'] + "\n" + local['currentTrackname']
send_to_all(bot, msg, chat_ids)
subprocess.run(["sudo", "rm", "/tmp/telegram_screen.png"])
subprocess.run(["sudo", "-H", "-u", "dietpi", "bash", "-c", "DISPLAY=:0 scrot /tmp/telegram_screen.png"])
photo_to_all(bot, '/tmp/telegram_screen.png', chat_ids)
