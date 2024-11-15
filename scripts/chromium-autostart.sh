#!/bin/dash
# Autostart script for kiosk mode, based on @AYapejian: https://github.com/MichaIng/DietPi/issues/1737#issue-318697621
#
# Chromium-parameters: https://peter.sh/experiments/chromium-command-line-switches/
#                      https://kapeli.com/cheat_sheets/Chromium_Command_Line_Switches.docset/Contents/Resources/Documents/index
# /var/lib/dietpi/dietpi-software/installed/chromium-autostart.sh
clear
/usr/local/bin/mupibox/./startup.sh &

rm ~/.config/chromium/Singleton*

CONFIG="/etc/mupibox/mupiboxconfig.json"
RES_X=$(/usr/bin/jq -r .chromium.resX ${CONFIG})
RES_Y=$(/usr/bin/jq -r .chromium.resY ${CONFIG})
DEBUG=$(/usr/bin/jq -r .chromium.debug ${CONFIG})
FORCE_GPU=$(/usr/bin/jq -r .chromium.gpu ${CONFIG})
SCROLL_ANIMATION=$(/usr/bin/jq -r .chromium.sccrollanimation ${CONFIG})
CACHE_PATH=$(/usr/bin/jq -r .chromium.cachepath ${CONFIG})
CACHE_SIZE=$(/usr/bin/jq -r .chromium.cachesize ${CONFIG})
CACHE_SIZE=$(( $CACHE_SIZE * 1024 * 1024))
KIOSK=$(/usr/bin/jq -r .chromium.kiosk ${CONFIG})
CHROMIUM_OPTS=""

# Fast feedback and process control
CHROMIUM_OPTS="--fast --fast-start --skip-gpu-data-loading"
# FORCE GPU Settings
if ${FORCE_GPU} ; then
	CHROMIUM_OPTS="${CHROMIUM_OPTS} --ignore-gpu-blocklist --enable-gpu --use-gl=egl --enable-unsafe-webgpu --enable-gpu-rasterization"
fi
# Enable smooth scrolling animation
if ${SCROLL_ANIMATION} ; then
	CHROMIUM_OPTS="${CHROMIUM_OPTS} --enable-smooth-scrolling"
else
	CHROMIUM_OPTS="${CHROMIUM_OPTS} --disable-smooth-scrolling"
fi
# Disable touch swipe back and forward gestures.
CHROMIUM_OPTS="${CHROMIUM_OPTS} --disable-features=OverscrollHistoryNavigation"
# Suppresses Error dialogs
CHROMIUM_OPTS="${CHROMIUM_OPTS} --noerrdialogs"
# Window Settings
CHROMIUM_OPTS="${CHROMIUM_OPTS} --window-size=${RES_X:-1280},${RES_Y:-720} --window-position=0,0"
# COLOR Parameters
CHROMIUM_OPTS="${CHROMIUM_OPTS} --cast-app-background-color=44afe2ff --default-background-color=44afe2ff"
# KIOSK Parameters
if ${KIOSK} ; then
	CHROMIUM_OPTS="${CHROMIUM_OPTS} --kiosk --start-fullscreen --start-maximized"
fi
# CACHE Parameters
CHROMIUM_OPTS="${CHROMIUM_OPTS} --disk-cache-dir=${CACHE_PATH:-/home/dietpi/.mupibox/chromium_cache} --disk-cache-size=${CACHE_SIZE:-33554432}"
# DEBUG MODE
if [ "${DEBUG}" = "1" ]; then
	CHROMIUM_OPTS="${CHROMIUM_OPTS} --enable-logging --v=1 --disable-pinch"
fi

# If you want tablet mode, uncomment the next line.
#CHROMIUM_OPTS+=' --force-tablet-mode --tablet-ui'
# Home page

# RPi or Debian Chromium package
FP_CHROMIUM=$(command -v chromium-browser)
[ "$FP_CHROMIUM" ] || FP_CHROMIUM=$(command -v chromium)

# Use "startx" as non-root user to get required permissions via systemd-logind
STARTX='xinit'
[ "$USER" = 'root' ] || STARTX='startx'

#sudo nice -n -19 sudo -u dietpi xinit "$FP_CHROMIUM" $CHROMIUM_OPTS --homepage "${URL:-http://MuPiBox:8200}" -- -nocursor tty2 &
exec "$STARTX" "$FP_CHROMIUM" $CHROMIUM_OPTS --homepage "http://localhost:8200" -- -nocursor tty2 &

# BLUETOOTH
pactl load-module module-bluetooth-discover

x11vnc -ncache 10 -forever -display :0 &

# START SOUND
START_SOUND=$(/usr/bin/jq -r .mupibox.startSound ${CONFIG})
START_VOLUME=$(/usr/bin/jq -r .mupibox.startVolume ${CONFIG})
AUDIO_DEVICE=$(/usr/bin/jq -r .mupibox.audioDevice ${CONFIG})
/usr/bin/pactl set-sink-volume @DEFAULT_SINK@ ${START_VOLUME}%
/usr/bin/mplayer -volume 100 ${START_SOUND} &
pgrep -f "chromium-browser" | while read -r pid; do
    # Setze die Priorität für jeden Prozess neu
    sudo renice -n -10 -p "$pid"
done
pgrep -f "node	" | while read -r pid; do
    # Setze die Priorität für jeden Prozess neu
    sudo renice -n -10 -p "$pid"
done
sleep 5
pgrep -f "chromium-browser" | while read -r pid; do
    # Setze die Priorität für jeden Prozess neu
    sudo renice -n -10 -p "$pid"
done
clear
