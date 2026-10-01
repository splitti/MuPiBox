#!/usr/bin/python3

import sys
import time
import telepot
import json
import subprocess
import requests
from telepot.loop import MessageLoop
from telepot.namedtuple import InlineKeyboardMarkup, InlineKeyboardButton
from telegram_i18n import tr

with open("/etc/mupibox/mupiboxconfig.json") as file:
    config = json.load(file)

if not config['telegram']['active']:
    quit()

PLAYTIME_DAY_KEYS = {'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'}

def _normalize_chat_ids(value):
    """telegram.chatId may be a single string/number (legacy), an array of
    strings/numbers, or an array of {id, label?} objects (current format).
    Return a list of stringified IDs."""
    if not value:
        return []
    if isinstance(value, (str, int, float)):
        s = str(value).strip()
        return [s] if s else []
    if isinstance(value, list):
        out = []
        for item in value:
            if isinstance(item, (str, int, float)):
                s = str(item).strip()
                if s:
                    out.append(s)
            elif isinstance(item, dict):
                cid = str(item.get('id', '')).strip()
                if cid:
                    out.append(cid)
        return out
    return []

# Authorization: only respond to messages from configured chats. Without this
# anyone who learns the bot username could send /shutdown / /quietnow / etc.
# An empty list is treated as "deny all" — the user has to configure one for
# outbound notifications anyway.
ALLOWED_CHAT_IDS = set(_normalize_chat_ids(config['telegram'].get('chatId')))

# Backend-API base URL on the same host. Used for parent-control commands
# (extend / release / quietnow / status). The player listens for config
# changes via fs.watch, so changes apply within ~50 ms.
API_BASE = 'http://localhost:8200/api'

def is_authorized(chat_id):
    if not ALLOWED_CHAT_IDS:
        print('Refusing message: no chatId configured in mupiboxconfig.json')
        return False
    return str(chat_id) in ALLOWED_CHAT_IDS

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

def max_volume():
    try:
        return int(config['mupibox'].get('maxVolume', 100))
    except (ValueError, TypeError, KeyError):
        return 100

# AR5-2: /vol used to splice the raw post-arg into "<N>%" and pass it
# straight to amixer — no range check, no maxVolume cap. The Hörschutz
# clamp from MED-1 lives only in the backend-player setVolume() flow,
# so the Telegram /vol path was an unauthenticated bypass for any
# whitelisted chat. Plus IndexError if /vol is sent without an arg
# crashed the receiver thread (AR5-7). This helper handles both.
def clamp_volume(raw):
    try:
        v = int(raw)
    except (ValueError, TypeError):
        return None
    return max(0, min(v, max_volume()))

# AR5-7: /sleep <X> previously called int(split_cmd[1]) without try/except;
# /sleep without an arg was an IndexError that killed the receiver thread.
def clamp_sleep_minutes(raw):
    try:
        v = int(raw)
    except (ValueError, TypeError):
        return None
    return max(1, min(v, 1440))  # 1 min … 24 h

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

def block_source_name(source):
    key = {'playtime': 'src_playtime', 'quiet': 'src_quiet', 'override': 'src_override'}.get(source)
    return tr(key) if key else str(source)

