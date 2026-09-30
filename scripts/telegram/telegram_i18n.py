#!/usr/bin/python3
"""Texts of the Telegram bot and the box's Telegram messages, in German and English.

The bot speaks German when the display language (mupiboxconfig.json "displayLanguage", set in the app or the
admin interface) is German, English otherwise.
Changing the language needs no restart: it is read again when the config file changed.
"""

import json
import os

CONFIG_PATH = '/etc/mupibox/mupiboxconfig.json'
_lang_cache = {'mtime': None, 'lang': 'en'}


def bot_language():
    try:
        mtime = os.path.getmtime(CONFIG_PATH)
        if mtime != _lang_cache['mtime']:
            with open(CONFIG_PATH) as f:
                code = str(json.load(f).get('displayLanguage') or '').lower()
            _lang_cache['lang'] = 'de' if code.split('-')[0] == 'de' else 'en'
            _lang_cache['mtime'] = mtime
    except Exception:
        pass
    return _lang_cache['lang']


TEXTS = {
    # ── /status ─────────────────────────────────────────────────────────────
    'st_not_configured': {'de': 'Spielzeit/Ruhezeiten: <b>nicht eingerichtet</b>', 'en': 'Playtime/quiet hours: <b>not set up</b>'},
    'st_ok': {'de': 'Status: <b>OK</b> (Wiedergabe erlaubt)', 'en': 'Status: <b>OK</b> (playback allowed)'},
    'st_grace': {'de': 'Status: <b>Nachspielzeit</b> (läuft aus, Grund: {source})', 'en': 'Status: <b>Grace period</b> (finishing, reason: {source})'},
    'st_blocked': {'de': 'Status: <b>GESPERRT</b> (Grund: {source})', 'en': 'Status: <b>BLOCKED</b> (reason: {source})'},
    'src_playtime': {'de': 'Spielzeit', 'en': 'playtime'},
    'src_quiet': {'de': 'Ruhezeit', 'en': 'quiet time'},
    'src_override': {'de': 'Ruhe sofort', 'en': 'quiet now'},
    'st_playtime': {'de': 'Spielzeit: {used}/{limit} min, noch {left}', 'en': 'Playtime: {used}/{limit} min, {left} left'},
    'st_quiet_active': {'de': 'Ruhezeit: <b>aktiv</b>{label}', 'en': 'Quiet time: <b>active</b>{label}'},
    'st_quiet_idle': {'de': 'Ruhezeiten: an, gerade keine aktiv', 'en': 'Quiet hours: on, none active right now'},
    'st_forceblock': {'de': '⛔ Ruhe sofort aktiv, noch {mins} min', 'en': '⛔ Quiet now active, {mins} min left'},
    'st_override': {'de': '✅ Freigabe aktiv, noch {mins} min', 'en': '✅ Release active, {mins} min left'},
    'status_failed': {'de': 'Status-Abfrage fehlgeschlagen: {detail}', 'en': 'Status request failed: {detail}'},

    # ── /help keyboard ──────────────────────────────────────────────────────
    'help_title': {'de': 'Was möchtest du tun?', 'en': 'Possible commands:'},
    'kb_status': {'de': 'Status', 'en': 'Status'},
    'kb_screen': {'de': 'Bildschirm', 'en': 'Current screen'},
    'kb_pause': {'de': 'Pause', 'en': 'Pause'},
    'kb_play': {'de': 'Abspielen', 'en': 'Play'},
    'kb_release60': {'de': 'Freigabe 60 min', 'en': 'Release 60 min'},
    'kb_quietnow60': {'de': 'Ruhe sofort 60 min', 'en': 'Quiet now 60 min'},
    'kb_volume': {'de': 'Lautstärke', 'en': 'Set volume'},
    'kb_sleep': {'de': 'Schlaftimer', 'en': 'Sleep timer'},
    'kb_finishalbum': {'de': 'Nach dem Album aus', 'en': 'Finish current album'},
    'kb_media': {'de': 'Medien aktualisieren', 'en': 'Update media DB'},
    'kb_login': {'de': '🔑 Eltern-Login', 'en': '🔑 Parent login'},
    'kb_resync': {'de': '🔄 Smart-Sync', 'en': '🔄 Smart-Sync'},
    'kb_syncstatus': {'de': 'Sync-Status', 'en': 'Sync status'},
    'kb_shutdown': {'de': 'Ausschalten', 'en': 'Shut down'},
    'kb_reboot': {'de': 'Neu starten', 'en': 'Reboot'},
    'kb_back': {'de': 'Zurück', 'en': 'Back'},
    'vol_question': {'de': 'Welche Lautstärke?', 'en': 'Which volume?'},
    'sleep_question': {'de': 'In wie vielen Minuten soll sich die MuPiBox ausschalten?', 'en': 'In how many minutes should the MuPiBox switch off?'},

    # ── commands and buttons ────────────────────────────────────────────────
    'usage_vol': {'de': 'Nutzung: /vol <0-{max}>', 'en': 'Usage: /vol <0-{max}>'},
    'vol_set': {'de': 'Lautstärke auf {volume} gestellt', 'en': 'Volume set to {volume}'},
    'vol_invalid': {'de': 'Ungültige Lautstärke', 'en': 'Invalid volume'},
    'usage_sleep': {'de': 'Nutzung: /sleep <1-1440>', 'en': 'Usage: /sleep <1-1440>'},
    'sleep_set': {'de': 'Schlaftimer: Die MuPiBox schaltet sich in {mins} Minuten aus', 'en': 'Sleep timer set to {mins} minutes'},
    'sleep_invalid': {'de': 'Ungültige Minutenzahl', 'en': 'Invalid sleep value'},
    'usage_minutes': {'de': 'Nutzung: {cmd} <Minuten>  (1..1440)', 'en': 'Usage: {cmd} <minutes>  (1..1440)'},
    'extend_done': {'de': '✅ Heute +{mins} min Bonus hinzugefügt.', 'en': '✅ Added {mins} bonus minutes for today.'},
    'extend_short': {'de': '+{mins} min hinzugefügt', 'en': '+{mins} min added'},
    'release_done': {'de': '✅ Freigabe für {mins} min – alle Sperren aus.', 'en': '✅ Released for {mins} min – all blocks off.'},
    'release_short': {'de': 'Freigabe für {mins} min aktiv', 'en': 'Released for {mins} min'},
    'quietnow_done': {'de': '⛔ Ruhe sofort für {mins} min aktiviert.', 'en': '⛔ Quiet now for {mins} min.'},
    'quietnow_short': {'de': 'Ruhe sofort für {mins} min', 'en': 'Quiet now for {mins} min'},
    'error': {'de': 'Fehler: {detail}', 'en': 'Error: {detail}'},
    'usage_limit': {'de': 'Nutzung: /limit set <mon|tue|wed|thu|fri|sat|sun> <Minuten 0..1440>', 'en': 'Usage: /limit set <mon|tue|wed|thu|fri|sat|sun> <minutes 0..1440>'},
    'limit_done': {'de': '✅ Limit für {day} auf {mins} min gesetzt.', 'en': '✅ Limit for {day} set to {mins} min.'},
    'media_start': {'de': 'Die Medien werden aktualisiert … Das dauert etwas, ich melde mich, wenn es fertig ist.', 'en': 'Updating the media data … This takes a while, I will report when it is done.'},
    'media_done': {'de': 'Medien-Aktualisierung fertig!', 'en': 'Media update finished!'},
    'finishalbum': {'de': 'Nach dem aktuellen Album schaltet sich die MuPiBox aus.', 'en': 'After the current album the MuPiBox will shut down.'},
    'pause': {'de': 'Pause', 'en': 'Pause'},
    'play': {'de': 'Wiedergabe', 'en': 'Play'},
    'shutdown_now': {'de': 'MuPiBox wird ausgeschaltet!', 'en': 'MuPiBox is shutting down!'},
    'reboot_now': {'de': 'MuPiBox startet neu!', 'en': 'MuPiBox is rebooting!'},
    'not_allowed': {'de': 'Nicht erlaubt', 'en': 'Not allowed'},

    # ── Smart-Sync ──────────────────────────────────────────────────────────
    'sync_started': {'de': '🔄 Sync gestartet – das Ergebnis zeigt /syncstatus.', 'en': '🔄 Sync started – /syncstatus shows the result.'},
    'sync_started_short': {'de': '🔄 Sync gestartet.', 'en': '🔄 Sync started.'},
    'sync_cooldown': {'de': '⏱ Bitte in {wait} s noch einmal versuchen.', 'en': '⏱ Please try again in {wait} s.'},
    'sync_running': {'de': '⏳ Es läuft bereits ein Sync.', 'en': '⏳ A sync is already running.'},
    'sync_disabled': {'de': '⚠️ Smart-Sync ist nicht aktiviert. Du schaltest ihn in der MuPiBox-App ein (/login).', 'en': '⚠️ Smart-Sync is not enabled. Turn it on in the MuPiBox app (/login).'},
    'syncstatus_failed': {'de': 'Sync-Status-Abfrage fehlgeschlagen: {detail}', 'en': 'Sync status request failed: {detail}'},
    'ss_title': {'de': '<b>Smart-Sync-Status</b>', 'en': '<b>Smart-Sync status</b>'},
    'ss_enabled': {'de': 'Aktiv: {mark}', 'en': 'Enabled: {mark}'},
    'ss_token': {'de': 'Spotify-Anmeldung gültig: {valid}  ·  Berechtigungen: {scopes}', 'en': 'Spotify sign-in valid: {valid}  ·  permissions: {scopes}'},
    'ss_prefix': {'de': 'Playlist-Präfix: <code>{prefix}</code>', 'en': 'Playlist prefix: <code>{prefix}</code>'},
    'ss_interval': {'de': 'Abfrage alle {mins} min', 'en': 'Checks every {mins} min'},
    'ss_last': {'de': 'Letzter Sync: {status}', 'en': 'Last sync: {status}'},
    'ss_time': {'de': 'Zeitpunkt: {time}', 'en': 'Time: {time}'},
    'ss_counts': {'de': '+{adds}  ↻{upds}  −{rems}  Konflikte: {confs}', 'en': '+{adds}  ↻{upds}  −{rems}  conflicts: {confs}'},
    'playlists_failed': {'de': 'Playlist-Abfrage fehlgeschlagen: {detail}', 'en': 'Playlist request failed: {detail}'},
    'playlists_none': {'de': 'Noch keine Box-Playlists gefunden. Lege in Spotify eine Playlist an, deren Name mit dem Playlist-Präfix beginnt (siehe /syncstatus).', 'en': 'No box playlists found yet. Create a Spotify playlist whose name starts with the playlist prefix (see /syncstatus).'},
    'playlists_title': {'de': '<b>Verbundene Playlists</b>', 'en': '<b>Connected playlists</b>'},
    'playlist_items': {'de': '{n} Einträge', 'en': '{n} items'},
    'disconnect_q': {'de': '⚠️ Spotify-Verbindung wirklich trennen?\n\nSmart-Sync stoppt, und du musst Spotify neu verbinden.', 'en': '⚠️ Really disconnect Spotify?\n\nSmart-Sync stops and you have to connect Spotify again.'},
    'disconnect_yes': {'de': '✓ Ja, Spotify trennen', 'en': '✓ Yes, disconnect Spotify'},
    'disconnect_no': {'de': '✗ Abbrechen', 'en': '✗ Cancel'},
    'disconnect_done': {'de': 'Smart-Sync gestoppt. Die Spotify-Anmeldung löschst du in der MuPiBox-App.', 'en': 'Smart-Sync stopped. Remove the Spotify sign-in in the MuPiBox app.'},
    'cancelled': {'de': 'Abgebrochen.', 'en': 'Cancelled.'},

    # ── login links ─────────────────────────────────────────────────────────
    'login_heading': {'de': '🔑 <b>Eltern-Login</b>', 'en': '🔑 <b>Parent login</b>'},
    'login_button': {'de': 'MuPiBox-App öffnen', 'en': 'Open the MuPiBox app'},
    'connect_heading': {'de': '🎵 <b>Spotify verbinden</b>\n\nÖffne den Link: Die App zeigt die Spotify-Seite, dort auf „Neu anmelden“ tippen (im WLAN zu Hause).', 'en': '🎵 <b>Connect Spotify</b>\n\nOpen the link: the app shows its Spotify page, tap "Sign in again" there (on the home Wi-Fi).'},
    'magic_valid': {'de': 'Gültig {mins} min, nur einmal verwendbar.', 'en': 'Valid for {mins} min, single use.'},
    'magic_failed': {'de': 'Login-Link konnte nicht erzeugt werden: {detail}', 'en': 'Could not create the login link: {detail}'},

    # ── messages sent by the box (telegram_send_message.py) ────────────────
    'n_box_starting': {'de': 'MuPiBox startet', 'en': 'MuPiBox is starting'},
    'n_box_shutdown': {'de': 'MuPiBox wird ausgeschaltet', 'en': 'MuPiBox is shutting down'},
    'n_box_idle': {'de': 'MuPiBox war zu lange unbenutzt und wird ausgeschaltet', 'en': 'MuPiBox has been idle too long and is shutting down'},
    'n_box_shutdown_battery': {'de': '🪫 Der Akku ist leer – MuPiBox wird ausgeschaltet', 'en': '🪫 The battery is empty – MuPiBox is shutting down'},
    'n_battery_low': {'de': '🪫 Der MuPiBox-Akku ist fast leer ({soc}) – bitte bald laden', 'en': '🪫 The MuPiBox battery is almost empty ({soc}) – please charge it soon'},
    'n_telegram_enabled': {'de': 'Telegram eingeschaltet', 'en': 'Telegram enabled'},
    'n_telegram_disabled': {'de': 'Telegram ausgeschaltet', 'en': 'Telegram disabled'},
    'n_pause': {'de': 'Pause', 'en': 'Pause'},
    'n_stop': {'de': 'Stopp', 'en': 'Stop'},
    'n_continue': {'de': 'Wiedergabe geht weiter', 'en': 'Continue playing'},
    'n_start_spotify': {'de': 'Spotify-Wiedergabe gestartet', 'en': 'Start playing Spotify'},
    'n_start_local': {'de': 'Lokale Wiedergabe gestartet', 'en': 'Start playing local'},
    'n_start_stream': {'de': 'Stream gestartet', 'en': 'Start playing stream'},
    'n_playtime_used_up': {'de': 'Hörzeit für heute aufgebraucht', 'en': 'Listening time used up for today'},
    'n_quiet_started': {'de': 'Ruhezeit gestartet', 'en': 'Quiet time started'},
    'n_quiet_started_label': {'de': 'Ruhezeit gestartet: {label}', 'en': 'Quiet time started: {label}'},
    'n_battery': {'de': 'Der MuPiBox-Akku steht bei {soc}', 'en': 'The MuPiBox battery is at {soc}'},
    'n_test': {'de': '✅ MuPiBox: Testnachricht – der Bot ist richtig eingerichtet.', 'en': '✅ MuPiBox: test message – the bot is set up correctly.'},
    'n_battery_stale': {'de': '⚠️ Die MuPiBox liest den Akku seit {mins} Minuten nicht mehr aus – auch ein Neustart des MuPiHAT-Dienstes hat nicht geholfen.\n\nBitte die Box neu starten.', 'en': '⚠️ The MuPiBox has not read its battery for {mins} minutes – restarting the MuPiHAT service did not help either.\n\nPlease restart the box.'},
    'n_battery_not_charging': {'de': '🔌 Der MuPiBox-Akku lädt nicht ({soc}), obwohl das Netzteil steckt.\n\nBitte das Netzteil an der Box kurz abziehen und wieder anstecken.', 'en': '🔌 The MuPiBox battery is not charging ({soc}) although the power supply is plugged in.\n\nPlease unplug the power supply from the box for a moment and plug it in again.'},
    'n_spotify_login_expiring': {'de': '⏳ MuPiBox: Die Spotify-Anmeldung läuft in {days} Tagen ab (ca. {date}). Danach spielt die Box kein Spotify mehr.\n\nSpotify verlangt alle 6 Monate eine neue Anmeldung – dauert eine Minute:\n/spotify_connect', 'en': '⏳ MuPiBox: the Spotify sign-in expires in {days} days (about {date}). After that the box plays no Spotify.\n\nSpotify asks for a new sign-in every 6 months – it takes a minute:\n/spotify_connect'},
    'n_weekly_summary': {'de': '📊 MuPiBox – die Woche: {total} gehört, an {days} von 7 Tagen (im Schnitt {avg} am Tag).\n\nAm meisten:\n{top}', 'en': '📊 MuPiBox – the week: {total} of listening, on {days} of 7 days ({avg} a day on average).\n\nMost of all:\n{top}'},
    'n_weekly_summary_short': {'de': '📊 MuPiBox – die Woche: {total} gehört, an {days} von 7 Tagen (im Schnitt {avg} am Tag).', 'en': '📊 MuPiBox – the week: {total} of listening, on {days} of 7 days ({avg} a day on average).'},
    'n_weekly_summary_none': {'de': '📊 MuPiBox – die Woche: Diese Woche lief nichts auf der Box.', 'en': '📊 MuPiBox – the week: nothing played on the box this week.'},
    'n_tls_expiring': {'de': '🔐 MuPiBox: Das eigene Zertifikat der Box läuft in {days} Tagen ab ({date}). Danach warnt der Browser bei https://… – bitte in der App unter Einstellungen › Sicherheit ein neues hochladen (oder zurück zum Zertifikat der Box).', 'en': "🔐 MuPiBox: the box's own certificate runs out in {days} days ({date}). After that browsers warn at https://… – please upload a new one in the app at Settings › Security (or go back to the box's certificate)."},
    'n_spotify_login_unknown': {'de': 'ℹ️ MuPiBox: Spotify verlangt alle 6 Monate eine neue Anmeldung. Seit wann die Anmeldung der Box besteht, weiß sie nicht – bitte einmal neu anmelden, dann erinnert sie rechtzeitig vor dem Ablauf:\n/spotify_connect', 'en': 'ℹ️ MuPiBox: Spotify asks for a new sign-in every 6 months. The box does not know when its sign-in was made – please sign in again once, then it reminds you in time before it expires:\n/spotify_connect'},
    'n_spotify_login_refused': {'de': '⚠️ MuPiBox: Spotify hat die Anmeldung der Box abgelehnt (abgelaufen oder zurückgezogen) – die Box spielt gerade kein Spotify.\n\nBitte neu anmelden:\n/spotify_connect', 'en': '⚠️ MuPiBox: Spotify refused the box\'s sign-in (expired or withdrawn) – the box plays no Spotify right now.\n\nPlease sign in again:\n/spotify_connect'},
    'n_sync_auth_failed': {'de': '⚠️ MuPiBox Smart-Sync: Die Spotify-Anmeldung ist abgelaufen oder ungültig.\n\nBitte neu verbinden:\n/spotify_connect', 'en': '⚠️ MuPiBox Smart-Sync: the Spotify sign-in has expired or is invalid.\n\nPlease connect again:\n/spotify_connect'},
    'n_sync_failures_network': {'de': '⚠️ MuPiBox Smart-Sync: Netzwerkfehler – {count} fehlgeschlagene Versuche in Folge.\n\nDetails mit /syncstatus.', 'en': '⚠️ MuPiBox Smart-Sync: network error – {count} failed attempts in a row.\n\nDetails via /syncstatus.'},
    'n_sync_failures_internal': {'de': '⚠️ MuPiBox Smart-Sync: interner Fehler – {count} fehlgeschlagene Versuche in Folge.\n\nDetails mit /syncstatus.', 'en': '⚠️ MuPiBox Smart-Sync: internal error – {count} failed attempts in a row.\n\nDetails via /syncstatus.'},
    'n_sync_conflicts': {'de': 'ℹ️ MuPiBox Smart-Sync: {count} Konflikt(e) (manueller Eintrag und Sync-Playlist gleich).\n\nManuelle Einträge bleiben unangetastet. Details in der MuPiBox-App.', 'en': 'ℹ️ MuPiBox Smart-Sync: {count} conflict(s) (manual entry and sync playlist are the same).\n\nManual entries stay untouched. Details in the MuPiBox app.'},
    'n_sync_summary': {'de': '✅ MuPiBox Smart-Sync: +{adds} hinzugefügt, −{rems} entfernt.', 'en': '✅ MuPiBox Smart-Sync: +{adds} added, −{rems} removed.'},
}

