#!/bin/bash
#

MUPIBOX_CONFIG="/etc/mupibox/mupiboxconfig.json"
TMP_LEDFILE="/tmp/.power_led"

ledPin=$(/usr/bin/jq -r .shim.ledPin ${MUPIBOX_CONFIG})
ledMax=$(/usr/bin/jq -r .shim.ledBrightnessMax ${MUPIBOX_CONFIG})
ledMin=$(/usr/bin/jq -r .shim.ledBrightnessMin ${MUPIBOX_CONFIG})
#ledMax=$(echo "scale=2; $ledMax/100" | bc)

#echo "${ledPin}=${ledMax}" > /dev/pi-blaster
echo "{}" | tee ${TMP_LEDFILE}
/usr/bin/cat <<< $(/usr/bin/jq --arg v "${ledPin}" '.led_gpio = $v' ${TMP_LEDFILE}) >  ${TMP_LEDFILE}
/usr/bin/cat <<< $(/usr/bin/jq --arg v "${ledMax}" '.led_max_brightness = $v' ${TMP_LEDFILE}) >  ${TMP_LEDFILE}
/usr/bin/cat <<< $(/usr/bin/jq --arg v "${ledMin}" '.led_min_brightness = $v' ${TMP_LEDFILE}) >  ${TMP_LEDFILE}
/usr/bin/cat <<< $(/usr/bin/jq --arg v "0" '.led_current_brightness = $v' ${TMP_LEDFILE}) >  ${TMP_LEDFILE}
/usr/bin/cat <<< $(/usr/bin/jq --arg v "0" '.led_dim_mode = $v' ${TMP_LEDFILE}) >  ${TMP_LEDFILE}
/usr/bin/python3 /usr/local/bin/mupibox/led_control.py
sleep 30

while [ -f TMP_LEDFILE ]
do
		sleep 1
		ledPin=$(/usr/bin/jq -r .shim.ledPin ${MUPIBOX_CONFIG})
		ledMax=$(/usr/bin/jq -r .shim.ledBrightnessMax ${MUPIBOX_CONFIG})
		ledMin=$(/usr/bin/jq -r .shim.ledBrightnessMin ${MUPIBOX_CONFIG})
		#ledMin=$(echo "scale=2; $ledMin/100" | bc)
		#ledMax=$(echo "scale=2; $ledMax/100" | bc)
		displayState=`vcgencmd display_power | grep -o '.$'`
		if [ ${displayState} -eq 0 ]
		then
			/usr/bin/cat <<< $(/usr/bin/jq --arg v "1" '.led_dim_mode = $v' ${TMP_LEDFILE}) >  ${TMP_LEDFILE}
		else
			/usr/bin/cat <<< $(/usr/bin/jq --arg v "0" '.led_dim_mode = $v' ${TMP_LEDFILE}) >  ${TMP_LEDFILE}
		fi
done
