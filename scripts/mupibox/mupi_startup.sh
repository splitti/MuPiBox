#!/bin/sh
#
# Set Default Volume and plays Startup sound

CONFIG="/etc/mupibox/mupiboxconfig.json"
LED_PIN=$(/usr/bin/jq -r .shim.ledPin ${CONFIG})
START_SOUND=$(/usr/bin/jq -r .mupibox.startSound ${CONFIG})
START_VOLUME=$(/usr/bin/jq -r .mupibox.startVolume ${CONFIG})
AUDIO_DEVICE=$(/usr/bin/jq -r .mupibox.audioDevice ${CONFIG})

# Turn OnOffShim LED On
sudo /bin/echo ${LED_PIN} > /sys/class/gpio/export
sudo /bin/echo out > /sys/class/gpio/gpio${LED_PIN}/direction
sudo /bin/echo 1 > /sys/class/gpio/gpio${LED_PIN}/value

# Set default Volume and play start sound
/usr/bin/amixer sset ${AUDIO_DEVICE} ${START_VOLUME}%
/usr/bin/mplayer ${START_SOUND}
