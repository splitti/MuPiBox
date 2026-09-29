#!/bin/bash
#
# Numbers the entries of the library: "index" 0, 1, … (the resume list and the display address an entry by it).

DATA="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json"
DATA_LOCK="/tmp/.data.lock"

if [ "$EUID" -ne 0 ]
  then echo "Please run as root"
  exit
fi

# Taken in one step (noclobber: O_EXCL, as the backend and m3u_generator.sh take it)
if ! ( set -C; : > "${DATA_LOCK}" ) 2>/dev/null; then
	echo "Data-file locked."
	exit
fi
# (a crash, a SIGTERM or a full card must not leave the lock behind)
trap 'rm -f "${DATA_LOCK}" "${TMP_DATA}"' EXIT INT TERM HUP

# With jq. Before, every line with "index" was dropped and one put after every "{": an index that was the last key
# of an entry left a comma before its "}", and nested objects got one too - the JSON broke, and the library was
# replaced by an empty file (29.09.2026). Now it is written next to the library and put in its place only when it
# is a list again with as many entries as before.
TMP_DATA="${DATA}.index.$$"
COUNT=$(/usr/bin/jq 'if type == "array" then length else error("not a list") end' "${DATA}" 2>/dev/null) || {
	echo "data.json is no list, nothing numbered"
	exit 1
}
if /usr/bin/jq 'to_entries | map(if (.value | type) == "object" then {index: .key} + (.value | del(.index)) else .value end)' "${DATA}" > "${TMP_DATA}" \
	&& [ "$(/usr/bin/jq 'if type == "array" then length else -1 end' "${TMP_DATA}" 2>/dev/null)" = "${COUNT}" ]; then
	/usr/bin/chown dietpi:dietpi "${TMP_DATA}"
	/usr/bin/chmod 644 "${TMP_DATA}"
	/usr/bin/mv -f "${TMP_DATA}" "${DATA}"
	echo "Index is finished"
else
	echo "Index not written: the result was no complete list"
	exit 1
fi
