#!/bin/bash
#
# The photo display (5.1): the programs it needs, installed only when it is switched on in the app (a box that never
# shows photos gets nothing of it). Run as root by the app's server (backend-api app-api/photos/routes.ts) and by the
# update for a box that has it on.
#
#   photos_setup.sh heif     heif-convert (libheif-examples): iPhone photos (HEIC) to JPEG - when the display is on;
#                            below libheif 1.17 also pillow-heif in /opt/mupibox/heif (newer iPhone photos)
#   photos_setup.sh video    ffmpeg: video clips into a format the Pi plays - when "Videos anzeigen" is on
#   photos_setup.sh status   what is there

APT="flock -w 120 /tmp/.mupibox.apt.lock"

set -u

# one at a time (the app's switches, the update)
exec 9>/run/lock/mupibox-photos-setup.lock
flock -w 900 9 || { echo "another photo setup is still running"; exit 1; }

need() {
	# $1 program, $2 package
	command -v "$1" >/dev/null 2>&1 && return 0
	DEBIAN_FRONTEND=noninteractive ${APT} apt-get -o DPkg::Lock::Timeout=600 install -y -q --no-install-recommends "$2" || {
		# (the package list may be old - an image of months before: read it once more and try again)
		${APT} apt-get -o DPkg::Lock::Timeout=600 update -q >/dev/null 2>&1
		DEBIAN_FRONTEND=noninteractive ${APT} apt-get -o DPkg::Lock::Timeout=600 install -y -q --no-install-recommends "$2" || return 1
	}
	command -v "$1" >/dev/null 2>&1
}

# Debian 12's libheif (1.15) cannot read the photos of newer iPhones ("Too many auxiliary image references") - each such
# HEIC failed. Below 1.17: pillow-heif too, with a libheif of its own, in a folder of its own (its Pillow does not touch
# the system's). The box tries heif-convert first, this one when that fails (backend-api app-api/photos/process.ts).
HEIF_VENV=/opt/mupibox/heif
heif_fallback() {
	local v
	v=$(dpkg-query -W -f='${Version}' libheif1 2>/dev/null) || return 0
	dpkg --compare-versions "${v}" lt 1.17 || return 0
	"${HEIF_VENV}/bin/python3" -c 'import pillow_heif' >/dev/null 2>&1 && return 0
	python3 -c 'import venv, ensurepip' >/dev/null 2>&1 || DEBIAN_FRONTEND=noninteractive ${APT} apt-get -o DPkg::Lock::Timeout=600 install -y -q --no-install-recommends python3-venv || return 1
	rm -rf "${HEIF_VENV}"
	mkdir -p "$(dirname "${HEIF_VENV}")" && python3 -m venv "${HEIF_VENV}" && "${HEIF_VENV}/bin/pip" install -q --disable-pip-version-check --no-cache-dir --only-binary=:all: pillow-heif || {
		# (only a ready wheel - no build on the Pi; none for this system: as before)
		rm -rf "${HEIF_VENV}"
		return 1
	}
}

case "${1:-}" in
heif)
	need heif-convert libheif-examples || exit 1
	# (without it, HEIC goes as before - only newer iPhone photos stay out; no failure of the step)
	heif_fallback || echo "pillow-heif not installed - newer iPhone photos may not be read"
	;;
video)
	need ffmpeg ffmpeg || exit 1
	;;
status)
	command -v heif-convert >/dev/null 2>&1 && echo "heif: yes" || echo "heif: no"
	"${HEIF_VENV}/bin/python3" -c 'import pillow_heif' >/dev/null 2>&1 && echo "pillow-heif: yes" || echo "pillow-heif: no"
	command -v ffmpeg >/dev/null 2>&1 && echo "video: yes" || echo "video: no"
	;;
*)
	echo "usage: $0 heif|video|status"
	exit 2
	;;
esac
