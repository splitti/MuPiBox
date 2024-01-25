#!/bin/dash
# Autostart run script for kiosk mode, based on @AYapejian: https://github.com/MichaIng/DietPi/issues/1737#issue-318697621
# - Please see /root/.chromium-browser.init (and /etc/chromium.d/custom_flags) for additional falgs.
# Command line switches: https://peter.sh/experiments/chromium-command-line-switches/
# --test-type gets rid of some of the Chromium warnings that you may or may not care about in kiosk on a LAN
# --pull-to-refresh=1
# --ash-host-window-bounds="400,300"
# Resolution to use for kiosk mode, should ideally match current system resolution

/usr/local/bin/mupibox/./startup.sh &

rm ~/.config/chromium/Singleton*

CONFIG="/etc/mupibox/mupiboxconfig.json"
RES_X=$(/usr/bin/jq -r .chromium.resX ${CONFIG})
RES_Y=$(/usr/bin/jq -r .chromium.resY ${CONFIG})
DEBUG=$(/usr/bin/jq -r .chromium.debug ${CONFIG})

CHROMIUM_OPTS="--cast-app-background-color=054b61ff --default-background-color=054b61ff --noerrdialogs --use-gl=egl --enable-features=VaapiVideoDecoder --enable-native-gpu-memory-buffers --enable-accelerated-2d-canvas --force-gpu-rasterization --kiosk --window-size=${RES_X:-1280},${RES_Y:-720} --start-fullscreen --start-maximized --window-position=0,0 --disk-cache-dir=/home/dietpi/.mupibox/chromium_cache --disk-cache-size=33554432"
if [ "${DEBUG}" = "1" ]; then
 CHROMIUM_OPTS=${CHROMIUM_OPTS}" --enable-logging --v=1 --disable-pinch"
fi


# If you want tablet mode, uncomment the next line.
#CHROMIUM_OPTS+=' --force-tablet-mode --tablet-ui'
# Home page

URL="http://$(/usr/bin/jq -r .mupibox.host ${CONFIG}):8200"
#URL="chrome://flags"

# RPi or Debian Chromium package
FP_CHROMIUM=$(command -v chromium-browser)
[ "$FP_CHROMIUM" ] || FP_CHROMIUM=$(command -v chromium)
#sudo nice -n -19 sudo -u dietpi xinit "$FP_CHROMIUM" $CHROMIUM_OPTS --homepage "${URL:-http://MuPiBox:8200}" -- -nocursor tty2 &
xinit "$FP_CHROMIUM" $CHROMIUM_OPTS --homepage "${URL:-http://MuPiBox:8200}" -- -nocursor tty2 &

# BLUETOOTH
pactl load-module module-bluetooth-discover

x11vnc -ncache 10 -forever -display :0 &

# START SOUND
START_SOUND=$(/usr/bin/jq -r .mupibox.startSound ${CONFIG})
START_VOLUME=$(/usr/bin/jq -r .mupibox.startVolume ${CONFIG})
AUDIO_DEVICE=$(/usr/bin/jq -r .mupibox.audioDevice ${CONFIG})
/usr/bin/amixer sset ${AUDIO_DEVICE} ${START_VOLUME}%
/usr/bin/mplayer -volume 100 ${START_SOUND} &