def format_status(status):
    if not status or status.get('enabled') is False:
        return tr('st_not_configured')
    state = status.get('state', 'normal')
    source = block_source_name(status.get('blockSource'))
    pt = status.get('playtime', {}) or {}
    qh = status.get('quiet', {}) or {}
    ovr = status.get('override', {}) or {}
    lines = []
    if state == 'normal':
        lines.append(tr('st_ok'))
    elif state == 'grace':
        lines.append(tr('st_grace', source=source))
    elif state == 'blocked':
        lines.append(tr('st_blocked', source=source))
    if pt.get('enabled'):
        used = int(pt.get('usedSeconds', 0))
        rem = int(pt.get('remainingSeconds', 0))
        limit = int(pt.get('limitMinutes', 0))
        lines.append(tr('st_playtime', used=used // 60, limit=limit, left=fmt_minutes(rem)))
    if qh.get('enabled'):
        if qh.get('inWindow'):
            label = qh.get('label', '')
            lines.append(tr('st_quiet_active', label=f' ({label})' if label else ''))
        else:
            lines.append(tr('st_quiet_idle'))
    now_ms = int(time.time() * 1000)
    if int(ovr.get('forceBlockUntil', 0)) > now_ms:
        lines.append(tr('st_forceblock', mins=(int(ovr['forceBlockUntil']) - now_ms) // 60000))
    if int(ovr.get('allowUntil', 0)) > now_ms:
        lines.append(tr('st_override', mins=(int(ovr['allowUntil']) - now_ms) // 60000))
    return '\n'.join(lines)

def failure_detail(status_code, body):
    return f'{status_code} {body}' if body else str(status_code)

def help_keyboard():
    b = InlineKeyboardButton
    return InlineKeyboardMarkup(inline_keyboard=[
        [b(text=tr('kb_status'), callback_data='status'), b(text=tr('kb_screen'), callback_data='screen')],
        [b(text=tr('kb_pause'), callback_data='pause'), b(text=tr('kb_play'), callback_data='play')],
        [b(text='+30 min', callback_data='extend_30'), b(text='+60 min', callback_data='extend_60')],
        [b(text=tr('kb_release60'), callback_data='release_60'), b(text=tr('kb_quietnow60'), callback_data='quietnow_60')],
        [b(text=tr('kb_volume'), callback_data='vol'), b(text=tr('kb_sleep'), callback_data='sleep')],
        # No "Update media DB" button: change_checker runs it when the media folder changes, and it blocks the bot
        # for a long time; /media (text command) and the admin interface still have it.
        [b(text=tr('kb_finishalbum'), callback_data='finishalbum')],
        [b(text=tr('kb_login'), callback_data='login')],
        [b(text=tr('kb_resync'), callback_data='resync'), b(text=tr('kb_syncstatus'), callback_data='syncstatus')],
        [b(text=tr('kb_shutdown'), callback_data='shutdown'), b(text=tr('kb_reboot'), callback_data='reboot')]
    ])

def box_base_url():
    # Telegram only makes a link tappable when its host is a real domain or an IP
    # address; a bare host name like "MuPiBox" stays plain text. So use the LAN IP.
    ip = ''
    try:
        out = subprocess.run(['hostname', '-I'], capture_output=True, text=True, timeout=3).stdout.split()
        ip = next((a for a in out if '.' in a), '')
    except Exception:
        pass
    # port 80/443: the web server passes /app to the app, as the QR code on the display - https when "Nur sichere
    # Verbindung" is on, and the name set for links (e.g. an own certificate's) instead of the IP
    # (read now: the switch may have changed since the bot started)
    try:
        with open("/etc/mupibox/mupiboxconfig.json") as file:
            live = json.load(file)
    except Exception:
        live = config
    tls = live.get('tls') or {}
    scheme = 'https' if tls.get('httpsOnly') is True else 'http'
    host = tls.get('linkHost') or ip or config['mupibox'].get('host', 'localhost')
    return f"{scheme}://{host}"

def send_magic_link(chat_id, heading, button_text, page=''):
    # Issue a single-use magic link for the MuPiBox app (/app). We post from
    # 127.0.0.1 so the localNetworkOnly gate accepts us; the receiver's
    # chatId-whitelist (is_authorized in on_chat_message) is the actual
    # auth boundary for who can request a link.
    status_code, body = call_api_post('/app/magic-link/generate', {'source': 'telegram'})
    if status_code != 201 or not isinstance(body, dict):
        bot.sendMessage(chat_id, tr('magic_failed', detail=failure_detail(status_code, body)))
        return
    # page: the app opens on that page (its address after the #, e.g. '/spotify')
    url = box_base_url() + body.get('url_path', '/app') + (f'#{page}' if page else '')
    expires = body.get('expires_in', 900)
    text = f'{heading}\n\n{tr("magic_valid", mins=expires // 60)}\n\n<a href="{url}">{button_text}</a>\n\n<code>{url}</code>'
    markup = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text=button_text, url=url)]])
    try:
        bot.sendMessage(chat_id, text, parse_mode='HTML', disable_web_page_preview=True, reply_markup=markup)
    except Exception as e:
        # Telegram refuses button URLs it doesn't like; the text link still works then.
        print(f'Magic link with button failed ({e}), sending without')
        bot.sendMessage(chat_id, text, parse_mode='HTML', disable_web_page_preview=True)

def send_minutes_action(chat_id, command, default, path, done_key):
    mins = parse_int_arg(command, default=default)
    if mins is None or mins <= 0 or mins > 1440:
        bot.sendMessage(chat_id, tr('usage_minutes', cmd=command.split()[0]))
        return
    status_code, body = call_api_post(path, {'minutes': mins})
    if status_code == 200:
        bot.sendMessage(chat_id, tr(done_key, mins=mins))
    else:
        bot.sendMessage(chat_id, tr('error', detail=failure_detail(status_code, body)))

def on_chat_message(msg):
    content_type, chat_type, chat_id = telepot.glance(msg)
    print(content_type, chat_type, chat_id)
    if not is_authorized(chat_id):
        print(f'Rejected message from unauthorized chat_id: {chat_id}')
        return
    if content_type != 'text':
        return
    command = msg['text']
    # In groups Telegram appends the bot's name to a tapped command ("/login@MyBot"); drop it.
    first, _, rest = command.partition(' ')
    command = first.split('@', 1)[0] + (' ' + rest if rest else '')
    if command == '/shutdown':
        subprocess.run(["sudo", "bash", "/usr/local/bin/mupibox/shutdown.sh"])
    elif command == '/screen':
        subprocess.run(["sudo", "rm", "/tmp/telegram_screen.png"])
        subprocess.run(["sudo", "-H", "-u", "dietpi", "bash", "-c", "DISPLAY=:0 scrot /tmp/telegram_screen.png"])
        bot.sendPhoto(chat_id, open('/tmp/telegram_screen.png', 'rb'))
    elif command == '/reboot':
        subprocess.run(["sudo", "reboot"])
    elif command[:4] == '/vol':
        # AR5-2 / AR5-7: validate, clamp to [0, maxVolume]; reject missing/non-int args.
        v = clamp_volume(parse_int_arg(command, default=None))
        if v is None:
            bot.sendMessage(chat_id, tr('usage_vol', max=max_volume()))
        else:
            volume = f"{v}%"
            subprocess.run(["/usr/bin/amixer", "sset", "Master", volume])
            bot.sendMessage(chat_id, tr('vol_set', volume=volume))
    elif command[:6] == '/sleep':
        # AR5-7: validate, reject missing/non-int args.
        mins = clamp_sleep_minutes(parse_int_arg(command, default=None))
        if mins is None:
            bot.sendMessage(chat_id, tr('usage_sleep'))
        else:
            subprocess.Popen(["sudo", "nohup", "/usr/local/bin/mupibox/./sleep_timer.sh", str(mins * 60)])
            bot.sendMessage(chat_id, tr('sleep_set', mins=mins))
    elif command == '/status':
        status_code, body = call_api_get('/playtime')
        if status_code == 200:
            bot.sendMessage(chat_id, format_status(body), parse_mode='HTML')
        else:
            bot.sendMessage(chat_id, tr('status_failed', detail=failure_detail(status_code, body)))
    elif command[:7] == '/extend':
        send_minutes_action(chat_id, command, 30, '/playtime/extend', 'extend_done')
    elif command[:8] == '/release':
        send_minutes_action(chat_id, command, 60, '/playtime/release', 'release_done')
    elif command[:9] == '/quietnow':
        send_minutes_action(chat_id, command, 60, '/quiethours/now', 'quietnow_done')
    elif command[:6] == '/limit':
        # Usage: /limit set <day> <minutes>   (day = mon..sun, minutes = 0..1440)
        # Mutates playtimeLimit.limitsMinutes.<day> in mupiboxconfig.json.
        # The player picks up the change via fs.watch within ~50 ms.
        parts = command.split()
        if len(parts) >= 4 and parts[1] == 'set':
            day = parts[2].lower()
            try:
                mins = int(parts[3])
            except (ValueError, TypeError):
                mins = -1
            if day not in PLAYTIME_DAY_KEYS or mins < 0 or mins > 1440:
                bot.sendMessage(chat_id, tr('usage_limit'))
            else:
                status_code, body = call_api_post('/playtime/limit', {'day': day, 'minutes': mins})
                if status_code == 200:
                    bot.sendMessage(chat_id, tr('limit_done', day=day, mins=mins))
                else:
                    bot.sendMessage(chat_id, tr('error', detail=failure_detail(status_code, body)))
        else:
            bot.sendMessage(chat_id, tr('usage_limit'))
    elif command == '/help':
        bot.sendMessage(chat_id, tr('help_title'), reply_markup=help_keyboard())
    elif command == '/command':
        bot.sendMessage(chat_id, tr('commands'), parse_mode='HTML')
    elif command == '/media':
        bot.sendMessage(chat_id, tr('media_start'))
        subprocess.run(["sudo", "/usr/local/bin/mupibox/./m3u_generator.sh"])
        bot.sendMessage(chat_id, tr('media_done'))
    elif command == '/finishalbum':
        bot.sendMessage(chat_id, tr('finishalbum'))
        subprocess.run(["sudo", "/usr/local/bin/mupibox/./albumstop_activator.sh"])
    elif command.split(' ', 1)[0] in ('/sag', '/say'):
        # a parents' announcement: the box says the text now (Sprachausgabe in the app)
        text = command.split(' ', 1)[1].strip() if ' ' in command else ''
        if not text:
            bot.sendMessage(chat_id, tr('usage_say'))
        else:
            status_code, body = call_api_post('/app/speech/say-local', {'text': text[:300]})
            if status_code == 200:
                bot.sendMessage(chat_id, tr('say_ok'))
            elif isinstance(body, dict) and body.get('error') == 'announcements_off':
                bot.sendMessage(chat_id, tr('say_off'))
            elif isinstance(body, dict) and body.get('error') == 'speech_off':
                bot.sendMessage(chat_id, tr('say_silent'))
            else:
                bot.sendMessage(chat_id, tr('error', detail=failure_detail(status_code, body)))
    elif command == '/pause':
        bot.sendMessage(chat_id, tr('pause'))
        url = 'http://127.0.0.1:5005//pause'  # local: the player only takes commands from the box itself or its own pages
        requests.get(url, timeout=5)
    elif command == '/play':
        bot.sendMessage(chat_id, tr('play'))
        url = 'http://127.0.0.1:5005//play'  # local: the player only takes commands from the box itself or its own pages
        requests.get(url, timeout=5)
    # ── Phase 14d — Spotify Smart-Sync controls ────────────────────────
    elif command == '/resync':
        status_code, body = call_api_post('/spotify-sync/trigger?source=telegram', {})
        if status_code == 202:
            bot.sendMessage(chat_id, tr('sync_started'))
        elif status_code == 429:
            wait = (body or {}).get('retry_after_seconds', 60) if isinstance(body, dict) else 60
            bot.sendMessage(chat_id, tr('sync_cooldown', wait=wait))
        elif status_code == 409:
            bot.sendMessage(chat_id, tr('sync_running'))
        elif status_code == 400:
            bot.sendMessage(chat_id, tr('sync_disabled'))
        else:
            bot.sendMessage(chat_id, tr('error', detail=failure_detail(status_code, body)))
    elif command == '/syncstatus':
        status_code, body = call_api_get('/spotify-sync/status')
        if status_code != 200 or not isinstance(body, dict):
            bot.sendMessage(chat_id, tr('syncstatus_failed', detail=status_code))
        else:
            state_info = body.get('state', {}) or {}
            token_info = body.get('token', {}) or {}
            lines = [
                tr('ss_title'),
                tr('ss_enabled', mark='✅' if body.get('enabled') else '❌'),
                tr('ss_token', valid='✅' if token_info.get('valid') else '❌', scopes='✅' if token_info.get('scopes_ok') else '❌'),
                tr('ss_prefix', prefix=body.get('playlist_prefix', '?')),
                tr('ss_interval', mins=body.get('polling_interval_seconds', 0) // 60),
                '',
                tr('ss_last', status=state_info.get('last_sync_status', '—')),
                tr('ss_time', time=state_info.get('last_sync_end') or '—'),
                tr('ss_counts', adds=state_info.get('additions_count', 0), upds=state_info.get('updates_count', 0),
                   rems=state_info.get('removals_count', 0), confs=len(state_info.get('conflicts', []) or [])),
            ]
            bot.sendMessage(chat_id, '\n'.join(lines), parse_mode='HTML')
    elif command == '/playlists':
        status_code, body = call_api_get('/spotify-sync/status')
        if status_code != 200 or not isinstance(body, dict):
            bot.sendMessage(chat_id, tr('playlists_failed', detail=status_code))
        else:
            playlists = (body.get('state', {}) or {}).get('playlists_seen', []) or []
            if not playlists:
                bot.sendMessage(chat_id, tr('playlists_none'))
            else:
                lines = [tr('playlists_title')]
                for p in playlists:
                    lines.append(f'📂 <code>{p.get("name", "?")}</code> · {tr("playlist_items", n=p.get("items", 0))}')
                bot.sendMessage(chat_id, '\n'.join(lines), parse_mode='HTML')
    elif command in ('/login', '/eltern-login', '/eltern_login'):
        send_magic_link(chat_id, tr('login_heading'), tr('login_button'))
    elif command in ('/spotify_connect', '/spotify-connect'):
        # Same flow as /login — the WebApp's setup wizard will
        # guide the user through Spotify OAuth.
        send_magic_link(chat_id, tr('connect_heading'), tr('login_button'), '/spotify')
    elif command in ('/spotify_disconnect', '/spotify-disconnect'):
        # Confirm-step inline keyboard so a fat-finger tap doesn't kill
        # an active token. Actual disconnect happens in the callback handler.
        markup = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text=tr('disconnect_yes'), callback_data='spotify_disconnect_confirm')],
            [InlineKeyboardButton(text=tr('disconnect_no'), callback_data='spotify_disconnect_cancel')],
        ])
        bot.sendMessage(chat_id, tr('disconnect_q'), reply_markup=markup)

