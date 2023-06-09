#!/usr/bin/python3

import sys
import time
import telepot
import json
import requests

with open("/etc/mupibox/mupiboxconfig.json") as file:
    config = json.load(file)

url = 'http://mupibox:5005/local'
state = requests.get(url).json()

TOKEN = config['telegram']['token']
bot = telepot.Bot(TOKEN)
chat_id = config['telegram']['chatId']

msg = config['mupibox']['host'] + " stop playing"

bot.sendMessage(chat_id, msg)