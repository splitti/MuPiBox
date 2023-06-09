#!/usr/bin/python3

import sys
import time
import telepot
import json
import subprocess
from telepot.loop import MessageLoop

with open("/etc/mupibox/mupiboxconfig.json") as file:
    config = json.load(file)

if not config['telegram']['active']:
    quit()

def handle(msg):
    chat_id = msg['chat']['id']
    command = msg['text']

    if command == '/shutdown':
        subprocess.run(["sudo", "bash", "/usr/local/bin/mupibox/shutdown.sh"])
    elif command == '/help':
        bot.sendMessage(chat_id, "There is no help.")


TOKEN = config['telegram']['token']
bot = telepot.Bot(TOKEN)

MessageLoop(bot, handle).run_as_thread()

while 1:
    time.sleep(10)