#!/bin/bash
#
# The certificate of the box's web server (lighttpd, /etc/lighttpd/server.pem): https://<box>/ - the app, the admin
# interface and the way back from the Spotify login.
#
# The box is its own small certificate authority, limited to home network addresses (private IPv4 ranges and names
# ending in .local): a phone that installs its certificate (ca.crt, offered by the app) trusts the box's web server -
# and still nothing else, even if the key were taken from the SD card. The server certificate names the box's current
# addresses and <hostname>.local and is made again when they change or it runs out (397 days: phones take no longer).
# Before, the web server had a self-signed certificate without any address in it, which no phone can trust.
#
#   ensure             the box's certificate as it should be (at boot, mupi_tls.service; after install / update)
#   custom <crt> <key> an own certificate (with its chain) and its key, checked; the one before comes back if the
#                      web server does not start with it
#   box                back to the box's own certificate
#   https-only on|off  http on port 80 leads to https ("Nur sichere Verbindung", the app's Sicherheit page)
#   cert               the certificate in use (public part, PEM)
#
# The web server is restarted only when something changed (restart, not reload: see project notes on server.pem).

TLS_DIR=/etc/mupibox/tls
PEM=/etc/lighttpd/server.pem
CA_KEY=${TLS_DIR}/ca.key
CA_CRT=${TLS_DIR}/ca.crt
BOX_KEY=${TLS_DIR}/box.key
BOX_CRT=${TLS_DIR}/box.crt
CUSTOM=${TLS_DIR}/custom.pem
REDIRECT_CONF=/etc/lighttpd/conf-enabled/91-mupibox-https-only.conf
LIGHTTPD_CONF=/etc/lighttpd/lighttpd.conf

if [ "$EUID" -ne 0 ]; then
	echo "Please run as root" >&2
	exit 1
fi

# the directory can be read (the app offers ca.crt), the keys only by root
mkdir -p "${TLS_DIR}"
chmod 755 "${TLS_DIR}"

lighttpd_bin() {
	command -v lighttpd || echo /usr/sbin/lighttpd
}

# Puts a PEM (certificate(s) + key) in place for the web server; the one before comes back when lighttpd does not take
# the new one. $1: the new PEM file
install_pem() {
	local new=$1
	if [ -f "${PEM}" ] && cmp -s "${new}" "${PEM}"; then
		rm -f "${new}"
		return 0
	fi
	# (the certificate of before the box's own one: kept once, as it was)
	[ -f "${PEM}" ] && [ ! -f "${PEM}.old" ] && cp -p "${PEM}" "${PEM}.old"
	local before=""
	if [ -f "${PEM}" ]; then
		before=$(mktemp)
		cp -p "${PEM}" "${before}"
	fi
	chmod 600 "${new}"
	mv -f "${new}" "${PEM}"
	if "$(lighttpd_bin)" -tt -f "${LIGHTTPD_CONF}" >/dev/null 2>&1 && systemctl restart lighttpd && systemctl is-active --quiet lighttpd; then
		[ -n "${before}" ] && rm -f "${before}"
		return 0
	fi
	echo "tls_cert.sh: the web server does not start with the new certificate, the one before is back" >&2
	if [ -n "${before}" ]; then
		mv -f "${before}" "${PEM}"
		systemctl restart lighttpd
	fi
	return 1
}

# The names the box's certificate has to hold: its private IPv4 addresses (and 127.0.0.1) and <hostname>.local -
# only names its authority may vouch for (see make_ca), sorted, as openssl lists them
wanted_names() {
	local host
	host=$(hostname | tr '[:upper:]' '[:lower:]')
	{
		echo "DNS:${host}.local"
		echo "IP Address:127.0.0.1"
		for ip in $(hostname -I 2>/dev/null); do
			case "${ip}" in
			10.*|192.168.*|169.254.*) echo "IP Address:${ip}" ;;
			172.*)
				second=$(echo "${ip}" | cut -d. -f2)
				[ "${second}" -ge 16 ] && [ "${second}" -le 31 ] && echo "IP Address:${ip}"
				;;
			esac
		done
	} | sort -u | paste -sd, -
}

current_names() {
	openssl x509 -in "${BOX_CRT}" -noout -ext subjectAltName 2>/dev/null | tail -n +2 | tr ',' '\n' | sed 's/^ *//' | sed '/^$/d' | sort -u | paste -sd, -
}

make_ca() {
	local host
	host=$(hostname)
	openssl req -x509 -new -nodes -newkey ec -pkeyopt ec_paramgen_curve:P-256 -keyout "${CA_KEY}" -out "${CA_CRT}" -days 7300 \
		-subj "/O=MuPiBox/CN=${host} Home Network CA" \
		-addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
		-addext "keyUsage=critical,keyCertSign,cRLSign" \
		-addext "nameConstraints=critical,permitted;IP:10.0.0.0/255.0.0.0,permitted;IP:172.16.0.0/255.240.0.0,permitted;IP:192.168.0.0/255.255.0.0,permitted;IP:169.254.0.0/255.255.0.0,permitted;IP:127.0.0.0/255.0.0.0,permitted;DNS:local" \
		-addext "subjectKeyIdentifier=hash" >/dev/null 2>&1 || return 1
	chmod 600 "${CA_KEY}"
	chmod 644 "${CA_CRT}"
}

