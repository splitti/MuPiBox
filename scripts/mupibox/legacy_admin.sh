#!/bin/bash
#
# The previous admin interface (PHP pages behind lighttpd) on or off - the app's switch (Einstellungen › System ›
# Experten, eltern/legacy-admin.ts), the install (off) and the update (as the config says). Run as root.
#
#   legacy_admin.sh on | off [noreload] | status | apply | reload
#
# noreload: lighttpd is not read again yet - the app switches through lighttpd itself, and even a graceful reload cut
# its request off (the answer never came): the server answers first and then runs "reload".
#
# off: php-fpm stopped and disabled, lighttpd's PHP module out, and every .php address sent to the app - nothing on the
#      box answers with PHP any more (a PHP flaw reached from the home network cannot hit it). lighttpd itself stays:
#      it serves the app on port 80/443 with the box's certificate. The Spotify login of a box set up before the app
#      named https://<box>/spotify.php as its address: that answer goes on to the app's callback, as spotify.php did.
# on:  the other way round.
# apply: as mupiboxconfig.json says (mupibox.legacyAdmin; not there: left as it is) - after an update, which may bring
#      PHP and lighttpd's modules back.

CONFIG=/etc/mupibox/mupiboxconfig.json
OFF_CONF=/etc/lighttpd/conf-enabled/92-mupibox-admin-off.conf
# the PHP modules of lighttpd switched off here, to switch the same ones on again
MODS_FILE=/etc/mupibox/legacy-admin-off.modules

# lighttpd reads its config again. Gracefully (reload): the app itself goes through lighttpd, and its request that switches
# this was cut off by a restart - the answer never came. A lighttpd that does not run is started.
lighttpd_again() {
	if systemctl is-active -q lighttpd; then
		systemctl reload lighttpd || systemctl restart lighttpd
	else
		systemctl restart lighttpd
	fi
}

fpm_units() {
	systemctl list-unit-files 'php*-fpm.service' --no-legend 2>/dev/null | awk '{print $1}'
}

status() {
	if [ -e "${OFF_CONF}" ]; then echo off; else echo on; fi
}

switch_off() {
	local reload="$1" unit f name mods=""
	for unit in $(fpm_units); do
		systemctl disable --now "${unit}" >/dev/null 2>&1
	done
	for f in /etc/lighttpd/conf-enabled/*-fastcgi-php*.conf; do
		[ -e "${f}" ] || continue
		name=$(basename "${f}" .conf)
		name=${name#[0-9][0-9]-}
		lighty-disable-mod "${name}" >/dev/null 2>&1
		mods="${mods} ${name}"
	done
	# (a later "off" finds no module any more: the list of the first one is kept)
	[ -n "${mods}" ] && echo "${mods# }" > "${MODS_FILE}"
	cat > "${OFF_CONF}" <<'EOF'
# MuPiBox: the previous admin interface is switched off (app: Einstellungen › System › Experten; scripts/mupibox/
# legacy_admin.sh). No PHP runs: every .php address goes to the app - without this a .php file would be sent as it is.
# The Spotify login of a box set up before the app comes back to /spotify.php: it goes on to the app's callback, as
# spotify.php did. (mod_redirect: the first pattern that matches wins.)
$HTTP["url"] =~ "\.(php[0-9]?|phtml|phar)$" {
	url.redirect = (
		"^/spotify\.php\?(.*state=.*)$" => "/app/spotify-callback?$1",
		"" => "/app/"
	)
	url.redirect-code = 302
}
EOF
	[ "${reload}" = "noreload" ] || lighttpd_again
}

switch_on() {
	local reload="$1" unit name
	rm -f "${OFF_CONF}"
	if [ -s "${MODS_FILE}" ]; then
		for name in $(cat "${MODS_FILE}"); do
			lighty-enable-mod "${name}" >/dev/null 2>&1
		done
		rm -f "${MODS_FILE}"
	fi
	for unit in $(fpm_units); do
		systemctl enable --now "${unit}" >/dev/null 2>&1
	done
	[ "${reload}" = "noreload" ] || lighttpd_again
}

case "$1" in
	on) switch_on "$2" ;;
	off) switch_off "$2" ;;
	status) status ;;
	reload) lighttpd_again ;;
	apply)
		want=$(jq -r 'if .mupibox.legacyAdmin == false then "off" elif .mupibox.legacyAdmin == true then "on" else "" end' "${CONFIG}" 2>/dev/null)
		if [ "${want}" = "off" ]; then
			switch_off
		elif [ "${want}" = "on" ] && [ "$(status)" = "off" ]; then
			switch_on
		fi
		;;
	*)
		echo "Usage: $0 on|off [noreload]|status|apply|reload" >&2
		exit 2
		;;
esac
