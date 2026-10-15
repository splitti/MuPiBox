#!/bin/bash
#
# The programs without which a part of the box does not work, and their installation. An update whose package
# installation failed (the package lock held by DietPi's or Debian's own updates, a dpkg stopped halfway) went by
# quietly before: without mpv the box played nothing but Spotify (mplayer, the fallback until 5.0.9, is gone), without
# rsvg-convert or Pillow the start pictures had no box name and no random scene.
#
#   install_missing.sh --list   the missing ones that apt can install, one per line (no root needed; the app's server
#                               asks it for the notice on its start page, backend-api eltern/system.ts)
#   install_missing.sh          installs them (root, from the app's notice); output in the log below
#
# What made an installation fail is handled here: the lock (waited for), a dpkg stopped halfway (finished), broken
# dependencies (repaired), old package lists (fetched again), questions (none asked).

# what each one is needed for: mpv plays everything but Spotify; rsvg-convert and Pillow put the start pictures together
# (bootscreens/tools/compose_bootscreen.py); xdotool hides the display's window for the goodbye picture; feh shows
# pictures on the screen
NEEDED="mpv librsvg2-bin python3-pil xdotool feh"
LOG="/tmp/mupibox-install-missing.log"

missing() {
	for p in ${NEEDED}; do
		dpkg-query -W -f='${Status}' "${p}" 2>/dev/null | grep -q "install ok installed" && continue
		# (only what this system's package lists offer: one apt cannot install would be asked for forever)
		LC_ALL=C apt-cache policy "${p}" 2>/dev/null | grep -q 'Candidate: [^(]' && echo "${p}"
	done
}

if [ "${1:-}" = "--list" ]; then
	missing
	exit 0
fi

export DEBIAN_FRONTEND=noninteractive
APT_OPTS="-o DPkg::Lock::Timeout=600 -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold"

exec >"${LOG}" 2>&1
date
BEFORE=$(missing)
if [ -z "${BEFORE}" ]; then
	echo "nothing missing"
	exit 0
fi
echo "missing: ${BEFORE}"
dpkg --configure -a
apt-get ${APT_OPTS} update
apt-get ${APT_OPTS} --yes -f install
# shellcheck disable=SC2086
apt-get ${APT_OPTS} --yes install ${BEFORE}
AFTER=$(missing)
# the start pictures put together again when what they need came now
if echo "${BEFORE}" | grep -qE 'librsvg2-bin|python3-pil' && [ -x /usr/local/bin/mupibox/bootscreen_update.sh ]; then
	/usr/local/bin/mupibox/bootscreen_update.sh
	cat /tmp/bootscreen_update.log 2>/dev/null
fi
if [ -n "${AFTER}" ]; then
	echo "still missing: ${AFTER}"
	exit 1
fi
echo "all installed"
exit 0
