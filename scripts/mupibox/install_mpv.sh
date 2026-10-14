#!/bin/bash
#
# Installs mpv, the box's player for everything but Spotify (library, NAS, radio, podcasts, Google's announcements) -
# since 5.0.10 without mplayer to fall back on. Run as root by the app (backend-api eltern/system.ts, the notice
# "mpv fehlt" on its start page); the update does the same steps itself.
#
# What made an installation fail before, quietly: the package lock held by DietPi or Debian's own updates (apt gave
# up at once), a dpkg stopped halfway before (apt refuses everything until it is finished), broken dependencies left
# by that, old package lists. All of them are handled here; the output goes to the log below.

LOG="/tmp/mupibox-mpv-install.log"
export DEBIAN_FRONTEND=noninteractive
APT_OPTS="-o DPkg::Lock::Timeout=600 -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold"

exec >"${LOG}" 2>&1
date
if command -v mpv >/dev/null 2>&1; then
	echo "mpv is there already: $(mpv --version 2>/dev/null | head -1)"
	exit 0
fi
dpkg --configure -a
apt-get ${APT_OPTS} update
apt-get ${APT_OPTS} --yes -f install
if apt-get ${APT_OPTS} --yes install mpv && command -v mpv >/dev/null 2>&1; then
	echo "mpv installed: $(mpv --version 2>/dev/null | head -1)"
	exit 0
fi
echo "mpv could not be installed"
exit 1
