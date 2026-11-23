#!/bin/sh
#
# Tells the OLED display extension that the box updates ($1 = update) or goes down ($1 = shutdown), and draws that picture
# itself when the extension's driver is not running (it stops with the server, which an update and the shutdown end).
# Called by maintenance_screen.sh (update, again with every step) and show_goodbye.sh (the first thing of a shutdown).
#
# 1. The state goes into /run/mupibox-oled-picture ("update <epoch>"): the extension's driver, while it runs, shows the
#    picture by itself. It reads the file all the time, and a state older than 15 minutes counts for nothing (an update
#    that was cut short).
# 2. With no driver running, the picture is drawn once with "oled.py --show" and stays on the display. For one update (or
#    shutdown) once - the next step finds it drawn.
# Nothing happens without the extension (installed and switched on). Never makes the caller wait: ends in 20 seconds.

SLOT="$1"
case "${SLOT}" in update | shutdown) ;; *) exit 0 ;; esac

BASE=/home/dietpi/.mupibox/data/extensions
EXT="${BASE}/oled"
HOLD=/run/mupibox-oled-picture
DRAWN=/run/mupibox-oled-drawn

[ -f "${EXT}/oled.py" ] || exit 0
[ "$(/usr/bin/jq -r '.oled.enabled // false' "${BASE}/state.json" 2>/dev/null)" = "true" ] || exit 0

NOW=$(date +%s)
read -r BEFORE_SLOT BEFORE_AT <"${HOLD}" 2>/dev/null
# (another update, or the shutdown after an update: nothing is drawn yet)
case "${BEFORE_AT}" in '' | *[!0-9]*) BEFORE_AT=0 ;; esac
if [ "${BEFORE_SLOT}" != "${SLOT}" ] || [ $((NOW - BEFORE_AT)) -gt 120 ]; then
	rm -f "${DRAWN}" 2>/dev/null
fi
# (the file is the extension's too: it clears an old state when it starts, and it runs as another user)
[ -e "${HOLD}" ] || { : >"${HOLD}" 2>/dev/null && chmod 666 "${HOLD}" 2>/dev/null; }
echo "${SLOT} ${NOW}" >"${HOLD}" 2>/dev/null

# the driver runs: it shows the picture by itself
pgrep -f 'oled.py --controller' >/dev/null 2>&1 && exit 0
# drawn already for this update
[ "$(cat "${DRAWN}" 2>/dev/null)" = "${SLOT}" ] && exit 0

/usr/bin/timeout 20 /usr/bin/python3 "${EXT}/oled.py" --show "${SLOT}" --settings "${BASE}/settings/oled.json" \
	--images "${EXT}/images" --custom "${BASE}/data/oled/images" >/dev/null 2>&1 \
	&& echo "${SLOT}" >"${DRAWN}" 2>/dev/null
exit 0
