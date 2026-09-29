#!/bin/bash
#
# Get monitor blank information to block inputs if the screen is blank.

MONITOR_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/monitor.json"
minimumsize=18

# M7: track the last persisted state in-process so we only write monitor.json
# when the polled state actually changed. Previously the script did a full
# jq + mv cycle every second regardless -- ~86k file rewrites/day, all of
# them identical content. Skip-if-unchanged drops that to a handful per day.
# Plus the polling cadence went from 1s to 5s -- the kid never notices a
# 4-second delay before the touch is re-enabled after the screen blanks.
LAST_STATE=""

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
        # HIGH-14 (Phase-3) + Phase-5 follow-up: drop the sudo --
        # MONITOR_FILE lives under /home/dietpi/.../config/ and the
        # script runs as dietpi, so direct write works.
        rm -f "${MONITOR_FILE}"
        echo -n "{}" > "${MONITOR_FILE}"
        LAST_STATE=""  # force write_state to write the next polled value
}

while true
do

        actualsize=$(wc -c <"${MONITOR_FILE}" 2>/dev/null || echo 0)

        if [ ! -f "${MONITOR_FILE}" ]; then
                seed_file
                write_state "On"
        elif [ "$actualsize" -le "$minimumsize" ]; then
                seed_file
                write_state "On"
        else
                MONITOR=$(sudo -H -u root bash -c "vcgencmd display_power")
                MONITOR=(${MONITOR##*=})
                POWER=-1
                if [ "${MONITOR}" = "-1" ]; then
                  POWER=$(cat /sys/class/backlight/*/bl_power 2>/dev/null || echo -1)
                fi

                if [ "${MONITOR}" = "0" ] || [ "${POWER}" = "4" ]; then
                        write_state "Off"
                elif [ "${MONITOR}" = "1" ] || [ "${POWER}" = "0" ]; then
                        write_state "On"
                fi
        fi

        sleep 5
done
