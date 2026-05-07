#!/usr/bin/python3

import sys
import os
import telepot
import json
import requests
import subprocess
from telegram_chats import normalize_chat_ids, send_to_all, photo_to_all

with open("/etc/mupibox/mupiboxconfig.json") as file:
    config = json.load(file)

if not config['telegram']['active']:
    quit()

chat_ids = normalize_chat_ids(config['telegram'].get('chatId'))
if not chat_ids:
    quit()

state = requests.get('http://127.0.0.1:5005/state').json()

bot = telepot.Bot(config['telegram']['token'])

player_event = os.environ.get('PLAYER_EVENT')
POSITION_MS = os.environ.get('POSITION_MS')

if player_event == "playing" and POSITION_MS == "0":
    if state['currently_playing_type'] == 'episode':
        episode = requests.get('http://127.0.0.1:5005/episode').json()
        msg = episode['show']['name'] + "\n" + episode['name']
        send_to_all(bot, msg, chat_ids)
        subprocess.run(["sudo", "rm", "/tmp/telegram_screen.png"])
        subprocess.run(["sudo", "-H", "-u", "dietpi", "bash", "-c", "DISPLAY=:0 scrot /tmp/telegram_screen.png"])
        photo_to_all(bot, '/tmp/telegram_screen.png', chat_ids)
        sys.exit()
    msg = state['item']['album']['name'] + "\n" + state['item']['name'] + "\nTrack: " + str(state['item']['track_number']) + "/" + str(state['item']['album']['total_tracks'])
    send_to_all(bot, msg, chat_ids)
    subprocess.run(["sudo", "rm", "/tmp/telegram_screen.png"])
    subprocess.run(["sudo", "-H", "-u", "dietpi", "bash", "-c", "DISPLAY=:0 scrot /tmp/telegram_screen.png"])
    photo_to_all(bot, '/tmp/telegram_screen.png', chat_ids)
