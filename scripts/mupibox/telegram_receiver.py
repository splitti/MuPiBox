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
    elif command == '/screen':
        subprocess.run(["sudo", "rm", "/tmp/telegram_screen.png"])
        subprocess.run(["sudo", "DISPLAY=:0", "scrot", "/tmp/telegram_screen.png"])
        bot.sendPhoto(chat_id, open('/tmp/telegram_screen.png', 'rb'))
    elif command == '/reboot':
        subprocess.run(["sudo", "reboot"])
    elif command[:3] == '/vol':
        subprocess.run(["/usr/bin/amixer", "sset", "Master", command[6:], "%"])
    elif command[:4] == '/sleep':
        sleep = command[:6]*60
        subprocess.run(["sudo", "nohup", "/usr/local/bin/mupibox/./sleep_timer.sh", sleep ])
    elif command == '/help':
        bot.sendMessage(chat_id, "<b><u>Possible commands:</u></b>\n\n<code><b>/help</b></code>\n<i>to get this help...</i>\n\n<code><b>/reboot</b></code>\n<i>to reboot</i>\n\n<code><b>/shutdown</b></code>\n<i>to shutdown the mupibox</i>\n\n<code><b>/screen</b></code>\n<i>to get a current screenshot</i>",parse_mode='HTML')


TOKEN = config['telegram']['token']
bot = telepot.Bot(TOKEN)

MessageLoop(bot, handle).run_as_thread()

while 1:
    time.sleep(10)