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

# Authorization: only respond to messages from the configured chat. Without this
# anyone who learns the bot username could send /shutdown / /quietnow / etc.
# An empty chatId is treated as "deny all" — the user has to configure one for
# outbound notifications anyway.
ALLOWED_CHAT_ID = str(config['telegram'].get('chatId', '')).strip()

# Backend-API base URL on the same host. Used for parent-control commands
# (extend / release / quietnow / status). The player listens for config
# changes via fs.watch, so changes apply within ~50 ms.
API_BASE = 'http://localhost:8200/api'

def is_authorized(chat_id):
    if not ALLOWED_CHAT_ID:
        print('Refusing message: no chatId configured in mupiboxconfig.json')
        return False
    return str(chat_id) == ALLOWED_CHAT_ID

def fmt_minutes(seconds):
    if seconds <= 0:
        return '0 min'
    if seconds < 60:
        return '<1 min'
    return f'{seconds // 60} min'

def parse_int_arg(command, default=None):
    parts = command.split()
    if len(parts) >= 2:
        try:
            return int(parts[1])
        except (ValueError, TypeError):
            return default
    return default

def call_api_post(path, body=None):
    try:
        r = requests.post(f'{API_BASE}{path}', json=(body or {}), timeout=5)
        return r.status_code, r.json() if r.headers.get('content-type', '').startswith('application/json') else r.text
    except Exception as e:
        return 0, str(e)

def call_api_get(path):
    try:
        r = requests.get(f'{API_BASE}{path}', timeout=5)
        return r.status_code, r.json() if r.headers.get('content-type', '').startswith('application/json') else r.text
    except Exception as e:
        return 0, str(e)

def format_status(status):
    if not status or status.get('enabled') is False:
        return 'Playtime/Quiet hours: <b>not configured</b>'
    state = status.get('state', 'normal')
    block_source = status.get('blockSource')
    pt = status.get('playtime', {}) or {}
    qh = status.get('quiet', {}) or {}
    ovr = status.get('override', {}) or {}
    lines = []
    if state == 'normal':
        lines.append('Status: <b>OK</b> (Wiedergabe erlaubt)')
    elif state == 'grace':
        lines.append(f'Status: <b>Grace</b> (Track läuft aus, Quelle: {block_source})')
    elif state == 'blocked':
        lines.append(f'Status: <b>BLOCKIERT</b> (Quelle: {block_source})')
    if pt.get('enabled'):
        used = int(pt.get('usedSeconds', 0))
        rem = int(pt.get('remainingSeconds', 0))
        limit = int(pt.get('limitMinutes', 0))
        lines.append(f'Playtime: {used // 60}/{limit} min, noch {fmt_minutes(rem)}')
    if qh.get('enabled'):
        if qh.get('inWindow'):
            label = qh.get('label', '')
            lines.append(f'Quiet hours: <b>aktiv</b>{f" ({label})" if label else ""}')
        else:
            lines.append('Quiet hours: ein, aber gerade kein Fenster aktiv')
    now_ms = int(time.time() * 1000)
    if int(ovr.get('forceBlockUntil', 0)) > now_ms:
        until = int(ovr['forceBlockUntil'])
        mins = (until - now_ms) // 60000
        lines.append(f'⛔ Force-Block aktiv für noch {mins} min')
    if int(ovr.get('allowUntil', 0)) > now_ms:
        until = int(ovr['allowUntil'])
        mins = (until - now_ms) // 60000
        lines.append(f'✅ Override aktiv für noch {mins} min')
    return '\n'.join(lines)

message_with_inline_keyboard = None

