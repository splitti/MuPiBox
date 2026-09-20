#!/usr/bin/python3
# DEPRECATED 2026-09-20: no service, script or admin page starts it (shutdown messages use telegram_send_message.py).
# Kept for reference; nothing in MuPiBox calls it. Safe to delete.

import sys
import time
import telepot
import json

with open("/etc/mupibox/mupiboxconfig.json") as file:
    config = json.load(file)

if not config['telegram']['active']:
    quit()

TOKEN = config['telegram']['token']
bot = telepot.Bot(TOKEN)
chat_id = config['telegram']['chatId']

bot.sendMessage(chat_id, 'MuPiBox is shuting down!')

if config['mupihat']['hat_active']:
    with open("/tmp/mupihat.json") as file:
        mupihat = json.load(file)

    if mupihat['BatteryConnected']:
        bot.sendMessage(chat_id, 'The MupiBox battery is at '+mupihat['Bat_SOC'])