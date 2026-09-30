#!/bin/bash
#
# Sleep timer script; sleeptimer in seconds
#
# The last FADE seconds the volume goes down step by step (it used to stop with a hard cut); at the end playback is
# stopped, the volume set back for the next start (the sound card keeps it over the shutdown) and the box shut down.

sleeptimer=$1
currtime=0
sec2sleep=1
FADE=20
# the volume as the player sets it (amixer Master of the user it runs as)
mixer() { sudo -u dietpi /usr/bin/amixer "$@"; }
startvolume=""
# stopped in the app or by Telegram while fading (pkill): the volume back as it was
trap '[ -n "${startvolume}" ] && mixer -q sset Master "${startvolume}%"; exit 0' TERM INT

echo ${sleeptimer} > /tmp/.time2sleep

while (( ${sleeptimer} >= ${currtime} )); do
	sleep ${sec2sleep}
	currtime=$((${currtime}+${sec2sleep}))
	resttime=$((${sleeptimer}-${currtime}))
	echo ${resttime} > /tmp/.time2sleep
	if (( resttime <= FADE )); then
		if [ -z "${startvolume}" ]; then
			startvolume=$(mixer sget Master | grep -m1 'Right:' | sed -n 's/.*\[\([0-9]*\)%\].*/\1/p')
		fi
		if [ -n "${startvolume}" ] && (( resttime >= 0 )); then
			span=$(( sleeptimer < FADE ? sleeptimer : FADE ))
			(( span < 1 )) && span=1
			mixer -q sset Master "$(( startvolume * resttime / span ))%"
		fi
	fi
done

# playback stopped, then the volume back (nothing plays any more), then off
curl -s -m 3 -o /dev/null http://127.0.0.1:5005/current/stop
sleep 1
if [ -n "${startvolume}" ]; then
	mixer -q sset Master "${startvolume}%"
fi

poweroff
