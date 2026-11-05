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
	# The adapter in use: a USB adapter if there is one, else the onboard one (see mupi_wifi_iface.sh).
	# It is asked again for every check - the adapters can come and go.
	IFACE_TOOL="/usr/local/bin/mupibox/mupi_wifi_iface.sh"
	ADAPTER=$("${IFACE_TOOL}")
	readonly TICKRATE=10       # seconds between two checks
	readonly PINGS=3           # packets per check; one answer is enough
	readonly FAILS_ALLOWED=3   # failed checks in a row (about 30 seconds) before re-connecting
	readonly WAIT_MAX=30       # at most this many checks (about 5 minutes and more) between two re-connects that do not help
	FAILS=0
	WAIT=0                     # checks until the next re-connect is allowed
	WAIT_NEXT=1                # doubled by every re-connect that did not help: no network in reach is no reason to start the WiFi over all the time
	CONNECTION=""              # adapter, network and gateway the state above belongs to

	# Starts an adapter over so that it gets its address again. A plain "ifdown; ifup" is not enough with the roaming
	# setup (wpa-roam: the address comes from the logical interface "<adapter>=default" when wpa_supplicant reports the
	# connection): the old clients and ifupdown's state stayed, no address and no default route came back, and every
	# check after that failed again - the adapter seemed to be gone for good.
	reconnect() {
		local adapter=$1 n
		ifdown --force "${adapter}=default" &> /dev/null
		ifdown --force "$adapter" &> /dev/null
		pkill -f "wpa_supplicant.* -i ${adapter} " &> /dev/null
		pkill -f "dhclient.*/run/dhclient\.${adapter}\.pid" &> /dev/null
		rm -f "/run/wpa_supplicant/${adapter}"
		G_SLEEP 1
		ifup "$adapter"
		# the address comes with the connection: wait for it (the connection itself may take a few seconds)
		for ((n = 0; n < 25; n++))
		do
			ip -4 addr show dev "$adapter" scope global 2> /dev/null | grep -q 'inet ' && return 0
			G_SLEEP 1
		done
		# connected, but no address asked for: ask for it
		if wpa_cli -i "$adapter" status 2> /dev/null | grep -q 'wpa_state=COMPLETED'
		then
			ifup "${adapter}=default" &> /dev/null
		fi
	}
	# The gateway answers on the link, whether or not it answers pings (guest networks often do not): it answers ARP, which an
	# adapter that has stopped sending never gets to see. The old entry goes first, it would still say so for a while.
	link_answers() {
		ip neigh flush to "$2" dev "$1" &> /dev/null
		ping -nq -c 1 -W 2 -I "$1" "$2" &> /dev/null
		# (REACHABLE only: an answer to this probe. An address alone says nothing - a fixed entry stays, a request coming in writes one.)
		ip neigh show to "$2" dev "$1" 2> /dev/null | grep -q ' REACHABLE'
	}
	G_DIETPI-NOTIFY 2 "Checking connection for $ADAPTER via ping to default gateway every $TICKRATE seconds (re-connect after $FAILS_ALLOWED failed checks)"
	while G_SLEEP "$TICKRATE"
	do
		ADAPTER=$("${IFACE_TOOL}")
		if [[ ! $ADAPTER || ! -e /sys/class/net/$ADAPTER ]]
		then
			# No adapter (yet), or one that has been unplugged: mupi_wifi_select.sh brings up the other one.
			FAILS=0
			continue
		fi
		# The default route on another adapter (a cable): the WiFi has no gateway of its own to ask, which is no failure.
		ROUTE_DEV=$(ip -4 route show default | awk '{ for (i = 1; i < NF; i++) if ($i == "dev") { print $(i + 1); exit } }')
		if [[ $ROUTE_DEV && $ROUTE_DEV != "$ADAPTER" ]]
		then
			FAILS=0
			continue
		fi
		GATEWAY=$(G_GET_NET -i "$ADAPTER" gateway) || GATEWAY=""
		# Another network or gateway: what was tried on the old one says nothing about this one.
		# (Only a name and a gateway both known count as another one: a status that fails now and then must not keep the count at 0.)
		SSID=$(wpa_cli -i "$ADAPTER" status 2> /dev/null | sed -n 's/^ssid=//p')
		NOW="$ADAPTER $SSID $GATEWAY"
		if [[ $SSID && $GATEWAY && $NOW != "$CONNECTION" ]]
		then
			CONNECTION=$NOW
			FAILS=0
			WAIT=0
			WAIT_NEXT=1
		fi
		if [[ $GATEWAY ]] && { ping -nq -c "$PINGS" -W 2 -I "$ADAPTER" "$GATEWAY" &> /dev/null || link_answers "$ADAPTER" "$GATEWAY"; }
		then
			FAILS=0
			WAIT=0
			WAIT_NEXT=1
			continue
		fi
		if (( WAIT > 0 ))
		then
			WAIT=$((WAIT - 1))
			continue
		fi
		FAILS=$((FAILS + 1))
		if (( FAILS < FAILS_ALLOWED ))
		then
			G_DIETPI-NOTIFY 2 "No answer from the gateway on $ADAPTER ($FAILS of $FAILS_ALLOWED)"
			continue
		fi
		G_DIETPI-NOTIFY 2 "Detected $ADAPTER connection loss. Reconnecting..."
		reconnect "$ADAPTER"
		G_DIETPI-NOTIFY 0 'Completed'
		FAILS=0
		WAIT=$WAIT_NEXT
		WAIT_NEXT=$(( WAIT_NEXT * 2 > WAIT_MAX ? WAIT_MAX : WAIT_NEXT * 2 ))
	done
	exit 0
}
