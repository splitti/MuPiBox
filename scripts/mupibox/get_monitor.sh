#!/bin/bash
#
# Get monitor blank information to block inputs if the screen is blank - and switch the backlight off with it.
#
# The screen goes dark through the X server's power saving (DPMS, BlankTime from timeout.idleDisplayOff, or
# /api/screen/off while something plays). On a display the firmware drives (the official 7" touch display without
# KMS) that only blanks the picture: its backlight stayed on, all night - and vcgencmd display_power kept saying "on",
# so the first tap was not swallowed either. So this asks the X server every second: is the monitor off, the
# backlight goes off (bl_power 4), does a tap wake it, the backlight comes back - and only when it was this script
# that switched it off. Stopped (shutdown, restart), the backlight comes back too.

MONITOR_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/monitor.json"
minimumsize=18

# M7: track the last persisted state in-process so we only write monitor.json
# when the polled state actually changed. Previously the script did a full
# jq + mv cycle every second regardless -- ~86k file rewrites/day, all of
# them identical content. Skip-if-unchanged drops that to a handful per day.
LAST_STATE=""

# Runs as root (mupi_check_monitor.service); sudo only when started otherwise - from root it only wrote a journal entry
# per call.
as_root() {
        if [ "$(id -u)" = 0 ]; then
                "$@"
        else
                sudo "$@"
        fi
}

BACKLIGHT=$(ls -d /sys/class/backlight/* 2>/dev/null | head -n 1)
BL_OURS=0
# off at the start: left so by this script before (killed, crashed) - nothing else in the box switches it off; taken
# over, so it comes back with the monitor
[ -n "${BACKLIGHT}" ] && [ "$(cat "${BACKLIGHT}/bl_power" 2>/dev/null)" = "4" ] && BL_OURS=1

set_backlight() {
        [ -n "${BACKLIGHT}" ] || return
        echo "$1" | as_root tee "${BACKLIGHT}/bl_power" >/dev/null 2>&1
}

# the backlight back on when this script switched it off and ends
restore_backlight() {
        [ "${BL_OURS}" = 1 ] && set_backlight 0
        exit 0
}
trap restore_backlight TERM INT HUP

# "On", "Off" (also standby and suspend) or "" (no X server, or no DPMS)
x_monitor() {
        local line
        line=$(DISPLAY=:0 XAUTHORITY=/home/dietpi/.Xauthority timeout 3 xset q 2>/dev/null | grep -m 1 'Monitor is')
        case "${line}" in
                *"Monitor is On"*) echo "On" ;;
                *"Monitor is "*) echo "Off" ;;
        esac
}

write_state() {
        local NEW_STATE="$1"
        if [ "${NEW_STATE}" = "${LAST_STATE}" ]; then
                return
        fi
        local _TMP="${MONITOR_FILE}.tmp.$$"
        if [ -f "${MONITOR_FILE}" ]; then
                /usr/bin/jq --arg v "${NEW_STATE}" '.monitor = $v' "${MONITOR_FILE}" > "${_TMP}" \
                        && mv "${_TMP}" "${MONITOR_FILE}" \
                        || rm -f "${_TMP}"
        else
                /usr/bin/jq -n --arg v "${NEW_STATE}" '.monitor = $v' > "${_TMP}" \
                        && mv "${_TMP}" "${MONITOR_FILE}" \
                        || rm -f "${_TMP}"
        fi
        LAST_STATE="${NEW_STATE}"
}

seed_file() {
        rm -f "${MONITOR_FILE}"
        echo -n "{}" > "${MONITOR_FILE}"
        LAST_STATE=""  # force write_state to write the next polled value
}

TICK=0
MONITOR=""
while true
do
        X_STATE=$(x_monitor)
        POWER=-1
        [ -n "${BACKLIGHT}" ] && POWER=$(cat "${BACKLIGHT}/bl_power" 2>/dev/null || echo -1)

        # the backlight follows the X server's monitor; no X server (a kiosk restart, the shutdown picture): back on.
        # (POWER and MONITOR - the firmware follows the backlight - are what was written: the panel reports a new value only
        # a moment later, the firmware is asked only every 5 s)
        if [ -n "${BACKLIGHT}" ]; then
                if [ "${X_STATE}" = "Off" ] && [ "${BL_OURS}" = 0 ] && [ "${POWER}" = "0" ]; then
                        set_backlight 4 && BL_OURS=1 && POWER=4 && MONITOR=0
                elif [ "${X_STATE}" != "Off" ] && [ "${BL_OURS}" = 1 ]; then
                        set_backlight 0
                        BL_OURS=0
                        POWER=0
                        MONITOR=1
                fi
        fi

        actualsize=$(wc -c <"${MONITOR_FILE}" 2>/dev/null || echo 0)

        if [ ! -f "${MONITOR_FILE}" ]; then
                seed_file
                write_state "On"
        elif [ "$actualsize" -le "$minimumsize" ]; then
                seed_file
                write_state "On"
        else
                # the firmware's display power every 5 s (a display that is switched off another way)
                if [ $((TICK % 5)) = 0 ]; then
                        MONITOR=$(as_root vcgencmd display_power 2>/dev/null)
                        MONITOR=(${MONITOR##*=})
                fi
                if [ "${X_STATE}" = "Off" ] || [ "${MONITOR}" = "0" ] || [ "${POWER}" = "4" ]; then
                        write_state "Off"
                elif [ "${X_STATE}" = "On" ] || [ "${MONITOR}" = "1" ] || [ "${POWER}" = "0" ]; then
                        write_state "On"
                fi
        fi

        TICK=$((TICK + 1))
        sleep 1 &
        wait $!
done