def on_chat_message(msg):
    content_type, chat_type, chat_id = telepot.glance(msg)
    print(content_type, chat_type, chat_id)
    if not is_authorized(chat_id):
        print(f'Rejected message from unauthorized chat_id: {chat_id}')
        return
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
    elif command == '/status':
        status_code, body = call_api_get('/playtime')
        if status_code == 200:
            bot.sendMessage(chat_id, format_status(body), parse_mode='HTML')
        else:
            bot.sendMessage(chat_id, f'Status-Abfrage fehlgeschlagen: {status_code} {body}')
    elif command[:7] == '/extend':
        mins = parse_int_arg(command, default=30)
        if mins is None or mins <= 0 or mins > 1440:
            bot.sendMessage(chat_id, 'Nutzung: /extend <Minuten>  (1..1440)')
        else:
            status_code, body = call_api_post('/playtime/extend', {'minutes': mins})
            if status_code == 200:
                bot.sendMessage(chat_id, f'✅ Heute +{mins} min Bonus hinzugefügt.')
            else:
                bot.sendMessage(chat_id, f'Fehler: {status_code} {body}')
    elif command[:8] == '/release':
        mins = parse_int_arg(command, default=60)
        if mins is None or mins <= 0 or mins > 1440:
            bot.sendMessage(chat_id, 'Nutzung: /release <Minuten>  (1..1440)')
        else:
            status_code, body = call_api_post('/playtime/release', {'minutes': mins})
            if status_code == 200:
                bot.sendMessage(chat_id, f'✅ Override aktiv für {mins} min — alle Blocks aus.')
            else:
                bot.sendMessage(chat_id, f'Fehler: {status_code} {body}')
    elif command[:9] == '/quietnow':
        mins = parse_int_arg(command, default=60)
        if mins is None or mins <= 0 or mins > 1440:
            bot.sendMessage(chat_id, 'Nutzung: /quietnow <Minuten>  (1..1440)')
        else:
            status_code, body = call_api_post('/quiethours/now', {'minutes': mins})
            if status_code == 200:
                bot.sendMessage(chat_id, f'⛔ Sofort-Stopp für {mins} min aktiviert.')
            else:
                bot.sendMessage(chat_id, f'Fehler: {status_code} {body}')
    elif command == '/help':
        markup = InlineKeyboardMarkup(inline_keyboard=[
                                    [InlineKeyboardButton(text="Status",callback_data='status'), InlineKeyboardButton(text="Current Screen",callback_data='screen')],
                                    [InlineKeyboardButton(text="Pause",callback_data='pause'), InlineKeyboardButton(text="Play",callback_data='play')],
                                    [InlineKeyboardButton(text="+30 min",callback_data='extend_30'), InlineKeyboardButton(text="+60 min",callback_data='extend_60')],
                                    [InlineKeyboardButton(text="Release 60",callback_data='release_60'), InlineKeyboardButton(text="QuietNow 60",callback_data='quietnow_60')],
                                    [InlineKeyboardButton(text="Set Volume",callback_data='vol'), InlineKeyboardButton(text="Sleep Timer",callback_data='sleep')],
                                    [InlineKeyboardButton(text="Finish current album",callback_data='finishalbum'), InlineKeyboardButton(text="Update Media-DB",callback_data='media')],
                                    [InlineKeyboardButton(text="Shutdown",callback_data='shutdown'), InlineKeyboardButton(text="Reboot",callback_data='reboot')]
                                ]
                            )
        global message_with_inline_keyboard
        message_with_inline_keyboard = bot.sendMessage(chat_id, 'Possible commands:',reply_markup = markup)
    elif command == '/command':
        bot.sendMessage(chat_id, "<b><u>Possible commands:</u></b>\n\n<code><b>/help</b></code>\n<i>shows the inline keyboard</i>\n\n<code><b>/status</b></code>\n<i>show current playtime + quiet hours status</i>\n\n<code><b>/extend</b> <i>[minutes, default 30]</i></code>\n<i>add bonus minutes to today's playtime cap</i>\n\n<code><b>/release</b> <i>[minutes, default 60]</i></code>\n<i>bypass all blocks for N minutes</i>\n\n<code><b>/quietnow</b> <i>[minutes, default 60]</i></code>\n<i>force-block playback for N minutes</i>\n\n<code><b>/reboot</b></code>\n<code><b>/shutdown</b></code>\n<code><b>/screen</b></code>\n<code><b>/sleep</b> <i>[minutes]</i></code>\n<code><b>/vol</b> <i>[0-100]</i></code>\n<code><b>/media</b></code>\n<code><b>/finishalbum</b></code>", parse_mode='HTML')
    elif command == '/media':
        bot.sendMessage(chat_id, "Starting media data update... This take a while, please wait for complete message")
        subprocess.run(["sudo", "/usr/local/bin/mupibox/./m3u_generator.sh"])
        bot.sendMessage(chat_id, "Media update finished!")
    elif command == '/finishalbum':
        bot.sendMessage(chat_id, "After finishing the current album the MuPiBox will be shut down.")
        subprocess.run(["sudo", "/usr/local/bin/mupibox/./albumstop_activator.sh"])
    elif command == '/pause':
        bot.sendMessage(chat_id, "Pause")
        url = 'http://' + config['mupibox']['host'] + ':5005//pause'
        requests.get(url)
    elif command == '/play':
        bot.sendMessage(chat_id, "Play")
        url = 'http://' + config['mupibox']['host'] + ':5005//play'
        requests.get(url)

