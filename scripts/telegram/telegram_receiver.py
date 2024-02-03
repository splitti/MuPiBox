#!/usr/bin/python3

import sys
import time
import telepot
import json
import subprocess
import requests
from telepot.loop import MessageLoop
from telepot.namedtuple import InlineKeyboardMarkup, InlineKeyboardButton

with open("/etc/mupibox/mupiboxconfig.json") as file:
    config = json.load(file)

if not config['telegram']['active']:
    quit()

message_with_inline_keyboard = None

def on_chat_message(msg):
    content_type, chat_type, chat_id = telepot.glance(msg)
    print(content_type, chat_type, chat_id)
    if content_type != 'text':
        return
    command = msg['text']
    if command == '/shutdown':
        subprocess.run(["sudo", "bash", "/usr/local/bin/mupibox/shutdown.sh"])
    elif command == '/screen':
        subprocess.run(["sudo", "rm", "/tmp/telegram_screen.png"])
        subprocess.run(["sudo", "-H", "-u", "dietpi", "bash", "-c", "DISPLAY=:0 scrot /tmp/telegram_screen.png"])
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
        markup = InlineKeyboardMarkup(inline_keyboard=[
                                    [InlineKeyboardButton(text="Current Screen",callback_data='screen'), InlineKeyboardButton(text="Set Volume",callback_data='vol')],
                                    [InlineKeyboardButton(text="Pause",callback_data='pause'), InlineKeyboardButton(text="Play",callback_data='play')],
                                    [InlineKeyboardButton(text="Sleep Timer",callback_data='sleep'), InlineKeyboardButton(text="Finish current album",callback_data='finishalbum')],
                                    [InlineKeyboardButton(text="Shutdown",callback_data='shutdown'), InlineKeyboardButton(text="Reboot",callback_data='reboot')],
                                    [InlineKeyboardButton(text="Update Media-DB",callback_data='media')]
                                ]
                            )
        global message_with_inline_keyboard
        message_with_inline_keyboard = bot.sendMessage(chat_id, 'Possible commands:',reply_markup = markup)
    elif command == '/command':
        bot.sendMessage(chat_id, "<b><u>Possible commands:</u></b>\n\n<code><b>/help</b></code>\n<i>to get easy way to use command</i>\n\n<code><b>/reboot</b></code>\n<i>to reboot</i>\n\n<code><b>/shutdown</b></code>\n<i>to shutdown the mupibox</i>\n\n<code><b>/screen</b></code>\n<i>to get a current screenshot</i>\n\n<code><b>/sleep <i>[No in minutes]</i></b></code>\n<i>to set a sleep timer in minutes\nExample: /sleep 30</i>\n\n<code><b>/vol <i>[No in percent (0-100)]</i></b></code>\n<i>to set a sleep timer in minutes\nExample: /vol 30</i>\n\n<code><b>/media</b></code>\n<i>Update media database...</i>\n\n<code><b>/finishalbum</b></code>\n<i>Activates the shutdown after the end of the current album.</i>",parse_mode='HTML')
    elif command == '/media':
        bot.sendMessage(chat_id, "Starting media data update... This take a while, please wait for complete message")
        subprocess.run(["sudo", "/usr/local/bin/mupibox/./m3u_generator.sh"])
        bot.sendMessage(chat_id, "Media update finished!")
    elif command == '/finishalbum':
        bot.sendMessage(chat_id, "After finishing the current album the MuPiBox will be shut down.")
        subprocess.run(["sudo", "/usr/local/bin/mupibox/./albumstop_activator.sh"])
    elif command == '/pause':
        bot.sendMessage(chat_id, "Pause")
        url = 'http://' + config['host'] + ':5005//pause'
        requests.get(url)
    elif command == '/play':
        bot.sendMessage(chat_id, "Play")
        url = 'http://' + config['host'] + ':5005//play'
        requests.get(url)

