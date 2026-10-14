#!/bin/bash
#
# The box in the network for Home Assistant (backend-api src/ha): the DNS-SD service _mupibox._tcp with the TXT fields
# of the API contract (product, generation=classic, api_version=1, device_id, pairing=required, transport=https), for
# avahi. Nothing secret in it - no code, no token, no fingerprint.
#   on <device_id> <port>   the service file (written only when it changes) and avahi-daemon started and enabled
#   off                     the file taken away, avahi-daemon stopped and disabled
# avahi runs only while the Home Assistant API is switched on in the app: the update installs it switched off. Runs as
# root. Without avahi-daemon nothing is announced; Home Assistant takes the address by hand then.

set -u

FILE=/etc/avahi/services/mupibox-ha.service

case "${1:-}" in
	on)
		id="${2:-}"
		port="${3:-}"
		[[ "${id}" =~ ^[0-9a-f-]{36}$ ]] || { echo "ha_mdns.sh: no device id" >&2; exit 2; }
		[[ "${port}" =~ ^[0-9]{2,5}$ ]] || { echo "ha_mdns.sh: no port" >&2; exit 2; }
		[ -d /etc/avahi/services ] || { echo "ha_mdns.sh: avahi is not installed" >&2; exit 1; }
		tmp=$(mktemp)
		cat >"${tmp}" <<EOF
<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<!-- MuPiBox: the Home Assistant API (written by /usr/local/bin/mupibox/ha_mdns.sh) -->
<service-group>
  <name replace-wildcards="yes">%h</name>
  <service>
    <type>_mupibox._tcp</type>
    <port>${port}</port>
    <txt-record>product=mupibox</txt-record>
    <txt-record>generation=classic</txt-record>
    <txt-record>api_version=1</txt-record>
    <txt-record>id=${id}</txt-record>
    <txt-record>device_id=${id}</txt-record>
    <txt-record>pairing=required</txt-record>
    <txt-record>transport=https</txt-record>
  </service>
</service-group>
EOF
		if cmp -s "${tmp}" "${FILE}"; then
			rm -f "${tmp}"
		else
			install -m 644 "${tmp}" "${FILE}" && rm -f "${tmp}"
		fi
		systemctl is-enabled --quiet avahi-daemon 2>/dev/null || systemctl enable avahi-daemon >/dev/null 2>&1
		systemctl is-active --quiet avahi-daemon || systemctl start avahi-daemon
		;;
	off)
		rm -f "${FILE}"
		# (the socket too: it would start the daemon again on the first request)
		systemctl disable --now avahi-daemon.socket avahi-daemon >/dev/null 2>&1
		;;
	*)
		echo "usage: $0 on <device_id> <port> | off" >&2
		exit 2
		;;
esac
exit 0
