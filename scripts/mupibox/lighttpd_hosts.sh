#!/bin/bash
#
# The names the web server (lighttpd: the old admin interface, port 80/443) answers to - every other one gets 403.
# Without it a foreign web page could point a name of its own at the box's address (DNS rebinding) and then, in a
# parent's browser, read and send everything of the admin interface as if it were the box's own page (it has root
# rights through sudo). The app's server (Node) checks the same itself (backend-api request-guard.ts isAllowedHost).
#
# Allowed: IP addresses, localhost, a name without a dot (as the router's DNS gives it: http://mupibox/) and one with
# an ending of the home network nobody can register on the internet (.local, .lan, .home, .home.arpa, .internal,
# .localdomain, .fritz.box, .speedport.ip) - plus the address the parents set up for their own certificate
# (mupiboxconfig.json tls.linkHost, see backend-api eltern/tls.ts). Written again when that changes; lighttpd is
# restarted only when the file changed (restart, not reload). Runs as root. CONFIG / CONF / NO_RESTART=1 for a test.

CONFIG="${CONFIG:-/etc/mupibox/mupiboxconfig.json}"
CONF="${CONF:-/etc/lighttpd/conf-enabled/80-mupibox-hosts.conf}"

# the parents' own name: only the characters the app allows there (letters, digits, "-" and ".")
link=$(/usr/bin/jq -r '.tls.linkHost // empty' "${CONFIG}" 2>/dev/null | tr '[:upper:]' '[:lower:]')
[[ "${link}" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] || link=''
extra=''
[ -n "${link}" ] && extra="|${link//./\\.}"

hosts="localhost|[0-9]{1,3}(\\.[0-9]{1,3}){3}|\\[[0-9a-fA-F:.]+\\]|[A-Za-z0-9-]+|[A-Za-z0-9-]+\\.(local|lan|home|home\\.arpa|internal|localdomain|fritz\\.box|speedport\\.ip)${extra}"

tmp="${CONF}.new"
cat > "${tmp}" <<EOF || exit 1
# Written by /usr/local/bin/mupibox/lighttpd_hosts.sh - changes here are overwritten.
# Only names of the home network (and the parents' own address): a foreign name pointed at the box (DNS rebinding)
# gets 403. A request without a Host header (HTTP/1.0, no browser) is let through.
\$HTTP["host"] !~ "^(${hosts})(:[0-9]+)?\$" {
	\$HTTP["host"] != "" {
		url.access-deny = ( "" )
	}
}
EOF

if cmp -s "${tmp}" "${CONF}"; then
	rm -f "${tmp}"
	exit 0
fi
mv -f "${tmp}" "${CONF}" || exit 1
[ "${NO_RESTART:-0}" = "1" ] || systemctl restart lighttpd
exit 0
