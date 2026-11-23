#!/bin/bash
#
# Since 5.1 there is no previous admin interface (PHP pages behind lighttpd) any more: the app does everything it did.
# The update takes it off a box that had it (on or switched off in the app since 5.0.12) - run as root, as often as it
# is started (the update after "done", and the start after an update cut off after "done"):
#   - every .php address to the app, and the Spotify login of a box set up before the app (https://<box>/spotify.php) on
#     to the app's callback: 92-mupibox-no-php.conf, from conf-available (the update and the installer put it there)
#     into conf-enabled - first
#   - its files in /var/www gone, before PHP: no .php file left that could be sent as it is; /var/www/cover stays (the
#     covers of the radio stations, see covers.ts)
#   - php-fpm stopped and disabled, lighttpd's PHP module out, the PHP packages removed (DietPi's software 89, so
#     dietpi-software knows; when that fails, the packages stay - nothing runs them)
#   - what the switch of 5.0.12 left (legacy_admin.sh and its files, the PHP security update's mark)
#   - the web server's right to run anything as root (sudoers.d/www-data): only the PHP pages used it, and through it
#     a flaw in lighttpd would have reached root
# lighttpd stays: it serves the app on port 80/443 with the box's certificate. It is not restarted here: the update (and
# the start) does that after. --keep-packages: all of it but the PHP packages (at the start - removing them takes too
# long then; the next update does it).
# A box of 5.1 that goes back to a version before gets PHP back from the update (older_web_server).

log() { echo "remove_legacy_admin: $*"; }

NO_PHP=92-mupibox-no-php.conf
[ -e "/etc/lighttpd/conf-enabled/${NO_PHP}" ] || cp -f "/etc/lighttpd/conf-available/${NO_PHP}" "/etc/lighttpd/conf-enabled/${NO_PHP}" 2>/dev/null \
	|| log "${NO_PHP} not found - the pages go first, so no .php file is left"

if [ -d /var/www ]; then
	for item in /var/www/* /var/www/.[!.]*; do
		[ -e "${item}" ] || [ -L "${item}" ] || continue
		[ "${item}" = /var/www/cover ] && continue
		rm -rf "${item}"
	done
fi
[ -e /var/www/cover ] || [ -L /var/www/cover ] || { mkdir -p /var/www && ln -s /home/dietpi/MuPiBox/media/cover /var/www/cover; }
sync

for unit in $(systemctl list-unit-files 'php*-fpm.service' --no-legend 2>/dev/null | awk '{print $1}'); do
	systemctl disable --now "${unit}" >/dev/null 2>&1 && log "${unit} stopped"
done
for f in /etc/lighttpd/conf-enabled/*-fastcgi-php*.conf; do
	[ -e "${f}" ] || continue
	name=$(basename "${f}" .conf)
	lighty-disable-mod "${name#[0-9][0-9]-}" >/dev/null 2>&1 || rm -f "${f}"
	log "lighttpd module ${name} off"
done
# (the switch's own redirect: 92-mupibox-no-php.conf does it now)
rm -f /etc/lighttpd/conf-enabled/92-mupibox-admin-off.conf

if [ "${1:-}" != "--keep-packages" ] && dpkg-query -W -f='${Status}\n' 'php*' 2>/dev/null | grep -q 'install ok installed'; then
	if [ -x /boot/dietpi/dietpi-software ] && G_INTERACTIVE=0 timeout 600 /boot/dietpi/dietpi-software uninstall 89 >/dev/null 2>&1; then
		log "PHP removed"
	else
		log "PHP could not be removed - it stays installed, nothing runs it"
	fi
fi

rm -f /etc/sudoers.d/www-data /usr/local/bin/mupibox/legacy_admin.sh /etc/mupibox/legacy-admin-off.modules /etc/mupibox/legacy-admin-off-by-update \
	/etc/mupibox/legacy-admin-default.done /etc/mupibox/php-security-update.failed 2>/dev/null
if [ -s /etc/mupibox/mupiboxconfig.json ] && jq -e '.mupibox | has("legacyAdmin")' /etc/mupibox/mupiboxconfig.json >/dev/null 2>&1; then
	tmp=$(mktemp /etc/mupibox/.cfg.XXXXXX) && jq 'del(.mupibox.legacyAdmin)' /etc/mupibox/mupiboxconfig.json > "${tmp}" \
		&& chown --reference=/etc/mupibox/mupiboxconfig.json "${tmp}" && chmod --reference=/etc/mupibox/mupiboxconfig.json "${tmp}" \
		&& mv -f "${tmp}" /etc/mupibox/mupiboxconfig.json
	rm -f "${tmp}"
fi
exit 0
