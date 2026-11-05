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
	# adapter that has stopped sending never gets to see.
	# Asked with an ARP request of its own and read from the answer: the neighbour table cannot say (a fixed entry never asks,
	# a request coming in writes one). arping is not installed everywhere, python3 is.
	link_answers() {
		python3 -c '
import socket, struct, sys, time
iface, source, gateway = sys.argv[1], socket.inet_aton(sys.argv[2]), socket.inet_aton(sys.argv[3])
s = socket.socket(socket.AF_PACKET, socket.SOCK_RAW, socket.htons(0x0806))
s.bind((iface, 0x0806))
mac = s.getsockname()[4]
request = b"\xff" * 6 + mac + b"\x08\x06" + struct.pack("!HHBBH", 1, 0x0800, 6, 4, 1) + mac + source + b"\0" * 6 + gateway
for _ in range(2):
    s.send(request)
    end = time.monotonic() + 1
    while True:
        left = end - time.monotonic()
        if left <= 0:
            break
        s.settimeout(left)
        try:
            frame = s.recv(64)
        except socket.timeout:
            break
        if frame[20:22] == b"\0\2" and frame[28:32] == gateway and frame[32:38] == mac:
            sys.exit(0)
sys.exit(1)
' "$1" "$(ip -4 -o addr show dev "$1" scope global 2> /dev/null | awk '{ split($4, a, "/"); print a[1]; exit }')" "$2" &> /dev/null
	}
	# A stop while the adapter is down must not leave it down: the programs that were ended are started again first.
	# (Only the monitor itself gets the signal, see KillMode in its override; systemd waits for it.)
	reconnect_whole() {
		local stopping=0
		trap 'stopping=1' TERM INT
		reconnect "$1"
		trap - TERM INT
		(( stopping )) && exit 0
		return 0
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
		reconnect_whole "$ADAPTER"
		G_DIETPI-NOTIFY 0 'Completed'
		FAILS=0
		WAIT=$WAIT_NEXT
		WAIT_NEXT=$(( WAIT_NEXT * 2 > WAIT_MAX ? WAIT_MAX : WAIT_NEXT * 2 ))
	done
	exit 0
}
