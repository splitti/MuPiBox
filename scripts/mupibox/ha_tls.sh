#!/bin/bash
#
# The TLS identity of the Home Assistant API (backend-api src/ha, HTTPS on port 8443): a key of its own, made once and
# never replaced. Home Assistant pins that key (SHA-256 of its SubjectPublicKeyInfo) when it pairs, so a new
# certificate - a new IP address, another name, the yearly renewal - keeps the pairing; tls_cert.sh makes a new key for
# the web server's certificate every time, a pin on that one would break with every change.
#
# The certificate is signed by the box's own CA (tls_cert.sh; Home Assistant may also take it from /api/ha/v1/tls/ca)
# for <hostname>.local and the box's private IPv4 addresses, and made anew with the same key when a name is missing or
# 60 days before it runs out. Key and certificate belong to dietpi (the server reads them).
# Prints "changed" when a new certificate was written. Runs as root.

set -u

DIR=/etc/mupibox/ha
KEY=${DIR}/tls.key
CRT=${DIR}/tls.crt
CA_KEY=/etc/mupibox/tls/ca.key
CA_CRT=/etc/mupibox/tls/ca.crt

mkdir -p "${DIR}"
chown dietpi:dietpi "${DIR}"
chmod 750 "${DIR}"

# the box's CA (made by tls_cert.sh at the install; here only when it is missing)
if [ ! -s "${CA_KEY}" ] || [ ! -s "${CA_CRT}" ]; then
	/usr/local/bin/mupibox/tls_cert.sh >/dev/null 2>&1
fi
if [ ! -s "${CA_KEY}" ] || [ ! -s "${CA_CRT}" ]; then
	echo "ha_tls.sh: no CA of the box (tls_cert.sh)" >&2
	exit 1
fi

# the key: once
if [ ! -s "${KEY}" ]; then
	openssl ecparam -name prime256v1 -genkey -noout -out "${KEY}.new" 2>/dev/null && mv -f "${KEY}.new" "${KEY}" || {
		echo "ha_tls.sh: no key" >&2
		exit 1
	}
fi
chown dietpi:dietpi "${KEY}"
chmod 600 "${KEY}"

# The names the certificate has to hold (as tls_cert.sh): <hostname>.local, 127.0.0.1 and the private IPv4 addresses,
# sorted, as openssl lists them
wanted_names() {
	local host ip second
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
	openssl x509 -in "${CRT}" -noout -ext subjectAltName 2>/dev/null | tail -n +2 | tr ',' '\n' | sed 's/^ *//' | sed '/^$/d' | sort -u | paste -sd, -
}

# every name the box has now is in the certificate (one it holds that the box has not now is no reason for a new one)
holds_all() {
	local have=",$(current_names)," name
	while IFS= read -r name; do
		[ -z "${name}" ] && continue
		case "${have}" in *",${name},"*) ;; *) return 1 ;; esac
	done <<<"$(echo "$1" | tr ',' '\n')"
	return 0
}

# the certificate is for this key (an old one for another key - e.g. the key was made anew - is replaced)
same_key() {
	[ "$(openssl x509 -in "${CRT}" -noout -pubkey 2>/dev/null | openssl pkey -pubin -outform DER 2>/dev/null | sha256sum)" = \
		"$(openssl pkey -in "${KEY}" -pubout -outform DER 2>/dev/null | sha256sum)" ]
}

names=$(wanted_names)
if [ -s "${CRT}" ] && openssl verify -CAfile "${CA_CRT}" "${CRT}" >/dev/null 2>&1 &&
	openssl x509 -in "${CRT}" -noout -checkend 5184000 >/dev/null 2>&1 && same_key && holds_all "${names}"; then
	exit 0
fi

host=$(hostname | tr '[:upper:]' '[:lower:]')
tmp=$(mktemp -d)
san=$(echo "${names}" | sed 's/IP Address:/IP:/g')
printf 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\nsubjectAltName=%s\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid\n' "${san}" >"${tmp}/ext"
if openssl req -new -key "${KEY}" -out "${tmp}/csr" -subj "/CN=${host}.local" >/dev/null 2>&1 &&
	openssl x509 -req -in "${tmp}/csr" -CA "${CA_CRT}" -CAkey "${CA_KEY}" -set_serial "0x$(openssl rand -hex 16)" -days 397 -extfile "${tmp}/ext" -out "${tmp}/crt" >/dev/null 2>&1; then
	mv -f "${tmp}/crt" "${CRT}"
	chown dietpi:dietpi "${CRT}"
	chmod 644 "${CRT}"
	rm -rf "${tmp}"
	echo "changed"
	exit 0
fi
rm -rf "${tmp}"
echo "ha_tls.sh: no certificate" >&2
exit 1
