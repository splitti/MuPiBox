#!/bin/bash
#
# The DietPi-Dashboard behind the MuPiBox app. Without a password it gave everyone in the Wi-Fi a web terminal as
# dietpi (sudo without a password): root on the box. Now it has a random password nobody knows and listens on an inner
# port (5253); the server of the box (backend-api eltern/dietpi-dashboard.ts) answers on 5252, passes everything on and
# signs a parent of the app in with a one-time ticket - so it is reached from the app only. Off by default.
#
#   dietpi_dashboard.sh setup   its config.toml written (inner port, password hash, secret) - the password made once
#   dietpi_dashboard.sh on      setup, then the service on (also after a restart)
#   dietpi_dashboard.sh off     the service off
#   dietpi_dashboard.sh status  active / inactive
#   dietpi_dashboard.sh token   signs in with the password and prints the dashboard's token and the fingerprint it is
#                               bound to (for the server)
#   dietpi_dashboard.sh pem     prints the box's certificate with its key, as the web server uses it for https
#                               (tls_cert.sh) - the server answers https on 5252 with it, so the dashboard and its
#                               sign-in are not sent in the clear from an app opened with https
#
# Runs as root (the server calls it with sudo). The password stays in a file only root reads; the server never sees it.

DIR=/opt/dietpi-dashboard
CONF="${DIR}/config.toml"
PW_FILE=/etc/mupibox/dietpi-dashboard.pw
PORT=5253
UNIT=dietpi-dashboard.service

hex32() { head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

setup() {
	[ -x "${DIR}/dietpi-dashboard" ] || { echo "dietpi-dashboard is not installed" >&2; return 1; }
	mkdir -p "$(dirname "${PW_FILE}")"
	if [ ! -s "${PW_FILE}" ]; then
		(umask 077 && hex32 > "${PW_FILE}.new" && mv -f "${PW_FILE}.new" "${PW_FILE}") || return 1
	fi
	chown root:root "${PW_FILE}"
	chmod 600 "${PW_FILE}"
	local hash secret tmp
	# (the hash of the password as the dashboard wants it: "echo -n '<PASSWORD>' | sha512sum")
	hash=$(tr -d '\n' < "${PW_FILE}" | sha512sum | cut -d' ' -f1)
	# the secret that signs its tokens: kept, so a token stays valid across a rewrite
	secret=$(sed -n 's/^secret = "\([0-9a-f]\{64\}\)"$/\1/p' "${CONF}" 2>/dev/null | head -n 1)
	[ -n "${secret}" ] || secret=$(hex32)
	tmp="${CONF}.new"
	cat > "${tmp}" <<-EOF || return 1
		# Written by /usr/local/bin/mupibox/dietpi_dashboard.sh - changes here are overwritten.
		# The MuPiBox app opens the dashboard: the box's server answers on port 5252 and passes it on to this port.
		port = ${PORT}
		pass = true
		hash = "${hash}"
		secret = "${secret}"
		expiry = 3600
		terminal_user = "dietpi"
	EOF
	chmod 600 "${tmp}"
	if ! cmp -s "${tmp}" "${CONF}"; then
		mv -f "${tmp}" "${CONF}" || return 1
		# (a running dashboard reads its config at the start only)
		systemctl is-active --quiet "${UNIT}" && systemctl restart "${UNIT}"
	else
		rm -f "${tmp}"
	fi
	return 0
}

case "${1:-}" in
	setup)
		setup
		;;
	on)
		setup || exit 1
		systemctl enable "${UNIT}" >/dev/null 2>&1
		systemctl restart "${UNIT}"
		;;
	off)
		systemctl disable --now "${UNIT}" >/dev/null 2>&1
		exit 0
		;;
	status)
		systemctl is-active --quiet "${UNIT}" && echo "active" || echo "inactive"
		exit 0
		;;
	token)
		[ -s "${PW_FILE}" ] || exit 1
		# The password as the body of POST /login/ - the dashboard answers with its token (401 for a wrong one). The token
		# is bound to the cookie FINGERPRINT (32 random bytes, hex; the token holds their SHA-256): made here and sent
		# along, printed after the token - the server puts it into the browser together with the token.
		fingerprint=$(hex32)
		token=$(curl -s -f -m 5 -X POST -H "Cookie: FINGERPRINT=${fingerprint}" --data-binary @"${PW_FILE}" "http://127.0.0.1:${PORT}/login/") || exit 1
		[[ "${token}" =~ ^[A-Za-z0-9._-]+$ ]] || exit 1
		printf '%s %s\n' "${token}" "${fingerprint}"
		;;
	pem)
		[ -s /etc/lighttpd/server.pem ] || exit 1
		cat /etc/lighttpd/server.pem
		;;
	*)
		echo "usage: $0 setup|on|off|status|token|pem" >&2
		exit 2
		;;
esac