def on_callback_query(msg):
    query_id, from_id, query_data = telepot.glance(msg, flavor='callback_query')
    # The buttons hang on the message that answered /help. In a group that chat
    # is the group (its id is what the parents allowed), not the person tapping,
    # so authorize and reply via the message's chat.
    keyboard_msg = msg.get('message') or {}
    chat_id = keyboard_msg.get('chat', {}).get('id', from_id)
    print('Callback Query:', query_id, chat_id, from_id, query_data)
    answered = False

    def answer(text=None, show_alert=True):
        # Telegram takes one answer per tap; it also stops the spinner on the button.
        nonlocal answered
        if answered:
            return
        answered = True
        try:
            bot.answerCallbackQuery(query_id, text=text, show_alert=show_alert)
        except Exception as e:
            print(f'answerCallbackQuery failed: {e}')

    if not (is_authorized(chat_id) or is_authorized(from_id)):
        print(f'Rejected callback from unauthorized chat_id {chat_id} / user_id {from_id}')
        answer(tr('not_allowed'), show_alert=False)
        return

    try:
        handle_callback(query_data, chat_id, keyboard_msg, answer)
    finally:
        answer(show_alert=False)

def handle_callback(query_data, chat_id, keyboard_msg, answer):
    if query_data == 'screen':
        subprocess.run(["sudo", "rm", "/tmp/telegram_screen.png"])
        subprocess.run(["sudo", "-H", "-u", "dietpi", "bash", "-c", "DISPLAY=:0 scrot /tmp/telegram_screen.png"])
        bot.sendPhoto(chat_id, open('/tmp/telegram_screen.png', 'rb'))
    elif query_data == 'status':
        status_code, body = call_api_get('/playtime')
        if status_code == 200:
            bot.sendMessage(chat_id, format_status(body), parse_mode='HTML')
        else:
            answer(text=tr('status_failed', detail=status_code), show_alert=True)
    elif query_data[:7] == 'extend_':
        mins = int(query_data.split('_')[1])
        status_code, body = call_api_post('/playtime/extend', {'minutes': mins})
        if status_code == 200:
            answer(text=tr('extend_short', mins=mins), show_alert=True)
        else:
            answer(text=tr('error', detail=status_code), show_alert=True)
    elif query_data[:8] == 'release_':
        mins = int(query_data.split('_')[1])
        status_code, body = call_api_post('/playtime/release', {'minutes': mins})
        if status_code == 200:
            answer(text=tr('release_short', mins=mins), show_alert=True)
        else:
            answer(text=tr('error', detail=status_code), show_alert=True)
    elif query_data[:9] == 'quietnow_':
        mins = int(query_data.split('_')[1])
        status_code, body = call_api_post('/quiethours/now', {'minutes': mins})
        if status_code == 200:
            answer(text=tr('quietnow_short', mins=mins), show_alert=True)
        else:
            answer(text=tr('error', detail=status_code), show_alert=True)
    elif query_data == 'vol':
        b = InlineKeyboardButton
        markup = InlineKeyboardMarkup(inline_keyboard=[
            [b(text="10", callback_data='vol_10'), b(text="20", callback_data='vol_20')],
            [b(text="30", callback_data='vol_30'), b(text="40", callback_data='vol_40')],
            [b(text="50", callback_data='vol_50'), b(text="60", callback_data='vol_60')],
            [b(text="70", callback_data='vol_70'), b(text="80", callback_data='vol_80')],
            [b(text="90", callback_data='vol_90'), b(text=tr('kb_back'), callback_data='back')]
        ])
        bot.editMessageText(telepot.message_identifier(keyboard_msg), tr('vol_question'), reply_markup=markup)
    elif query_data == 'sleep':
        b = InlineKeyboardButton
        markup = InlineKeyboardMarkup(inline_keyboard=[
            [b(text="5", callback_data='sleep_5'), b(text="15", callback_data='sleep_15')],
            [b(text="30", callback_data='sleep_30'), b(text="45", callback_data='sleep_45')],
            [b(text="60", callback_data='sleep_60'), b(text=tr('kb_back'), callback_data='back')]
        ])
        bot.editMessageText(telepot.message_identifier(keyboard_msg), tr('sleep_question'), reply_markup=markup)
    elif query_data[:4] == 'vol_':
        # Inline-keyboard values are hardcoded (10/30/50/70/100) but defense-
        # in-depth: clamp anyway so a future button change can't bypass
        # maxVolume. Same for /sleep_<N> below.
        parts = query_data.split("_", 1)
        v = clamp_volume(parts[1] if len(parts) > 1 else None)
        if v is None:
            answer(text=tr('vol_invalid'), show_alert=True)
        else:
            volume = f"{v}%"
            subprocess.run(["/usr/bin/amixer", "sset", "Master", volume])
            answer(text=tr('vol_set', volume=volume), show_alert=True)
    elif query_data[:6] == 'sleep_':
        parts = query_data.split("_", 1)
        mins = clamp_sleep_minutes(parts[1] if len(parts) > 1 else None)
        if mins is None:
            answer(text=tr('sleep_invalid'), show_alert=True)
        else:
            subprocess.Popen(["sudo", "nohup", "/usr/local/bin/mupibox/./sleep_timer.sh", str(mins * 60)])
            bot.sendMessage(chat_id, tr('sleep_set', mins=mins))
    elif query_data == 'play':
        url = 'http://127.0.0.1:5005//play'  # local: the player only takes commands from the box itself or its own pages
        answer(text=tr('play'), show_alert=True)
        requests.get(url, timeout=5)
    elif query_data == 'pause':
        url = 'http://127.0.0.1:5005//pause'  # local: the player only takes commands from the box itself or its own pages
        answer(text=tr('pause'), show_alert=True)
        requests.get(url, timeout=5)
    elif query_data == 'back':
        bot.editMessageText(telepot.message_identifier(keyboard_msg), tr('help_title'), reply_markup=help_keyboard())
    elif query_data == 'login':
        send_magic_link(chat_id, tr('login_heading'), tr('login_button'))
    elif query_data == 'finishalbum':
        answer(text=tr('finishalbum'), show_alert=True)
        bot.sendMessage(chat_id, tr('finishalbum'))
        subprocess.run(["sudo", "/usr/local/bin/mupibox/./albumstop_activator.sh"])
    elif query_data == 'shutdown':
        answer(text=tr('shutdown_now'), show_alert=True)
        subprocess.run(["sudo", "bash", "/usr/local/bin/mupibox/shutdown.sh"])
    elif query_data == 'reboot':
        answer(text=tr('reboot_now'), show_alert=True)
        subprocess.run(["sudo", "reboot"])
    elif query_data == 'media':
        answer(text=tr('media_start'), show_alert=True)
        subprocess.run(["sudo", "/usr/local/bin/mupibox/./m3u_generator.sh"])
        bot.sendMessage(chat_id, tr('media_done'))
    # ── Phase 14d — Smart-Sync controls ──────────────────────────────────
    elif query_data == 'spotify_disconnect_confirm':
        # POST /api/app/spotify-oauth/disconnect needs a session cookie
        # AND csrf token — both of which we don't have from a Telegram-bot
        # context. Pragmatic stop-gap: just disable spotify_sync; full
        # token-clear is one extra step parents can do in the WebApp.
        sc, _ = call_api_post('/spotify-sync/config', {'enabled': False})
        if sc == 200:
            answer(text=tr('disconnect_done'), show_alert=True)
        else:
            answer(text=tr('error', detail=sc), show_alert=True)
    elif query_data == 'spotify_disconnect_cancel':
        answer(text=tr('cancelled'), show_alert=False)
    elif query_data == 'resync':
        sc, body = call_api_post('/spotify-sync/trigger?source=telegram', {})
        if sc == 202:
            answer(text=tr('sync_started_short'), show_alert=True)
        elif sc == 429:
            wait = (body or {}).get('retry_after_seconds', 60) if isinstance(body, dict) else 60
            answer(text=tr('sync_cooldown', wait=wait), show_alert=True)
        elif sc == 409:
            answer(text=tr('sync_running'), show_alert=True)
        elif sc == 400:
            answer(text=tr('sync_disabled'), show_alert=True)
        else:
            answer(text=tr('error', detail=sc), show_alert=True)
    elif query_data == 'syncstatus':
        sc, body = call_api_get('/spotify-sync/status')
        if sc == 200 and isinstance(body, dict):
            state_info = body.get('state', {}) or {}
            last_status = state_info.get('last_sync_status', '—')
            adds = state_info.get('additions_count', 0)
            upds = state_info.get('updates_count', 0)
            rems = state_info.get('removals_count', 0)
            answer(text=f'{last_status}  +{adds}/↻{upds}/−{rems}', show_alert=True)
        else:
            answer(text=tr('error', detail=sc), show_alert=True)

TOKEN = config['telegram']['token']
bot = telepot.Bot(TOKEN)

MessageLoop(bot, {'chat': on_chat_message,
                  'callback_query': on_callback_query}).run_as_thread()
print ('Listening ...')

while 1:
    time.sleep(10)
