#!/usr/bin/python3
# DEPRECATED 2026-09-20: no service, script or admin page starts it.
# Kept for reference; nothing in MuPiBox calls it. Safe to delete.

import sys
import time
import telepot
import json

with open("/etc/mupibox/mupiboxconfig.json") as file:
    config = json.load(file)

TOKEN = config['telegram']['token']
bot = telepot.Bot(TOKEN)
chat_id = config['telegram']['chatId']

bot.sendMessage(chat_id, 'Sending data to telegram has been disabled!')