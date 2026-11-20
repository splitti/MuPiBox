#!/bin/sh
#
# Spotify on a box without the DSI display (mupi_spotify_browser.service): the box's Spotify player is the Web Playback SDK in
# the display's page - without the kiosk there is no Spotify device, and a Spotify tile or NFC tag plays nothing. Chromium
# runs the page here without a screen (--headless=new: no X server; Widevine and the sound through PulseAudio work as in the
# kiosk; it needs about as much memory as the kiosk, without X a little less). A choice of its own: "Spotify bereithalten"
# (mupibox.headlessSpotify) under Einstellungen > Display > Ohne DSI-Display.
# Ends at once (nothing to do) when the box does not start without the DSI display, and while the kiosk still runs (the
# switch counts after the restart): its page is the Spotify device then, and both would use the same profile.

CONFIG="/etc/mupibox/mupiboxconfig.json"
wanted() {
	[ "$(/usr/bin/jq -r '.mupibox.headless // false' ${CONFIG} 2>/dev/null)" = "true" ] || return 1
	[ "$(/usr/bin/jq -r '.mupibox.headlessSpotify // false' ${CONFIG} 2>/dev/null)" = "true" ] || return 1
	! pidof Xorg >/dev/null 2>&1
}
wanted || exit 0

# (chromium-browser on Debian 12, chromium on Debian 13)
FP_CHROMIUM=$(command -v chromium-browser)
[ "$FP_CHROMIUM" ] || FP_CHROMIUM=$(command -v chromium)
if [ -z "$FP_CHROMIUM" ]; then
	echo "no Chromium on this box"
	exit 0
fi

# The page once the backend answers (at boot it comes after this): a page asked for too early stays on "site can't be
# reached". Not there after 3 minutes: ended with an error, systemd starts it again.
i=0
until /usr/bin/curl -s -o /dev/null -m 2 http://localhost:8200; do
	i=$((i + 1))
	if [ "$i" -ge 90 ]; then
		echo "the backend does not answer"
		exit 1
	fi
	sleep 2
done

# (asked again after the wait: at boot the kiosk may have come up meanwhile - a DSI display, the switch left at the start - and
# both on one profile would break it)
wanted || exit 0
# (the kiosk's profile - this box does not run the kiosk now; a Chromium that was killed leaves its lock behind)
PROFILE="/home/dietpi/.config/chromium"
mkdir -p "${PROFILE}" /tmp/chromium_cache
rm -f "${PROFILE}"/Singleton*
exec "$FP_CHROMIUM" --headless=new --user-data-dir="${PROFILE}" --autoplay-policy=no-user-gesture-required \
	--window-size=800,480 --noerrdialogs --disk-cache-dir=/tmp/chromium_cache --disk-cache-size=33554432 \
	http://localhost:8200
