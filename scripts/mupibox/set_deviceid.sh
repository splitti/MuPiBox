#!/bin/bash
#
# HOSTNAME

CONFIG="/etc/mupibox/mupiboxconfig.json"
HOSTNAME=$(sudo /usr/bin/jq -r .mupibox.host ${CONFIG})
DEVICES=$(curl http://${HOSTNAME}:5005/getDevices 2>/dev/null)
devID=$(echo ${DEVICES} | jq '.[] | select(.name=='\"${HOSTNAME}\"')' | jq '.id')
devID=$(echo ${devID} | sed 's/\"//g')
# HIGH-9: previous `[ ${#devID} > 5 ]` was a string-test of `${#devID}`
# (always non-empty so always true) plus a stray `>` redirect that
# silently created a file named `5`. Use the numeric test `-gt`.
if [ "${#devID}" -gt 5 ];
then
        # HIGH-8 + HIGH-10: previous `sudo /usr/bin/cat <<< $(jq …) > ${CONFIG}`
        # had two bugs at once. (a) the `>` redirect runs as the calling user
        # not as root, so writing to root-owned ${CONFIG} would EACCES at the
        # redirect step, leaving CONFIG unchanged but the script silently
        # "succeeding". (b) the cat<<< would truncate ${CONFIG} on jq error.
        # New approach: stage the new content in /tmp (always writable for
        # dietpi), then `sudo install` it onto ${CONFIG} preserving owner +
        # mode in one atomic syscall. Same pattern as admin.php's
        # write_json() and jsoneditor.php's atomic save.
        _TMP="/tmp/.deviceid.$$.json"
        if /usr/bin/jq --arg v "${devID}" '.spotify.deviceId = $v' "${CONFIG}" > "${_TMP}"; then
                sudo install -m 644 -o root -g www-data "${_TMP}" "${CONFIG}"
        fi
        rm -f "${_TMP}"

fi
sudo /usr/local/bin/mupibox/./setting_update.sh
sudo /usr/local/bin/mupibox/./spotify_restart.sh
