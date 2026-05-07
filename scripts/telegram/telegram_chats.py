#!/usr/bin/python3
"""Shared helpers for telegram_*.py scripts.

The on-box scripts live in /usr/local/bin/mupibox/ and are invoked with
absolute paths; Python adds the script's directory to sys.path, so a plain
`from telegram_chats import ...` works at runtime.
"""


def normalize_chat_ids(value):
    """Return a list of stringified Telegram chat IDs.

    `telegram.chatId` in mupiboxconfig.json may be:
      - empty / None / empty string / empty array → []
      - a single string or number (legacy single-chat) → [str(value)]
      - an array of strings/numbers → each stringified
      - an array of {id, label?} objects (current admin-UI format) → use .id
    """
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


def send_to_all(bot, message, chat_ids, **kwargs):
    """sendMessage to each chat_id, swallow per-chat errors."""
    for cid in chat_ids:
        try:
            bot.sendMessage(cid, message, **kwargs)
        except Exception as e:
            print(f'Failed to send to {cid}: {e}')


def photo_to_all(bot, photo_path, chat_ids):
    """sendPhoto to each chat_id, swallow per-chat errors."""
    for cid in chat_ids:
        try:
            with open(photo_path, 'rb') as f:
                bot.sendPhoto(cid, f)
        except Exception as e:
            print(f'Failed to send photo to {cid}: {e}')