def on_callback_query(msg):
    query_id, from_id, query_data = telepot.glance(msg, flavor='callback_query')
    print('Callback Query:', query_id, from_id, query_data)

    global message_with_inline_keyboard

    if query_data == 'screen':
        subprocess.run(["sudo", "rm", "/tmp/telegram_screen.png"])
        subprocess.run(["sudo", "-H", "-u", "dietpi", "bash", "-c", "DISPLAY=:0 scrot /tmp/telegram_screen.png"])
        bot.sendPhoto(from_id, open('/tmp/telegram_screen.png', 'rb'))
    elif query_data == 'vol':
        markup = InlineKeyboardMarkup(inline_keyboard=[
                        [InlineKeyboardButton(text="10",callback_data='vol_10'), InlineKeyboardButton(text="20",callback_data='vol_20')],
                        [InlineKeyboardButton(text="30",callback_data='vol_30'), InlineKeyboardButton(text="40",callback_data='vol_40')],
                        [InlineKeyboardButton(text="50",callback_data='vol_50'), InlineKeyboardButton(text="60",callback_data='vol_60')],
                        [InlineKeyboardButton(text="70",callback_data='vol_70'), InlineKeyboardButton(text="80",callback_data='vol_80')],
                        [InlineKeyboardButton(text="90",callback_data='vol_90'), InlineKeyboardButton(text="Back",callback_data='back')]
                    ]
                )
        msg_idf = telepot.message_identifier(message_with_inline_keyboard)
        bot.editMessageText(msg_idf, 'What volume should set?', reply_markup = markup )
    elif query_data == 'sleep':
        markup = InlineKeyboardMarkup(inline_keyboard=[
                        [InlineKeyboardButton(text="5",callback_data='sleep_5'), InlineKeyboardButton(text="15",callback_data='sleep_15')],
                        [InlineKeyboardButton(text="30",callback_data='sleep_30'), InlineKeyboardButton(text="45",callback_data='sleep_45')],
                        [InlineKeyboardButton(text="60",callback_data='sleep_60'), InlineKeyboardButton(text="Back",callback_data='back')]
                    ]
                )
        msg_idf = telepot.message_identifier(message_with_inline_keyboard)
        bot.editMessageText(msg_idf, 'In how many minutes should the MuPiBox go to sleep?', reply_markup = markup )
    elif query_data[:4] == 'vol_':
        split_cmd = query_data.split("_")
        volume = split_cmd[1]+"%"
        subprocess.run(["/usr/bin/amixer", "sset", "Master", volume])
        bot.answerCallbackQuery(query_id, text='Volume set to ' + volume, show_alert=True)
    elif query_data[:6] == 'sleep_':
        split_cmd = query_data.split("_")
        sleep = int(split_cmd[1]) * 60
        subprocess.Popen(["sudo", "nohup", "/usr/local/bin/mupibox/./sleep_timer.sh", str(sleep)])
        bot.sendMessage(from_id, "Sleep timer set to " + split_cmd[1] + " minutes")
    elif query_data == 'play':
        url = 'http://' + config['host'] + ':5005//play'
        bot.answerCallbackQuery(query_id, text='Play', show_alert=True)
        requests.get(url)
    elif query_data == 'pause':
        url = 'http://' + config['host'] + ':5005//pause'
        bot.answerCallbackQuery(query_id, text='Pause', show_alert=True)
        requests.get(url)
    elif query_data == 'back':
        markup = InlineKeyboardMarkup(inline_keyboard=[
                        [InlineKeyboardButton(text="Current Screen",callback_data='screen'), InlineKeyboardButton(text="Set Volume",callback_data='vol')],
                        [InlineKeyboardButton(text="Pause",callback_data='pause'), InlineKeyboardButton(text="Play",callback_data='play')],
                        [InlineKeyboardButton(text="Sleep Timer",callback_data='sleep'), InlineKeyboardButton(text="Finish current album",callback_data='finishalbum')],
                        [InlineKeyboardButton(text="Shutdown",callback_data='shutdown'), InlineKeyboardButton(text="Reboot",callback_data='reboot')],
                        [InlineKeyboardButton(text="Update Media-DB",callback_data='media')]
                    ]
                )
        msg_idf = telepot.message_identifier(message_with_inline_keyboard)
        bot.editMessageText(msg_idf, 'What volume should set?', reply_markup = markup )
    elif query_data == 'finishalbum':
        bot.answerCallbackQuery(query_id, text='After finishing the current album the MuPiBox will be shut down.', show_alert=True)
        bot.sendMessage(from_id, "After finishing the current album the MuPiBox will be shut down.")
        subprocess.run(["sudo", "/usr/local/bin/mupibox/./albumstop_activator.sh"])
    elif query_data == 'shutdown':
        subprocess.run(["sudo", "bash", "/usr/local/bin/mupibox/shutdown.sh"])
        bot.answerCallbackQuery(query_id, text='MuPiBox shutdown!', show_alert=True)
    elif query_data == 'reboot':
        subprocess.run(["sudo", "reboot"])
        bot.answerCallbackQuery(query_id, text='MuPiBox reboot!', show_alert=True)
    elif query_data == 'media':
        bot.answerCallbackQuery(query_id, text='Starting media data update... This take a while, please wait for complete message.', show_alert=True)
        subprocess.run(["sudo", "/usr/local/bin/mupibox/./m3u_generator.sh"])
        bot.answerCallbackQuery(query_id, text='Media update finished!', show_alert=True)
        bot.sendMessage(from_id, "Media update finished!")

TOKEN = config['telegram']['token']
bot = telepot.Bot(TOKEN)

MessageLoop(bot, {'chat': on_chat_message,
                  'callback_query': on_callback_query}).run_as_thread()
print ('Listening ...')

while 1:
    time.sleep(10)
