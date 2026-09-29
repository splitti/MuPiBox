#!/bin/bash
#
# Shuts down the MupiBox after finishing the album

ALBUMSTOP_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/albumstop.json"


# Atomic-update pattern (HIGH-8): write jq output to a same-dir tempfile,
# then mv it onto the target. The previous `cat <<< $(jq …) > FILE`
# truncated FILE before jq finished — jq errors or partial output left
# the JSON empty and bricked the next boot. With write-then-rename, jq
# either succeeds and the rename atomically swaps in the new content, or
# it fails and the original file stays intact (we rm the half-written
# tempfile so /tmp doesn't fill up).
if [ ! -f ${ALBUMSTOP_FILE} ]; then
        # HIGH-14 (Phase-3) + Phase-5 follow-up: ALBUMSTOP_FILE lives
        # under /home/dietpi/.../config/ which is dietpi-writable; drop
        # the sudo+tee that produced a root-owned file the script
        # couldn't subsequently replace.
        echo -n "{}" > "${ALBUMSTOP_FILE}"
        _TMP="${ALBUMSTOP_FILE}.tmp.$$"
        /usr/bin/jq -n --arg v "Off" '.albumStop = $v' > "${_TMP}" && mv "${_TMP}" "${ALBUMSTOP_FILE}" || rm -f "${_TMP}"
        sleep 10
        sudo bash /usr/local/bin/mupibox/shutdown.sh
else
        _TMP="${ALBUMSTOP_FILE}.tmp.$$"
        /usr/bin/jq --arg v "Off" '.albumStop = $v' "${ALBUMSTOP_FILE}" > "${_TMP}" && mv "${_TMP}" "${ALBUMSTOP_FILE}" || rm -f "${_TMP}"
        sleep 10
        sudo bash /usr/local/bin/mupibox/shutdown.sh
fi