#!/bin/dash
# Autostart script for kiosk mode, based on @AYapejian: https://github.com/MichaIng/DietPi/issues/1737#issue-318697621
#
# Chromium-parameters: https://peter.sh/experiments/chromium-command-line-switches/
#                      https://kapeli.com/cheat_sheets/Chromium_Command_Line_Switches.docset/Contents/Resources/Documents/index
# /var/lib/dietpi/dietpi-software/installed/chromium-autostart.sh
# Watchdog: now and then Chromium starts but never opens the start page (white screen, window title
# stays "Untitled"; seen at boot and after a kiosk restart). If that is still the case after 60 s,
# restart the kiosk once (the marker keeps a persistent failure from turning into a restart loop).
(
	sleep 60
	export DISPLAY=:0 XAUTHORITY="$(ls -t /tmp/serverauth.* 2>/dev/null | head -1)"
	if xwininfo -root -tree 2>/dev/null | grep -q '"Untitled - Chromium"' && ! find /tmp/kiosk-watchdog -mmin -5 2>/dev/null | grep -q .; then
		touch /tmp/kiosk-watchdog
		logger -t mupibox-kiosk "Chromium did not load the start page, restarting the kiosk"
		/usr/local/bin/mupibox/restart_kiosk.sh
	fi
) >/dev/null 2>&1 &
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
# start background in the base colour of the boot screen (see bootscreen_color.sh), MuPi blue without one
BOOT_BG=$(cat /home/dietpi/MuPiBox/sysmedia/images/bootscreen/color 2>/dev/null | tr -cd '0-9a-f' | cut -c1-6)
[ ${#BOOT_BG} -eq 6 ] || BOOT_BG="44afe2"
CHROMIUM_OPTS="${CHROMIUM_OPTS} --cast-app-background-color=${BOOT_BG}ff --default-background-color=${BOOT_BG}ff"
# KIOSK Parameters
if ${KIOSK} ; then
	CHROMIUM_OPTS="${CHROMIUM_OPTS} --kiosk --start-fullscreen --start-maximized"
fi
# CACHE Parameters
# The disk cache lives in RAM (/tmp is a tmpfs): on the SD card it was by far the biggest writer on
# an idle box, about 0.5 MB per minute, while it only holds copies of what the box serves itself.
# Emptied at every boot, which costs one slower first load. Set chromium.cacheInRam to false to
# keep it at chromium.cachepath.
CACHE_IN_RAM=$(/usr/bin/jq -r '.chromium.cacheInRam // true' ${CONFIG})
if [ "${CACHE_IN_RAM}" != "false" ]; then
	CACHE_PATH="/tmp/chromium_cache"
	mkdir -p "${CACHE_PATH}"
fi
CHROMIUM_OPTS="${CHROMIUM_OPTS} --disk-cache-dir=${CACHE_PATH:-/home/dietpi/.mupibox/chromium_cache} --disk-cache-size=${CACHE_SIZE:-33554432}"
# DEBUG MODE
if [ "${DEBUG}" = "1" ]; then
	CHROMIUM_OPTS="${CHROMIUM_OPTS} --enable-logging --v=1 --disable-pinch"
fi
# Spotify Web Playback SDK Support
CHROMIUM_OPTS="${CHROMIUM_OPTS} --autoplay-policy=no-user-gesture-required"

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
# kiosk_start.sh shows the boot screen again once X runs, then starts Chromium. -background none: X leaves the screen
# as it is (the boot screen) instead of painting it black first. vt1: the console the boot screen is on - on tty2 the
# switch to it showed the empty console for 2-3 s until X was ready.
exec "$STARTX" /usr/local/bin/mupibox/kiosk_start.sh "$FP_CHROMIUM" $CHROMIUM_OPTS --homepage "http://localhost:8200" -- -nocursor -background none vt1 -keeptty &

# BLUETOOTH
pactl load-module module-bluetooth-discover

# VNC: started by mupi_vnc.service (switched on/off in the admin interface), no longer also here

# START SOUND
START_SOUND=$(/usr/bin/jq -r .mupibox.startSound ${CONFIG})
START_VOLUME=$(/usr/bin/jq -r .mupibox.startVolume ${CONFIG})
# hearing protection at the start too: never above the maximum (a start value set before the maximum was lowered)
MAX_VOLUME=$(/usr/bin/jq -r '.mupibox.maxVolume // 100' ${CONFIG})
if [ "${START_VOLUME}" -eq "${START_VOLUME}" ] 2>/dev/null && [ "${MAX_VOLUME}" -eq "${MAX_VOLUME}" ] 2>/dev/null && [ "${START_VOLUME}" -gt "${MAX_VOLUME}" ]; then
	START_VOLUME=${MAX_VOLUME}
fi
AUDIO_DEVICE=$(/usr/bin/jq -r .mupibox.audioDevice ${CONFIG})
/usr/bin/pactl set-sink-volume @DEFAULT_SINK@ ${START_VOLUME}%
# Kill any in-flight startup-sound playback before launching a fresh one.
# chromium-autostart.sh runs from two paths that can fire in quick
# succession: (1) restart_kiosk.sh after the admin "Restart services"
# click, and (2) dietpi-login auto-respawn on tty2 once chromium dies.
# Without this pkill both invocations spawn their own mplayer & overlay
# the welcome wav. Match by the wav path so the regex never collides
# with mplayer's slave-mode instance held by the backend-player.
pkill -f "mplayer.*${START_SOUND}" 2>/dev/null
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
