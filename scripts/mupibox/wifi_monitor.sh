#!/bin/bash
# Replacement for DietPi's WiFi monitor (dietpi-wifi-monitor.service). The original pings the
# default gateway once every 10 seconds and re-connects (ifdown/ifup, about 15 seconds without
# network) as soon as ONE ping is lost - on a weak WiFi that is every few minutes, and podcasts and
# NAS content disappear each time. This one asks three times per check and only re-connects after
# several failed checks in a row.
{
	. /boot/dietpi/func/dietpi-globals
	readonly G_PROGRAM_NAME='MuPiBox-WiFi_Monitor'
	G_CHECK_ROOT_USER
	G_INIT
	readonly ADAPTER=$(G_GET_NET -t wlan iface)
	[[ $ADAPTER ]] || { G_DIETPI-NOTIFY 1 'No WiFi adapter has been found. Exiting...'; exit 1; }
	readonly TICKRATE=10       # seconds between two checks
	readonly PINGS=3           # packets per check; one answer is enough
	readonly FAILS_ALLOWED=3   # failed checks in a row (about 30 seconds) before re-connecting
	FAILS=0
	G_DIETPI-NOTIFY 2 "Checking connection for $ADAPTER via ping to default gateway every $TICKRATE seconds (re-connect after $FAILS_ALLOWED failed checks)"
	while G_SLEEP "$TICKRATE"
	do
		if [[ ! -e /sys/class/net/$ADAPTER ]]
		then
			G_DIETPI-NOTIFY 1 "WiFi adapter $ADAPTER has been unplugged. Exiting..."
			exit 1
		fi
		if GATEWAY=$(G_GET_NET -i "$ADAPTER" gateway) && ping -nq -c "$PINGS" -W 2 -I "$ADAPTER" "$GATEWAY" &> /dev/null
		then
			FAILS=0
			continue
		fi
		FAILS=$((FAILS + 1))
		if (( FAILS < FAILS_ALLOWED ))
		then
			G_DIETPI-NOTIFY 2 "No answer from the gateway on $ADAPTER ($FAILS of $FAILS_ALLOWED)"
			continue
		fi
		G_DIETPI-NOTIFY 2 "Detected $ADAPTER connection loss. Reconnecting..."
		ifdown "$ADAPTER"
		G_SLEEP 1
		ifup "$ADAPTER"
		G_DIETPI-NOTIFY 0 'Completed'
		FAILS=0
	done
	exit 0
}
