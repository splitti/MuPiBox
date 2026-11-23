#!/usr/bin/python3

import sys
import subprocess
import json
import telepot
from telegram_chats import normalize_chat_ids, send_to_all, photo_to_all, take_screen, SCREEN

with open("/etc/mupibox/mupiboxconfig.json") as file:
    config = json.load(file)

# playback messages only when the parents asked for them (telegram.notifyPlayback, off by default)
if not config['telegram']['active'] or config['telegram'].get('notifyPlayback') is not True:
    sys.exit()

chat_ids = normalize_chat_ids(config['telegram'].get('chatId'))
if not chat_ids:
    sys.exit()

bot = telepot.Bot(config['telegram']['token'])

if len(sys.argv) > 1:
    msg = "\n".join(sys.argv[1:])
    send_to_all(bot, msg, chat_ids)

if take_screen() == 0:
    photo_to_all(bot, SCREEN, chat_ids)
