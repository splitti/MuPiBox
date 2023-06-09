#!/usr/bin/python3

import sys
import time
import telepot
import json
import subprocess

with open("/etc/mupibox/mupiboxconfig.json") as file:
    config = json.load(file)

TOKEN = config['telegram']['token']
bot = telepot.Bot(TOKEN)
chat_id = config['telegram']['chatId']

bot.sendMessage(chat_id, 'MuPiBox is online!')
subprocess.run(["sudo", "rm", "/tmp/telegram_screen.png"])
subprocess.run(["sudo", "DISPLAY=:0", "scrot", "/tmp/telegram_screen.png"])
bot.sendPhoto(chat_id, open('/tmp/telegram_screen.png', 'rb'))