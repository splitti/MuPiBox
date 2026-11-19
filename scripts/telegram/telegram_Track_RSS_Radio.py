#!/usr/bin/python3

import telepot
import json
import requests
import subprocess
from telegram_chats import normalize_chat_ids, send_to_all, photo_to_all, take_screen, SCREEN

with open("/etc/mupibox/mupiboxconfig.json") as file:
    config = json.load(file)

# playback messages only when the parents asked for them (telegram.notifyPlayback, off by default)
if not config['telegram']['active'] or config['telegram'].get('notifyPlayback') is not True:
    quit()

chat_ids = normalize_chat_ids(config['telegram'].get('chatId'))
if not chat_ids:
    quit()

local = requests.get('http://127.0.0.1:5005/local', timeout=5).json()

bot = telepot.Bot(config['telegram']['token'])

msg = local['album'] + "\n" + local['currentTrackname']
send_to_all(bot, msg, chat_ids)
if take_screen() == 0:
    photo_to_all(bot, SCREEN, chat_ids)
