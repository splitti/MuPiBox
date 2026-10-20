#!/bin/dash
# Autostart script for kiosk mode, based on @AYapejian: https://github.com/MichaIng/DietPi/issues/1737#issue-318697621
#
# Chromium-parameters: https://peter.sh/experiments/chromium-command-line-switches/
#                      https://kapeli.com/cheat_sheets/Chromium_Command_Line_Switches.docset/Contents/Resources/Documents/index
# /var/lib/dietpi/dietpi-software/installed/chromium-autostart.sh
# Watchdog: now and then Chromium starts but never opens the start page: the window stays on a blank page (title
# "Untitled - Chromium", or no title at all), for ever. Seen at boot and after a kiosk restart; at a start of the box
# Chromium's child processes wait 15 s for the browser while the card is busy ("Terminating current process after 15
# seconds with no connection" in its log), the network service dies with them, and the first navigation to the start
# page fails - Chromium does not try again. The title is read every 10 s (a single look 60 s after the start missed
# a window that had no title yet at that moment and stayed white for ever): a large Chromium window without
# "MuPiBox" in its title for two looks in a row after 60 s, or no Chromium window at all after 150 s (the display did
# not come up), restarts the kiosk. At most 3 restarts per start of the box (the count is kept in /tmp, the restarted
# kiosk runs this watchdog again); the start page being open ends it, and the count with it.
(
	COUNT=/tmp/kiosk-watchdog-tries
	waited=0
	bad=0
	while [ "$waited" -lt 420 ]; do
		sleep 10
		waited=$((waited + 10))
		export DISPLAY=:0 XAUTHORITY="$(ls -t /tmp/serverauth.* 2>/dev/null | head -1)"
		# the kiosk's window: the large one of Chromium (the other is a 10 x 10 helper window)
		win=$(xwininfo -root -tree 2>/dev/null | awk '/\("chromium" "Chromium"\)/ { split($(NF - 1), g, "x"); if (g[1] + 0 >= 400) { print; exit } }')
		case "$win" in
			*'"MuPiBox'*)
				rm -f "$COUNT"
				exit 0
				;;
		esac
		if { [ -n "$win" ] && [ "$waited" -ge 60 ]; } || { [ -z "$win" ] && [ "$waited" -ge 150 ]; }; then
			bad=$((bad + 1))
		else
			bad=0
		fi
		if [ "$bad" -ge 2 ]; then
			tries=$(cat "$COUNT" 2>/dev/null)
			tries=${tries:-0}
			if [ "$tries" -ge 3 ]; then
				logger -t mupibox-kiosk "Chromium still has not loaded the start page after $tries restarts, giving up"
				exit 0
			fi
			echo $((tries + 1)) > "$COUNT"
			logger -t mupibox-kiosk "Chromium did not load the start page (window: ${win:-none}), restarting the kiosk (try $((tries + 1)) of 3)"
			# (setsid: the restart kills every process whose name has "chromium" in it - this watchdog too, it is named after
			# this script - and must go on without it)
			setsid /usr/local/bin/mupibox/restart_kiosk.sh >/dev/null 2>&1 &
			exit 0
		fi
	done
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
# FORCE GPU Settings (without WebGPU: no page of the box uses it)
if ${FORCE_GPU} ; then
	CHROMIUM_OPTS="${CHROMIUM_OPTS} --ignore-gpu-blocklist --enable-gpu --use-gl=egl --enable-gpu-rasterization"
fi
# Enable smooth scrolling animation
if ${SCROLL_ANIMATION} ; then
	CHROMIUM_OPTS="${CHROMIUM_OPTS} --enable-smooth-scrolling"
else
	CHROMIUM_OPTS="${CHROMIUM_OPTS} --disable-smooth-scrolling"
fi
# Disable touch swipe back and forward gestures.
CHROMIUM_OPTS="${CHROMIUM_OPTS} --disable-features=OverscrollHistoryNavigation"
# No zooming with two fingers (it stood in the debug block only: children zoomed the display by accident, and the
# Cover Flow theme's two-finger swipes must not zoom it either)
CHROMIUM_OPTS="${CHROMIUM_OPTS} --disable-pinch"
# Suppresses Error dialogs
CHROMIUM_OPTS="${CHROMIUM_OPTS} --noerrdialogs"
# Window Settings
CHROMIUM_OPTS="${CHROMIUM_OPTS} --window-size=${RES_X:-1280},${RES_Y:-720} --window-position=0,0"
# A display larger than the design size 800 x 480 (e.g. the Raspberry Pi Touch Display 2, 1280 x 720): the page is drawn
# larger by the smaller of the two factors (1280 x 720: 1.5, the page is then 853 x 480) - sharp, and the themes keep
# their layout. The same as uiScale() in the backend, which makes the covers that much larger. (LC_ALL=C: a German
# locale would print 1,50.)
UI_SCALE=$(LC_ALL=C awk -v x="${RES_X}" -v y="${RES_Y}" 'BEGIN { if (x + 0 <= 0 || y + 0 <= 0) { print 1; exit } s = x / 800; if (y / 480 < s) s = y / 480; if (s > 3) s = 3; if (s > 1) printf "%.2f", s; else print 1 }')
if [ "${UI_SCALE}" != "1" ]; then
	CHROMIUM_OPTS="${CHROMIUM_OPTS} --force-device-scale-factor=${UI_SCALE}"
fi
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
	# The cache in RAM is memory the box lacks on a Pi with 1 GB: there at most 32 MB (it swapped at every start of
	# Spotify, with a cache allowed to grow to 128 MB).
	MEM_KB=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
	if [ "${MEM_KB:-0}" -gt 0 ] && [ "${MEM_KB}" -lt 1572864 ] && [ "${CACHE_SIZE}" -gt 33554432 ]; then
		CACHE_SIZE=33554432
	fi
fi
CHROMIUM_OPTS="${CHROMIUM_OPTS} --disk-cache-dir=${CACHE_PATH:-/home/dietpi/.mupibox/chromium_cache} --disk-cache-size=${CACHE_SIZE:-33554432}"
# DEBUG MODE
if [ "${DEBUG}" = "1" ]; then
	CHROMIUM_OPTS="${CHROMIUM_OPTS} --enable-logging --v=1"
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
# Without this pkill both invocations spawn their own player & overlay
# the welcome wav. Match by the wav path so the regex never collides
# with the player instance held by the backend-player.
# Played with mpv (paplay where mpv is missing - the sound is a WAV).
pkill -f "(mpv|paplay).*${START_SOUND}" 2>/dev/null
if command -v mpv >/dev/null 2>&1; then
	/usr/bin/mpv --no-video --really-quiet --no-config --ao=pulse,alsa --volume=100 "${START_SOUND}" >/dev/null 2>&1 &
else
	paplay "${START_SOUND}" >/dev/null 2>&1 &
fi
pgrep -f "chromium" | while read -r pid; do
    # Setze die Priorität für jeden Prozess neu
    sudo renice -n -10 -p "$pid"
done
pgrep -f "node	" | while read -r pid; do
    # Setze die Priorität für jeden Prozess neu
    sudo renice -n -10 -p "$pid"
done
sleep 5
pgrep -f "chromium" | while read -r pid; do
    # Setze die Priorität für jeden Prozess neu
    sudo renice -n -10 -p "$pid"
done
clear
