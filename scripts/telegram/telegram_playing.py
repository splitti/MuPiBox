#!/usr/bin/python3

import telepot
import json
import requests
from telegram_chats import normalize_chat_ids, send_to_all

with open("/etc/mupibox/mupiboxconfig.json") as file:
    config = json.load(file)

if not config['telegram']['active']:
    quit()

chat_ids = normalize_chat_ids(config['telegram'].get('chatId'))
if not chat_ids:
    quit()

requests.get('http://127.0.0.1:5005/local')

bot = telepot.Bot(config['telegram']['token'])
send_to_all(bot, config['mupibox']['host'] + " is playing", chat_ids)
