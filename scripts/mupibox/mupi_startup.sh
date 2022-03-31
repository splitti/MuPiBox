#!/bin/bash
#
# Set Default Volume and plays Startup sound

CONFIG="/etc/mupibox/mupiboxconfig.json"
LED_PIN=$(/usr/bin/jq -r .shim.ledPin ${CONFIG})
START_SOUND=$(/usr/bin/jq -r .mupibox.startSound ${CONFIG})
START_VOLUME=$(/usr/bin/jq -r .mupibox.startVolume ${CONFIG})
AUDIO_DEVICE=$(/usr/bin/jq -r .mupibox.audioDevice ${CONFIG})
NETWORKCONFIG="/tmp/network.json"

# Turn OnOffShim LED On
sudo /bin/echo ${LED_PIN} > /sys/class/gpio/export
sudo /bin/echo out > /sys/class/gpio/gpio${LED_PIN}/direction
sudo /bin/echo 1 > /sys/class/gpio/gpio${LED_PIN}/value

# Get network
#while [ "$(/usr/bin/hostname -I)" = "" ]; do
#	# Waiting for network...
#	echo "Wait for network"
#	sleep 1
#done

sudo /usr/local/bin/mupibox/./get_network.sh