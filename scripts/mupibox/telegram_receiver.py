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
    elif command[:4] == '/vol':
        split_cmd = command.split(" ")
        volume = split_cmd[1]+"%"
        subprocess.run(["/usr/bin/amixer", "sset", "Master", volume])
        bot.sendMessage(chat_id, "Volume set to "+volume)
    elif command[:6] == '/sleep':
        split_cmd = command.split(" ")
        sleep = int(split_cmd[1]) * 60
        subprocess.Popen(["sudo", "nohup", "/usr/local/bin/mupibox/./sleep_timer.sh", str(sleep)])
        bot.sendMessage(chat_id, "Sleep timer set to "+split_cmd[1]+" minutes")
    elif command == '/help':
        bot.sendMessage(chat_id, "<b><u>Possible commands:</u></b>\n\n<code><b>/help</b></code>\n<i>to get this help...</i>\n\n<code><b>/reboot</b></code>\n<i>to reboot</i>\n\n<code><b>/shutdown</b></code>\n<i>to shutdown the mupibox</i>\n\n<code><b>/screen</b></code>\n<i>to get a current screenshot</i>\n\n<code><b>/sleep <i>[No in minutes]</i></b></code>\n<i>to set a sleep timer in minutes\nExample: /sleep 30</i>\n\n<code><b>/vol <i>[No in percent (0-100)]</i></b></code>\n<i>to set a sleep timer in minutes\nExample: /vol 30</i>\n\n<code><b>/media</b></code>\n<i>Update media database...</i>\n\n<code><b>/finishalbum</b></code>\n<i>Activates the shutdown after the end of the current album.</i>",parse_mode='HTML')
    elif command == '/media':
        bot.sendMessage(chat_id, "Starting media data update... This take a while, please wait for complete message")
        subprocess.run(["sudo", "/usr/local/bin/mupibox/./m3u_generator.sh"])
        bot.sendMessage(chat_id, "Media update finished...")
    elif command == '/finishalbum':
        bot.sendMessage(chat_id, "After finishing the current album the MuPiBox will be shut down.")
        subprocess.run(["sudo", "/usr/local/bin/mupibox/./albumstop_activator.sh"])

TOKEN = config['telegram']['token']
bot = telepot.Bot(TOKEN)

MessageLoop(bot, handle).run_as_thread()

while 1:
    time.sleep(10)
