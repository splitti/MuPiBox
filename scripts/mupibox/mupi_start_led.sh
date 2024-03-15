#!/bin/bash
#

MUPIBOX_CONFIG="/etc/mupibox/mupiboxconfig.json"
TMP_LEDFILE="/tmp/.power_led"
OLD_STATE=1

ledPin=$(/usr/bin/jq -r .shim.ledPin ${MUPIBOX_CONFIG})
ledMax=$(/usr/bin/jq -r .shim.ledBrightnessMax ${MUPIBOX_CONFIG})
ledMin=$(/usr/bin/jq -r .shim.ledBrightnessMin ${MUPIBOX_CONFIG})

echo "{}" | tee ${TMP_LEDFILE}
/usr/bin/cat <<<$(/usr/bin/jq --argjson v $(printf '%d' "$ledPin") '.led_gpio = $v' ${TMP_LEDFILE}) >${TMP_LEDFILE}
/usr/bin/cat <<<$(/usr/bin/jq --argjson v $(printf '%d' "$ledMax") '.led_max_brightness = $v' ${TMP_LEDFILE}) >${TMP_LEDFILE}
/usr/bin/cat <<<$(/usr/bin/jq --argjson v $(printf '%d' "$ledMin") '.led_min_brightness = $v' ${TMP_LEDFILE}) >${TMP_LEDFILE}
/usr/bin/cat <<<$(/usr/bin/jq '.led_current_brightness = 0' ${TMP_LEDFILE}) >${TMP_LEDFILE}
/usr/bin/cat <<<$(/usr/bin/jq '.led_dim_mode = 0' ${TMP_LEDFILE}) >${TMP_LEDFILE}
/usr/bin/python3 /usr/local/bin/mupibox/led_control.py &
#/usr/local/bin/mupibox/./led_control &

wled_baud_rate=$(/usr/bin/jq -r .wled.baud_rate ${MUPIBOX_CONFIG})
wled_com_port=$(/usr/bin/jq -r .wled.com_port ${MUPIBOX_CONFIG})
wled_main_id=$(/usr/bin/jq -r .wled.main_id ${MUPIBOX_CONFIG})
wled_brightness_def=$(/usr/bin/jq -r .wled.brightness_default ${MUPIBOX_CONFIG})
wled_brightness_dim=$(/usr/bin/jq -r .wled.brightness_dimmed ${MUPIBOX_CONFIG})

# WLED
wled_active=$(/usr/bin/jq -r .wled.active ${MUPIBOX_CONFIG})
if [ ${wled_active} ]; then
	pid=$(pidof /usr/lib/chromium-browser/chromium-browser)
	while [ -z "${pid}" ]; do
		pid=$(pidof /usr/lib/chromium-browser/chromium-browser)
		sleep 3
	done
	wled_data='{"ps":'${wled_main_id}'}'
	/usr/bin/python3 /usr/local/bin/mupibox/wled_send_data.py -s ${wled_com_port} -b ${wled_baud_rate} -j ${wled_data}
	wled_data='{"bri":'${wled_brightness_def}'}'
	/usr/bin/python3 /usr/local/bin/mupibox/wled_send_data.py -s ${wled_com_port} -b ${wled_baud_rate} -j ${wled_data}
	wled_data='{"on":true}'
	/usr/bin/python3 /usr/local/bin/mupibox/wled_send_data.py -s ${wled_com_port} -b ${wled_baud_rate} -j ${wled_data}
fi

while true; do
	displayState=$(vcgencmd display_power | grep -o '.$')
	wled_active=$(/usr/bin/jq -r .wled.active ${MUPIBOX_CONFIG})
	if [ ${displayState} -eq 1 ] && [ ${OLD_STATE} -ne ${displayState} ]; then
		if [ ${wled_active} ]; then
			wled_data='{"bri":'${wled_brightness_def}'}'
			/usr/bin/python3 /usr/local/bin/mupibox/wled_send_data.py -s ${wled_com_port} -b ${wled_baud_rate} -j ${wled_data}
		fi
		/usr/bin/cat <<<$(/usr/bin/jq '.led_dim_mode = 1' ${TMP_LEDFILE}) >${TMP_LEDFILE}
		OLD_STATE=${displayState}
	elif [ ${displayState} -eq 0 ] && [ ${OLD_STATE} -ne ${displayState} ]; then
		if [ ${wled_active} ]; then
			wled_data='{"bri":'${wled_brightness_dim}'}'
			/usr/bin/python3 /usr/local/bin/mupibox/wled_send_data.py -s ${wled_com_port} -b ${wled_baud_rate} -j ${wled_data}
		fi
		/usr/bin/cat <<<$(/usr/bin/jq '.led_dim_mode = 0' ${TMP_LEDFILE}) >${TMP_LEDFILE}
		OLD_STATE=${displayState}
	fi

	sleep 10
done
