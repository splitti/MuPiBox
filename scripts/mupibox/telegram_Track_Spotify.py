#!/usr/bin/python3

import sys
import time
import telepot
import json
import requests
import subprocess

with open("/etc/mupibox/mupiboxconfig.json") as file:
    config = json.load(file)

url = 'http://mupibox:5005/state'
state = requests.get(url).json()

TOKEN = config['telegram']['token']
bot = telepot.Bot(TOKEN)
chat_id = config['telegram']['chatId']

while state['is_playing']:
    msg = state['item']['album']['name'] + "\n" + state['item']['name'] + "\nTrack: " + str(state['item']['track_number']) + "/" + str(state['item']['album']['total_tracks'])
    bot.sendMessage(chat_id, msg)
    subprocess.run(["sudo", "rm", "/tmp/telegram_screen.png"])
    subprocess.run(["sudo", "DISPLAY=:0", "scrot", "/tmp/telegram_screen.png"])
    bot.sendPhoto(chat_id, open('/tmp/telegram_screen.png', 'rb'))
    time.sleep(60)
    state = requests.get(url).json()
