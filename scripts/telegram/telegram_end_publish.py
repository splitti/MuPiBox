#!/usr/bin/python3
# DEPRECATED 2026-09-20: no service, script or admin page starts it.
# Kept for reference; nothing in MuPiBox calls it. Safe to delete.

import telepot
import json
from telegram_chats import normalize_chat_ids, send_to_all

with open("/etc/mupibox/mupiboxconfig.json") as file:
    config = json.load(file)

chat_ids = normalize_chat_ids(config['telegram'].get('chatId'))
if not chat_ids:
    quit()

bot = telepot.Bot(config['telegram']['token'])
send_to_all(bot, 'Sending data to telegram has been disabled!', chat_ids)