def on_callback_query(msg):
    query_id, from_id, query_data = telepot.glance(msg, flavor='callback_query')
    print('Callback Query:', query_id, from_id, query_data)
    if not is_authorized(from_id):
        print(f'Rejected callback from unauthorized user_id: {from_id}')
        return

    global message_with_inline_keyboard

    if query_data == 'screen':
        subprocess.run(["sudo", "rm", "/tmp/telegram_screen.png"])
        subprocess.run(["sudo", "-H", "-u", "dietpi", "bash", "-c", "DISPLAY=:0 scrot /tmp/telegram_screen.png"])
        bot.sendPhoto(from_id, open('/tmp/telegram_screen.png', 'rb'))
    elif query_data == 'status':
        status_code, body = call_api_get('/playtime')
        if status_code == 200:
            bot.sendMessage(from_id, format_status(body), parse_mode='HTML')
        else:
            bot.answerCallbackQuery(query_id, text=f'Status-Abfrage fehlgeschlagen: {status_code}', show_alert=True)
    elif query_data[:7] == 'extend_':
        mins = int(query_data.split('_')[1])
        status_code, body = call_api_post('/playtime/extend', {'minutes': mins})
        if status_code == 200:
            bot.answerCallbackQuery(query_id, text=f'+{mins} min hinzugefügt', show_alert=True)
        else:
            bot.answerCallbackQuery(query_id, text=f'Fehler: {status_code}', show_alert=True)
    elif query_data[:8] == 'release_':
        mins = int(query_data.split('_')[1])
        status_code, body = call_api_post('/playtime/release', {'minutes': mins})
        if status_code == 200:
            bot.answerCallbackQuery(query_id, text=f'Override für {mins} min aktiv', show_alert=True)
        else:
            bot.answerCallbackQuery(query_id, text=f'Fehler: {status_code}', show_alert=True)
    elif query_data[:9] == 'quietnow_':
        mins = int(query_data.split('_')[1])
        status_code, body = call_api_post('/quiethours/now', {'minutes': mins})
        if status_code == 200:
            bot.answerCallbackQuery(query_id, text=f'Stop für {mins} min aktiviert', show_alert=True)
        else:
            bot.answerCallbackQuery(query_id, text=f'Fehler: {status_code}', show_alert=True)
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
        url = 'http://' + config['mupibox']['host'] + ':5005//play'
        bot.answerCallbackQuery(query_id, text='Play', show_alert=True)
        requests.get(url)
    elif query_data == 'pause':
        url = 'http://' + config['mupibox']['host'] + ':5005//pause'
        bot.answerCallbackQuery(query_id, text='Pause', show_alert=True)
        requests.get(url)
    elif query_data == 'back':
        markup = InlineKeyboardMarkup(inline_keyboard=[
                        [InlineKeyboardButton(text="Status",callback_data='status'), InlineKeyboardButton(text="Current Screen",callback_data='screen')],
                        [InlineKeyboardButton(text="Pause",callback_data='pause'), InlineKeyboardButton(text="Play",callback_data='play')],
                        [InlineKeyboardButton(text="+30 min",callback_data='extend_30'), InlineKeyboardButton(text="+60 min",callback_data='extend_60')],
                        [InlineKeyboardButton(text="Release 60",callback_data='release_60'), InlineKeyboardButton(text="QuietNow 60",callback_data='quietnow_60')],
                        [InlineKeyboardButton(text="Set Volume",callback_data='vol'), InlineKeyboardButton(text="Sleep Timer",callback_data='sleep')],
                        [InlineKeyboardButton(text="Finish current album",callback_data='finishalbum'), InlineKeyboardButton(text="Update Media-DB",callback_data='media')],
                        [InlineKeyboardButton(text="Shutdown",callback_data='shutdown'), InlineKeyboardButton(text="Reboot",callback_data='reboot')]
                    ]
                )
        msg_idf = telepot.message_identifier(message_with_inline_keyboard)
        bot.editMessageText(msg_idf, 'Possible commands:', reply_markup = markup )
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
