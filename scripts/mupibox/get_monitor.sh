#!/bin/bash
#
# Get monitor blank information to block inputs if the screen is blank.

MONITOR_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/monitor.json"
minimumsize=18

while true
do

        actualsize=$(wc -c <"${MONITOR_FILE}")

        if [ ! -f ${MONITOR_FILE} ]; then
                # HIGH-14 (Phase-3) + Phase-5 follow-up: drop the sudo —
                # MONITOR_FILE lives under /home/dietpi/.../config/ and the
                # script runs as dietpi, so direct write works. Sudo+tee
                # produced a root-owned file that subsequent jq+mv (as
                # dietpi) couldn't replace, leaving the seed broken. Same
                # fix as check_network / get_network.
                rm -f "${MONITOR_FILE}"
                echo -n "{}" > "${MONITOR_FILE}"
                # Atomic-update (HIGH-8).
                _TMP="${MONITOR_FILE}.tmp.$$"
                /usr/bin/jq -n --arg v "On" '.monitor = $v' > "${_TMP}" && mv "${_TMP}" "${MONITOR_FILE}" || rm -f "${_TMP}"
        elif [ $actualsize -le $minimumsize ]; then
                rm -f "${MONITOR_FILE}"
                echo -n "{}" > "${MONITOR_FILE}"
                _TMP="${MONITOR_FILE}.tmp.$$"
                /usr/bin/jq -n --arg v "On" '.monitor = $v' > "${_TMP}" && mv "${_TMP}" "${MONITOR_FILE}" || rm -f "${_TMP}"
        else
                MONITOR=$(sudo -H -u root bash -c "vcgencmd display_power")
                MONITOR=(${MONITOR##*=})
                POWER=-1
                if [ ${MONITOR} == "-1" ]; then
                  POWER=$(cat /sys/class/backlight/*/bl_power)
                fi

                if [ ${MONITOR} == "0" ] || [ ${POWER} == "4" ]; then
                        _TMP="${MONITOR_FILE}.tmp.$$"
                        /usr/bin/jq --arg v "Off" '.monitor = $v' "${MONITOR_FILE}" > "${_TMP}" && mv "${_TMP}" "${MONITOR_FILE}" || rm -f "${_TMP}"
                elif [ ${MONITOR} == "1" ] || [ ${POWER} == "0" ]; then
                        _TMP="${MONITOR_FILE}.tmp.$$"
                        /usr/bin/jq --arg v "On" '.monitor = $v' "${MONITOR_FILE}" > "${_TMP}" && mv "${_TMP}" "${MONITOR_FILE}" || rm -f "${_TMP}"
                fi
        fi

	sleep 1
done
