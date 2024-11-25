#!/usr/bin/python3

import sys
import time
import os
import telepot
import json
import requests
import subprocess

with open("/etc/mupibox/mupiboxconfig.json") as file:
    config = json.load(file)

if not config['telegram']['active']:
    quit()

url = 'http://127.0.0.1:5005/state'
state = requests.get(url).json()

urls = 'http://127.0.0.1:5005/episode'

TOKEN = config['telegram']['token']
bot = telepot.Bot(TOKEN)
chat_id = config['telegram']['chatId']

player_event = os.environ.get('PLAYER_EVENT')
POSITION_MS = os.environ.get('POSITION_MS')

if player_event == "playing" and POSITION_MS == "0":
    if state['currently_playing_type'] == 'episode':
        episode = requests.get(urls).json()
        msg = episode['show']['name'] + "\n" + episode['name']
        bot.sendMessage(chat_id, msg)
        subprocess.run(["sudo", "rm", "/tmp/telegram_screen.png"])
        subprocess.run(["sudo", "-H", "-u", "dietpi", "bash", "-c", "DISPLAY=:0 scrot /tmp/telegram_screen.png"])
        bot.sendPhoto(chat_id, open('/tmp/telegram_screen.png', 'rb'))
        sys.exit()
    msg = state['item']['album']['name'] + "\n" + state['item']['name'] + "\nTrack: " + str(state['item']['track_number']) + "/" + str(state['item']['album']['total_tracks'])
    bot.sendMessage(chat_id, msg)
    subprocess.run(["sudo", "rm", "/tmp/telegram_screen.png"])
    subprocess.run(["sudo", "-H", "-u", "dietpi", "bash", "-c", "DISPLAY=:0 scrot /tmp/telegram_screen.png"])
    bot.sendPhoto(chat_id, open('/tmp/telegram_screen.png', 'rb'))
