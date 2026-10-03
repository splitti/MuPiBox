#!/bin/bash
#
# Puts the MuPiBox WiFi guard (wpa_action_guard.sh) in front of Debian's wpa_action, or takes it away again:
#   mupi_wpa_guard.sh install   (the update and the installation call it; safe to run again)
#   mupi_wpa_guard.sh remove
# dpkg-divert keeps Debian's script as wpa_action.distrib, also over updates of the wpasupplicant package.

GUARD=/usr/local/bin/mupibox/wpa_action_guard.sh
# the path the package registered (/sbin/wpa_action on Debian 12, it may be /usr/sbin/wpa_action later)
REG=$(dpkg -S wpa_action 2>/dev/null | sed -n 's#^wpasupplicant: \(/.*sbin/wpa_action\)$#\1#p' | head -n 1)
if [ -z "${REG}" ]; then
	echo "wpasupplicant has no wpa_action here - nothing to do"
	exit 0
fi
DIVERTED="${REG}.distrib"

case "$1" in
	install)
		[ -f "${GUARD}" ] || { echo "${GUARD} missing"; exit 1; }
		# The guard is put next to it first and takes the name only by a rename: a step that fails (a full card) never
		# leaves the path without a working script - Debian's is put back then. Without wpa_action the WiFi gets no
		# address at all.
		NEW="${REG}.mupibox-new"
		install -m 755 -o root -g root "${GUARD}" "${NEW}" || { rm -f "${NEW}"; echo "guard not installed"; exit 1; }
		fresh=0
		if ! dpkg-divert --list "${REG}" | grep -q .; then
			dpkg-divert --local --rename --divert "${DIVERTED}" --add "${REG}" || { rm -f "${NEW}"; exit 1; }
			fresh=1
		fi
		# Debian's script must be in place before the guard takes its name - else it would be gone
		if [ ! -x "${DIVERTED}" ] || ! mv -f "${NEW}" "${REG}"; then
			rm -f "${NEW}"
			[ ${fresh} = 1 ] && dpkg-divert --local --rename --remove "${REG}"
			echo "${DIVERTED} missing or guard not moved in - guard not installed"
			exit 1
		fi
		echo "WiFi guard in front of ${DIVERTED}"
		;;
	remove)
		if dpkg-divert --list "${REG}" | grep -q .; then
			rm -f "${REG}"
			dpkg-divert --local --rename --remove "${REG}" || exit 1
		fi
		echo "WiFi guard removed, ${REG} is Debian's again"
		;;
	*)
		echo "usage: $0 install|remove"
		exit 1
		;;
esac
