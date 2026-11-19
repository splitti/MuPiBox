#!/usr/bin/python3
# Sends a message to all configured Telegram chats, in the bot's language (see telegram_i18n.py):
#   telegram_send_message.py "text"                       known fixed texts are translated, others sent as they are
#   telegram_send_message.py --key <key> [name=value ...]  a text from telegram_i18n.TEXTS with its placeholders

import sys
import telepot
import json
from telegram_chats import normalize_chat_ids, send_to_all
from telegram_i18n import KNOWN_MESSAGES, translate_message, tr

BATTERY_KEYS = {"n_box_starting", "n_box_shutdown", "n_box_idle", "n_box_shutdown_battery"}

with open("/etc/mupibox/mupiboxconfig.json") as file:
    config = json.load(file)

if not config['telegram']['active']:
    quit()

chat_ids = normalize_chat_ids(config['telegram'].get('chatId'))
if not chat_ids:
    quit()

if len(sys.argv) >= 3 and sys.argv[1] == '--key':
    key = sys.argv[2]
    values = dict(arg.split('=', 1) for arg in sys.argv[3:] if '=' in arg)
    message = tr(key, **values)
elif len(sys.argv) >= 2:
    key = KNOWN_MESSAGES.get(sys.argv[1].strip())
    message = translate_message(sys.argv[1])
else:
    quit()

# The battery's charge with the messages about the box itself (start, shutdown), in the same message. It used to come
# as a message of its own after every message, the playback ones included.
if key in BATTERY_KEYS and config.get('mupihat', {}).get('hat_active'):
    try:
        with open("/tmp/mupihat.json") as file:
            mupihat = json.load(file)
        if mupihat.get('BatteryConnected'):
            message += '\n' + tr('n_battery', soc=mupihat['Bat_SOC'])
    except (OSError, ValueError, KeyError):
        pass

# Several users on (5.1): whose time it is - the message is read later, a sibling may have taken over meanwhile
USER_KEYS = {"n_playtime_used_up", "n_quiet_started", "n_quiet_started_label"}
if key in USER_KEYS:
    try:
        with open("/home/dietpi/.mupibox/data/users/users.json") as file:
            users = json.load(file)
        if users.get('enabled') and len(users.get('users') or []) >= 2:
            name = next((u.get('name') for u in users['users'] if u.get('id') == users.get('current')), None)
            if name:
                message += f' ({name})'
    except (OSError, ValueError, AttributeError, TypeError):
        pass

bot = telepot.Bot(config['telegram']['token'])
send_to_all(bot, message, chat_ids)
