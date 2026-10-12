#!/bin/bash
#
# Set Default Volume and plays Startup sound

#CONFIG="/etc/mupibox/mupiboxconfig.json"
#LED_PIN=$(/usr/bin/jq -r .shim.ledPin ${CONFIG})
#START_SOUND=$(/usr/bin/jq -r .mupibox.startSound ${CONFIG})
#START_VOLUME=$(/usr/bin/jq -r .mupibox.startVolume ${CONFIG})
#AUDIO_DEVICE=$(/usr/bin/jq -r .mupibox.audioDevice ${CONFIG})
#NETWORKCONFIG="/tmp/network.json"

# Turn OnOffShim LED On
#sudo /bin/echo ${LED_PIN} > /sys/class/gpio/export
#sudo /bin/echo out > /sys/class/gpio/gpio${LED_PIN}/direction
#sudo /bin/echo 1 > /sys/class/gpio/gpio${LED_PIN}/value

# Get network
#while [ "$(/usr/bin/hostname -I)" = "" ]; do
#	# Waiting for network...
#	echo "Wait for network"
#	sleep 1
#done

#sudo /usr/local/bin/mupibox/./get_network.sh

# The display brightness chosen in the app (mupibox.displayBrightness, percent; missing = as the display starts).
# At least 10 %, so a mistake never leaves a black display after a restart.
BRIGHTNESS=$(/usr/bin/jq -r '.mupibox.displayBrightness // empty' /etc/mupibox/mupiboxconfig.json 2>/dev/null)
if [[ "$BRIGHTNESS" =~ ^[0-9]+$ ]]; then
	[ "$BRIGHTNESS" -lt 10 ] && BRIGHTNESS=10
	[ "$BRIGHTNESS" -gt 100 ] && BRIGHTNESS=100
	for f in /sys/class/backlight/*/brightness; do
		[ -w "$f" ] || continue
		MAX=$(cat "${f%/*}/max_brightness" 2>/dev/null || echo 255)
		echo $(( BRIGHTNESS * MAX / 100 )) > "$f"
	done
fi
