#!/usr/bin/python3

import sys
import time
import telepot
import json
import requests
import subprocess

with open("/etc/mupibox/mupiboxconfig.json") as file:
    config = json.load(file)

url = 'http://127.0.0.1:5005/local'
local = requests.get(url).json()

TOKEN = config['telegram']['token']
bot = telepot.Bot(TOKEN)
chat_id = config['telegram']['chatId']

track_old = 0
track_new = local['currentTracknr']

while local['playing']:
    if track_old != track_new:
        msg = local['album'] + "\n" + local['currentTrackname'] + "\nTrack: " + str(local['currentTracknr']) + "/" + str(local['totalTracks'])
        bot.sendMessage(chat_id, msg)
        subprocess.run(["sudo", "rm", "/tmp/telegram_screen.png"])
        subprocess.run(["sudo", "-H", "-u", "dietpi", "bash", "-c", "DISPLAY=:0 scrot /tmp/telegram_screen.png"])
        bot.sendPhoto(chat_id, open('/tmp/telegram_screen.png', 'rb'))
        track_old = track_new
    time.sleep(5)
    local = requests.get(url).json()
    track_new = local['currentTracknr']
    