# /command: the full list of text commands
TEXTS['commands'] = {
    'de': (
        '<b><u>Befehle:</u></b>\n\n'
        '<code><b>/help</b></code>\n<i>zeigt die Buttons</i>\n\n'
        '<code><b>/status</b></code>\n<i>Spielzeit und Ruhezeiten jetzt</i>\n\n'
        '<code><b>/extend</b> <i>[Minuten, Standard 30]</i></code>\n<i>Bonus-Minuten für heute</i>\n\n'
        '<code><b>/release</b> <i>[Minuten, Standard 60]</i></code>\n<i>alle Sperren für N Minuten aufheben</i>\n\n'
        '<code><b>/quietnow</b> <i>[Minuten, Standard 60]</i></code>\n<i>Wiedergabe für N Minuten sperren</i>\n\n'
        '<code><b>/limit set</b> <i>&lt;Tag&gt; &lt;Minuten&gt;</i></code>\n<i>Spielzeit-Limit für einen Wochentag (mon..sun, 0..1440)</i>\n\n'
        '<b>MuPiBox-App:</b>\n'
        '<code><b>/login</b></code> – Login-Link zur MuPiBox-App\n\n'
        '<b>Smart-Sync:</b>\n'
        '<code><b>/resync</b></code> – Spotify jetzt synchronisieren\n'
        '<code><b>/syncstatus</b></code> – letztes Sync-Ergebnis und Status\n'
        '<code><b>/playlists</b></code> – gefundene Box-Playlists\n'
        '<code><b>/spotify_connect</b></code> – Login-Link mit Spotify-Einrichtung\n'
        '<code><b>/spotify_disconnect</b></code> – Smart-Sync stoppen (mit Rückfrage)\n\n'
        '<b>System:</b>\n'
        '<code><b>/reboot</b></code>\n<code><b>/shutdown</b></code>\n<code><b>/screen</b></code>\n'
        '<code><b>/sleep</b> <i>[Minuten]</i></code>\n<code><b>/vol</b> <i>[0-100]</i></code>\n'
        '<code><b>/pause</b></code>\n<code><b>/play</b></code>\n<code><b>/media</b></code>\n<code><b>/finishalbum</b></code>'
    ),
    'en': (
        '<b><u>Possible commands:</u></b>\n\n'
        '<code><b>/help</b></code>\n<i>shows the buttons</i>\n\n'
        '<code><b>/status</b></code>\n<i>playtime and quiet hours right now</i>\n\n'
        '<code><b>/extend</b> <i>[minutes, default 30]</i></code>\n<i>bonus minutes for today</i>\n\n'
        '<code><b>/release</b> <i>[minutes, default 60]</i></code>\n<i>lift all blocks for N minutes</i>\n\n'
        '<code><b>/quietnow</b> <i>[minutes, default 60]</i></code>\n<i>block playback for N minutes</i>\n\n'
        '<code><b>/limit set</b> <i>&lt;day&gt; &lt;minutes&gt;</i></code>\n<i>playtime limit for one weekday (mon..sun, 0..1440)</i>\n\n'
        '<b>MuPiBox app:</b>\n'
        '<code><b>/login</b></code> – login link to the MuPiBox app\n\n'
        '<b>Smart-Sync:</b>\n'
        '<code><b>/resync</b></code> – sync Spotify now\n'
        '<code><b>/syncstatus</b></code> – last sync result and status\n'
        '<code><b>/playlists</b></code> – box playlists found\n'
        '<code><b>/spotify_connect</b></code> – login link with the Spotify setup\n'
        '<code><b>/spotify_disconnect</b></code> – stop Smart-Sync (asks first)\n\n'
        '<b>System:</b>\n'
        '<code><b>/reboot</b></code>\n<code><b>/shutdown</b></code>\n<code><b>/screen</b></code>\n'
        '<code><b>/sleep</b> <i>[minutes]</i></code>\n<code><b>/vol</b> <i>[0-100]</i></code>\n'
        '<code><b>/pause</b></code>\n<code><b>/play</b></code>\n<code><b>/media</b></code>\n<code><b>/finishalbum</b></code>'
    ),
}


def tr(key, **values):
    """The text for `key` in the bot's language; {name} placeholders are filled from `values`."""
    entry = TEXTS.get(key)
    if entry is None:
        return key
    text = entry.get(bot_language()) or entry['en']
    return text.format(**values) if values else text


# Fixed texts other scripts pass to telegram_send_message.py (shell scripts, the admin interface, the player).
# They are sent in the bot's language; any other text goes out as it is.
KNOWN_MESSAGES = {
    'MuPiBox is starting': 'n_box_starting',
    'MuPiBox shutdown': 'n_box_shutdown',
    'MuPiBox is to long idle': 'n_box_idle',
    'Telegram enabled': 'n_telegram_enabled',
    'Telegram disabled': 'n_telegram_disabled',
    'Pause': 'n_pause',
    'Stop': 'n_stop',
    'Continue playing': 'n_continue',
    'Start playing spotify': 'n_start_spotify',
    'Start playing local': 'n_start_local',
    'Start playing stream': 'n_start_stream',
    'Hörzeit aufgebraucht heute': 'n_playtime_used_up',
    'Ruhezeit gestartet': 'n_quiet_started',
}


def translate_message(text):
    key = KNOWN_MESSAGES.get(text.strip())
    return tr(key) if key else text
