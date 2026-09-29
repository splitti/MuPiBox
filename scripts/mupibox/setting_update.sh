#!/bin/bash
#
# Service: Update Mupibox Settings
# Will be done before Shutdown, or by the Setup

MUPIBOX_CONFIG="/etc/mupibox/mupiboxconfig.json"
SONOS_CONFIG="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/config.json"
NETWORK_CONFIG="/tmp/network.json"
SPOTIFYCONTROLLER_CONFIG="/home/dietpi/.mupibox/spotifycontroller-main/config/config.json"
SPOTIFYD_CONFIG="/etc/spotifyd/spotifyd.conf"
DISPLAY_STANDBY="/etc/X11/xorg.conf.d/98-dietpi-disable_dpms.conf"
THEME_FILE="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/active_theme.css"
NEW_THEME=$(/usr/bin/jq -r .mupibox.theme ${MUPIBOX_CONFIG})

# B4: NEW_THEME comes from mupiboxconfig.json — admin-controlled.
# `ls -l ${THEME_FILE} | grep ${NEW_THEME}` was unquoted, so a theme
# name with a space (or a `/`) would either truncate or pull in
# unrelated grep flags. Quote both args, plus -F so theme names with
# regex metachars (`.`, `*`) match literally.
newTheme=$(ls -l "${THEME_FILE}" | grep -F -- "${NEW_THEME}")
if (( ${#newTheme} == 0 ))
then
 # Same quoting fix on the symlink replace.
 rm -f "${THEME_FILE}"
 ln -s "/home/dietpi/MuPiBox/themes/${NEW_THEME}.css" "${THEME_FILE}"
fi

# Atomic-update (HIGH-8). Read all source values first, then bundle the
# writes into one jq invocation per target file. Each cat<<< pattern was
# its own truncate-race window; collapsing to one pipeline per file means
# 16+ tempfile cycles → 2 cycles, plus far less SD wear.
deviceId=$(/usr/bin/jq -r .spotify.deviceId ${MUPIBOX_CONFIG})
clientId=$(/usr/bin/jq -r .spotify.clientId ${MUPIBOX_CONFIG})
clientSecret=$(/usr/bin/jq -r .spotify.clientSecret ${MUPIBOX_CONFIG})
accessToken=$(/usr/bin/jq -r .spotify.accessToken ${MUPIBOX_CONFIG})
refreshToken=$(/usr/bin/jq -r .spotify.refreshToken ${MUPIBOX_CONFIG})
ttsLanguage=$(/usr/bin/jq -r .mupibox.ttsLanguage ${MUPIBOX_CONFIG})
hostname=$(/usr/bin/jq -r .mupibox.host ${MUPIBOX_CONFIG})
hat_active=$(/usr/bin/jq -r .mupihat.hat_active ${MUPIBOX_CONFIG})
ip_control_backend=$(/usr/bin/jq -r .mupibox.ip_control_backend ${MUPIBOX_CONFIG})

# Resolve the IP once so the SONOS_CONFIG update can be a single pipeline
# regardless of ip_control_backend. Default to "" (= same as the
# old false-branch behaviour).
SONOS_IP=""
if [ "$ip_control_backend" = true ] ; then
        SONOS_IP=$(hostname -I | sed 's/ *$//')
        if [ -z "$SONOS_IP" ] ; then
                SONOS_IP=$(/usr/bin/jq -r .ip ${NETWORK_CONFIG})
        fi
fi

# One atomic update for SONOS_CONFIG (was 6 cat<<<jq calls).
_TMP="${SONOS_CONFIG}.tmp.$$"
/usr/bin/jq \
    --arg dev "${deviceId}" \
    --arg cli "${clientId}" \
    --arg sec "${clientSecret}" \
    --arg host "${hostname}" \
    --argjson hat "${hat_active}" \
    --arg ip "${SONOS_IP}" \
    '.["node-sonos-http-api"].rooms = [$dev]
     | .spotify.clientId = $cli
     | .spotify.clientSecret = $sec
     | .["node-sonos-http-api"].server = $host
     | .["node-sonos-http-api"].hat_active = $hat
     | .["node-sonos-http-api"].ip = $ip
     | .["node-sonos-http-api"].port = "5005"' \
    "${SONOS_CONFIG}" > "${_TMP}" && mv "${_TMP}" "${SONOS_CONFIG}" || rm -f "${_TMP}"

# One atomic update for SPOTIFYCONTROLLER_CONFIG (was 6 cat<<<jq calls).
_TMP="${SPOTIFYCONTROLLER_CONFIG}.tmp.$$"
/usr/bin/jq \
    --arg dev "${deviceId}" \
    --arg cli "${clientId}" \
    --arg sec "${clientSecret}" \
    --arg acc "${accessToken}" \
    --arg ref "${refreshToken}" \
    --arg tts "${ttsLanguage}" \
    '.spotify.deviceId = $dev
     | .spotify.clientId = $cli
     | .spotify.clientSecret = $sec
     | .spotify.accessToken = $acc
     | .spotify.refreshToken = $ref
     | .ttsLanguage = $tts' \
    "${SPOTIFYCONTROLLER_CONFIG}" > "${_TMP}" && mv "${_TMP}" "${SPOTIFYCONTROLLER_CONFIG}" || rm -f "${_TMP}"

#cachepath=$(/usr/bin/jq -r .spotify.cachepath ${MUPIBOX_CONFIG})
#/usr/bin/sed -i 's@.*cache_path.*@  cache_path = "'${cachepath}'"@g' ${SPOTIFYD_CONFIG}
#maxcachesize=$(/usr/bin/jq -r .spotify.maxcachesize ${MUPIBOX_CONFIG})
#/usr/bin/sed -i 's/.*cache_size.*/  cache_size = '$((maxcachesize*1024*1024*1024))'/g' ${SPOTIFYD_CONFIG}
#cachestate=$(/usr/bin/jq -r .spotify.cachestate ${MUPIBOX_CONFIG})
##/usr/bin/sed -i 's/.*no_audio_cache.*/  no_audio_cache = '${cachestate}'/g' ${SPOTIFYD_CONFIG}
#if $cachestate ; then
#        /usr/bin/sed -i 's/.*no_audio_cache.*/  no_audio_cache = false/g' ${SPOTIFYD_CONFIG}
#else
#        /usr/bin/sed -i 's/.*no_audio_cache.*/  no_audio_cache = true/g' ${SPOTIFYD_CONFIG}
#fi

#username=$(/usr/bin/jq -r .spotify.username ${MUPIBOX_CONFIG})
#/usr/bin/sed -i 's/.*username.*/  username = '\"${username}\"'/g' ${SPOTIFYD_CONFIG}
#password=$(/usr/bin/jq -r .spotify.password ${MUPIBOX_CONFIG})
#/usr/bin/sed -i 's/.*password.*/  password = '\"${password}\"'/g' ${SPOTIFYD_CONFIG}
# B4: hostname/timeout get spliced into a sed `s/`-delimited pattern.
# `/` is the default sed delimiter; if either value contained `/`
# (legitimate for hostnames with FQDN dots — also legal in some user-
# typed values), sed would interpret it as a delimiter and produce a
# garbled config. Switch to `|` as the sed delimiter (extremely
# unlikely to appear in a hostname or numeric timeout) and validate
# the timeout numerically before splicing — sed-injection via a
# numeric field would only happen if the config layer was already
# compromised, but defence in depth.
hostname=$(/usr/bin/jq -r .mupibox.host ${MUPIBOX_CONFIG})
# Strip anything that isn't a hostname char to be belt-and-braces;
# RFC1123 hostnames are letters, digits, `.`, `-` only.
hostname_safe=$(printf '%s' "${hostname}" | tr -dc 'A-Za-z0-9.-')
/usr/bin/sed -i 's|.*device_name.*|  device_name = "'"${hostname_safe}"'"|g' ${SPOTIFYD_CONFIG}

timeout=$(/usr/bin/jq -r .timeout.idleDisplayOff ${MUPIBOX_CONFIG})
# Force-numeric — empty or non-int collapses to 0 (sane "no timeout"
# default for the X server's BlankTime).
timeout_int=$(printf '%s' "${timeout}" | tr -dc '0-9')
: "${timeout_int:=0}"
/usr/bin/sed -i 's|.*Option "BlankTime".*|    Option "BlankTime" "'"${timeout_int}"'"|g' ${DISPLAY_STANDBY}

#currentIP=$(hostname -I)
#/usr/bin/cat <<< $(/usr/bin/jq --arg v "${currentIP}" '.ip = $v' ${SONOS_NETWORK}) >  ${SONOS_NETWORK}
#currentHost=$(hostname)
#/usr/bin/cat <<< $(/usr/bin/jq --arg v "${currentHost}" '.host = $v' ${SONOS_NETWORK}) >  ${SONOS_NETWORK}

echo "Setting Update finished"
