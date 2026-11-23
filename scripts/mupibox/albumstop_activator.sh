#!/bin/bash
#
# Activates the shutdown after the end of the current album.

. /usr/local/bin/mupibox/mupi_paths.sh

ALBUMSTOP_FILE="${MUPI_LIBRARY}/albumstop.json"

# Atomic-update pattern (HIGH-8): same as albumstop.sh.
if [ ! -f ${ALBUMSTOP_FILE} ]; then
        # HIGH-14 (Phase-3) + Phase-5 follow-up: same as albumstop.sh —
        # drop sudo, dietpi can write the destination directly.
        echo -n "{}" > "${ALBUMSTOP_FILE}"
        _TMP="${ALBUMSTOP_FILE}.tmp.$$"
        /usr/bin/jq -n --arg v "On" '.albumStop = $v' > "${_TMP}" && mv "${_TMP}" "${ALBUMSTOP_FILE}" || rm -f "${_TMP}"
else
        _TMP="${ALBUMSTOP_FILE}.tmp.$$"
        /usr/bin/jq --arg v "On" '.albumStop = $v' "${ALBUMSTOP_FILE}" > "${_TMP}" && mv "${_TMP}" "${ALBUMSTOP_FILE}" || rm -f "${_TMP}"
fi