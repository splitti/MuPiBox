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

# The display's files belong to dietpi: the app's server (dietpi) changes the theme link there. Files copied in by hand
# (as root, or unpacked from another computer with its user's number) took that away - the app then could not switch
# the theme. Only those are given back: on a box where all is right nothing is written.
DISPLAY_WWW=/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www
if [ -d "${DISPLAY_WWW}" ]; then
	find "${DISPLAY_WWW}" ! -user dietpi -exec chown -h dietpi:dietpi {} + 2>/dev/null
fi

# A new display model waiting for its answer (app: Display-Modell): 3 minutes from now, then it goes back by itself
[ -x /usr/local/bin/mupibox/display_profile.sh ] && /usr/local/bin/mupibox/display_profile.sh boot

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
