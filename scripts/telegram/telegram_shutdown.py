#!/usr/bin/python3

import telepot
import json
from telegram_chats import normalize_chat_ids, send_to_all

with open("/etc/mupibox/mupiboxconfig.json") as file:
    config = json.load(file)

if not config['telegram']['active']:
    quit()

chat_ids = normalize_chat_ids(config['telegram'].get('chatId'))
if not chat_ids:
    quit()

bot = telepot.Bot(config['telegram']['token'])
send_to_all(bot, 'MuPiBox is shuting down!', chat_ids)

if config['mupihat']['hat_active']:
    with open("/tmp/mupihat.json") as file:
        mupihat = json.load(file)
    if mupihat['BatteryConnected']:
        send_to_all(bot, 'The MupiBox battery is at ' + mupihat['Bat_SOC'], chat_ids)
