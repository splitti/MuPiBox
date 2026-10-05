#!/bin/bash
# Lowers the volume to the given percent - never raises it (the goodbye sounds when switching off): music that still
# plays for a moment (Spotify pauses over the network, a local album that was just opening is stopped again a little
# later) is not made louder by them. The volume not readable or no valid percent given: left as it is.
# Usage: lower_volume_to.sh <percent>

target=$1
case "${target}" in
	'' | *[!0-9]*) exit 0 ;;
esac
current=$(/usr/bin/pactl get-sink-volume @DEFAULT_SINK@ 2>/dev/null | grep -o '[0-9]*%' | head -n 1 | tr -d '%')
case "${current}" in
	'' | *[!0-9]*) exit 0 ;;
esac
if [ "${current}" -gt "${target}" ]; then
	/usr/bin/pactl set-sink-volume @DEFAULT_SINK@ "${target}%"
fi
exit 0
