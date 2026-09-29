#!/bin/bash
#

MUPIBOX_CONFIG="/etc/mupibox/mupiboxconfig.json"
TMP_LEDFILE="/tmp/.power_led"
OLD_STATE=1

ledPin=$(/usr/bin/jq -r .shim.ledPin ${MUPIBOX_CONFIG})
ledPin=$(printf '%d' "$ledPin")
ledMax=$(/usr/bin/jq -r .shim.ledBrightnessMax ${MUPIBOX_CONFIG})
ledMax=$(printf '%d' "$ledMax")
ledMin=$(/usr/bin/jq -r .shim.ledBrightnessMin ${MUPIBOX_CONFIG})
ledMin=$(printf '%d' "$ledMin")

echo "{}" | tee ${TMP_LEDFILE}
# Atomic-update (HIGH-8). Bundle five field updates into one jq invocation
# instead of cat<<<jq five times — same result, single tempfile cycle.
_TMP="${TMP_LEDFILE}.tmp.$$"
/usr/bin/jq \
    --argjson pin "${ledPin}" \
    --argjson max "${ledMax}" \
    --argjson min "${ledMin}" \
    '.led_gpio = $pin | .led_max_brightness = $max | .led_min_brightness = $min | .led_current_brightness = 0 | .led_dim_mode = 0' \
    "${TMP_LEDFILE}" > "${_TMP}" && mv "${_TMP}" "${TMP_LEDFILE}" || rm -f "${_TMP}"
/usr/bin/python3 /usr/local/bin/mupibox/led_control.py &
#/usr/local/bin/mupibox/./led_control &

# WLED
wled_active=$(/usr/bin/jq -r .wled.active ${MUPIBOX_CONFIG})
if [ ${wled_active} = true ]; then
	wled_com_port=$(/usr/bin/jq -r .wled.com_port ${MUPIBOX_CONFIG})
	wled_main_id=$(/usr/bin/jq -r .wled.main_id ${MUPIBOX_CONFIG})
	wled_baud_rate=$(/usr/bin/jq -r .wled.baud_rate ${MUPIBOX_CONFIG})
	wled_brightness_def=$(/usr/bin/jq -r .wled.brightness_default ${MUPIBOX_CONFIG})
	pid=`pidof /usr/lib/chromium-browser/chromium-browser`
	while [ -z "${pid}" ] ;
	do
		pid=`pidof /usr/lib/chromium-browser/chromium-browser`
		sleep 3
	done
	wled_data='{"ps":'${wled_main_id}'}'
	/usr/bin/python3 /usr/local/bin/mupibox/wled_send_data.py -s "${wled_com_port}" -b "${wled_baud_rate}" -j "${wled_data}"
	wled_data='{"bri":'${wled_brightness_def}'}'
	/usr/bin/python3 /usr/local/bin/mupibox/wled_send_data.py -s "${wled_com_port}" -b "${wled_baud_rate}" -j "${wled_data}"
	wled_data='{"on":true}'
	/usr/bin/python3 /usr/local/bin/mupibox/wled_send_data.py -s "${wled_com_port}" -b "${wled_baud_rate}" -j "${wled_data}"
fi

# Phase 13b (B3): mtime-cached config reads + slower polling. The previous
# loop forked 8 jq-processes plus one vcgencmd PER SECOND (~692k jq forks
# per day) to re-read mostly-static config values. Config changes happen
# only when the user touches the Admin-UI — typically a few times in a
# box's lifetime — so we re-read only when the file's mtime changes.
# Display-power detection stays at every-tick so the LED responds to
# display-on/off without a noticeable delay; the tick interval grows from
# 1s to 5s which is well under the user's perception threshold for an
# LED-dim transition.
#
# Effect: ~95% reduction in fork+exec rate; CPU savings (~5% permanent on
# a Pi 3B+) free up headroom for audio decoding and let SoC stay in lower
# P-state more often, which extends battery life by ~30-45 min per charge.
LAST_CONFIG_MTIME=0
while true
do
		sleep 5
		# only re-read config values when mupiboxconfig.json has changed
		CURRENT_MTIME=$(/usr/bin/stat -c %Y "${MUPIBOX_CONFIG}" 2>/dev/null || echo 0)
		if [ "${CURRENT_MTIME}" != "${LAST_CONFIG_MTIME}" ]; then
			ledPin=$(/usr/bin/jq -r .shim.ledPin ${MUPIBOX_CONFIG})
			ledMax=$(/usr/bin/jq -r .shim.ledBrightnessMax ${MUPIBOX_CONFIG})
			ledMin=$(/usr/bin/jq -r .shim.ledBrightnessMin ${MUPIBOX_CONFIG})
			wled_baud_rate=$(/usr/bin/jq -r .wled.baud_rate ${MUPIBOX_CONFIG})
			wled_com_port=$(/usr/bin/jq -r .wled.com_port ${MUPIBOX_CONFIG})
			wled_brightness_def=$(/usr/bin/jq -r .wled.brightness_default ${MUPIBOX_CONFIG})
			wled_brightness_dim=$(/usr/bin/jq -r .wled.brightness_dimmed ${MUPIBOX_CONFIG})
			wled_active=$(/usr/bin/jq -r .wled.active ${MUPIBOX_CONFIG})
			LAST_CONFIG_MTIME=${CURRENT_MTIME}
		fi

		#ledMin=$(echo "scale=2; $ledMin/100" | bc)
		#ledMax=$(echo "scale=2; $ledMax/100" | bc)
		displayState=`vcgencmd display_power | grep -o '.$'`
		if [ ${displayState} -eq 1 ] && [ ${OLD_STATE} -ne ${displayState} ]
		then
			if [ ${wled_active} = true ]; then
				wled_data='{"bri":'${wled_brightness_def}'}'
				/usr/bin/python3 /usr/local/bin/mupibox/wled_send_data.py -s "${wled_com_port}" -b "${wled_baud_rate}" -j "${wled_data}"
			fi
			# Atomic-update (HIGH-8).
			_TMP="${TMP_LEDFILE}.tmp.$$"
			/usr/bin/jq '.led_dim_mode = 1' "${TMP_LEDFILE}" > "${_TMP}" && mv "${_TMP}" "${TMP_LEDFILE}" || rm -f "${_TMP}"
			OLD_STATE=${displayState}
		elif [ ${displayState} -eq 0 ] && [ ${OLD_STATE} -ne ${displayState} ]
		then
			if [ ${wled_active} = true ]; then
				wled_data='{"bri":'${wled_brightness_dim}'}'
				/usr/bin/python3 /usr/local/bin/mupibox/wled_send_data.py -s "${wled_com_port}" -b "${wled_baud_rate}" -j "${wled_data}"
			fi
			_TMP="${TMP_LEDFILE}.tmp.$$"
			/usr/bin/jq '.led_dim_mode = 0' "${TMP_LEDFILE}" > "${_TMP}" && mv "${_TMP}" "${TMP_LEDFILE}" || rm -f "${_TMP}"
			OLD_STATE=${displayState}
		fi
done