make_box_cert() {
	local names=$1 host tmp
	host=$(hostname | tr '[:upper:]' '[:lower:]')
	tmp=$(mktemp -d)
	# (IP Address:x as openssl lists it is IP:x in its configuration)
	local san
	san=$(echo "${names}" | sed 's/IP Address:/IP:/g')
	printf 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\nsubjectAltName=%s\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid\n' "${san}" >"${tmp}/ext"
	openssl req -new -nodes -newkey ec -pkeyopt ec_paramgen_curve:P-256 -keyout "${tmp}/key" -out "${tmp}/csr" -subj "/CN=${host}.local" >/dev/null 2>&1 &&
		openssl x509 -req -in "${tmp}/csr" -CA "${CA_CRT}" -CAkey "${CA_KEY}" -set_serial "0x$(openssl rand -hex 16)" -days 397 -extfile "${tmp}/ext" -out "${tmp}/crt" >/dev/null 2>&1 || {
		rm -rf "${tmp}"
		return 1
	}
	mv -f "${tmp}/key" "${BOX_KEY}"
	mv -f "${tmp}/crt" "${BOX_CRT}"
	chmod 600 "${BOX_KEY}"
	chmod 644 "${BOX_CRT}"
	rm -rf "${tmp}"
}

ensure() {
	# an own certificate stays as it is
	[ -f "${CUSTOM}" ] && return 0
	if [ ! -s "${CA_KEY}" ] || [ ! -s "${CA_CRT}" ]; then
		make_ca || {
			echo "tls_cert.sh: could not make the certificate authority" >&2
			return 1
		}
		rm -f "${BOX_CRT}"
	fi
	local names
	names=$(wanted_names)
	# made again when missing, not from this authority, running out within 60 days or naming other addresses
	if [ ! -s "${BOX_CRT}" ] || ! openssl verify -CAfile "${CA_CRT}" "${BOX_CRT}" >/dev/null 2>&1 ||
		! openssl x509 -in "${BOX_CRT}" -noout -checkend 5184000 >/dev/null 2>&1 || [ "$(current_names)" != "${names}" ]; then
		make_box_cert "${names}" || {
			echo "tls_cert.sh: could not make the certificate" >&2
			return 1
		}
	fi
	local new
	new=$(mktemp)
	cat "${BOX_CRT}" "${BOX_KEY}" >"${new}"
	install_pem "${new}"
}

custom() {
	local crt=$1 key=$2
	if ! openssl x509 -in "${crt}" -noout >/dev/null 2>&1; then
		echo "error: certificate" >&2
		return 2
	fi
	if ! openssl pkey -in "${key}" -noout -passin pass: >/dev/null 2>&1; then
		echo "error: key" >&2
		return 2
	fi
	if [ "$(openssl x509 -in "${crt}" -noout -pubkey | openssl pkey -pubin -outform DER 2>/dev/null | sha256sum)" != "$(openssl pkey -in "${key}" -pubout -outform DER -passin pass: 2>/dev/null | sha256sum)" ]; then
		echo "error: mismatch" >&2
		return 2
	fi
	if ! openssl x509 -in "${crt}" -noout -checkend 0 >/dev/null 2>&1; then
		echo "error: expired" >&2
		return 2
	fi
	local new
	new=$(mktemp)
	# the certificate with its chain as uploaded, then the key (unencrypted)
	{
		cat "${crt}"
		echo
		openssl pkey -in "${key}" -passin pass:
	} | sed '/^$/d' >"${new}"
	cp -p "${new}" "${CUSTOM}.new"
	if install_pem "${new}"; then
		chmod 600 "${CUSTOM}.new"
		mv -f "${CUSTOM}.new" "${CUSTOM}"
		return 0
	fi
	rm -f "${CUSTOM}.new"
	echo "error: webserver" >&2
	return 3
}

https_only() {
	if [ "$1" = "on" ]; then
		# (302, not 301: a browser keeps no lasting note - switched off, http works again at once)
		cat >"${REDIRECT_CONF}.new" <<'EOF'
# MuPiBox: "Nur sichere Verbindung (HTTPS)" (the app's Sicherheit page, scripts/mupibox/tls_cert.sh https-only):
# http on port 80 leads to https - not for the box itself (127.0.0.1). The app on port 8200 stays reachable by http.
$HTTP["scheme"] == "http" {
	$HTTP["remote-ip"] != "127.0.0.1" {
		url.redirect = ( "" => "https://${url.authority}${url.path}${qsa}" )
		url.redirect-code = 302
	}
}
EOF
		if [ -f "${REDIRECT_CONF}" ] && cmp -s "${REDIRECT_CONF}.new" "${REDIRECT_CONF}"; then
			rm -f "${REDIRECT_CONF}.new"
			return 0
		fi
		mv -f "${REDIRECT_CONF}.new" "${REDIRECT_CONF}"
		if ! "$(lighttpd_bin)" -tt -f "${LIGHTTPD_CONF}" >/dev/null 2>&1; then
			rm -f "${REDIRECT_CONF}"
			echo "error: webserver" >&2
			return 3
		fi
	else
		[ -f "${REDIRECT_CONF}" ] || return 0
		rm -f "${REDIRECT_CONF}"
	fi
	systemctl restart lighttpd
}

case "$1" in
ensure) ensure ;;
custom)
	[ -f "$2" ] && [ -f "$3" ] || {
		echo "usage: $0 custom <certificate file> <key file>" >&2
		exit 1
	}
	custom "$2" "$3"
	;;
box)
	rm -f "${CUSTOM}"
	# (the box's certificate as it should be, and in place again)
	rm -f "${BOX_CRT}"
	ensure
	;;
https-only) https_only "$2" ;;
cert) openssl x509 -in "${PEM}" 2>/dev/null ;;
*)
	echo "usage: $0 ensure | custom <crt> <key> | box | https-only on|off | cert" >&2
	exit 1
	;;
esac
