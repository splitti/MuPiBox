#!/bin/bash
#
# TIDAL (unofficial, python-tidal): its own Python next to the system's, the service on or off. Run as root by the
# app's server (backend-api eltern/tidal.ts) when TIDAL is switched on or off in the app.
#
#   tidal_setup.sh on      /opt/mupibox-tidal with tidalapi in the version below (only what is missing), the service on
#   tidal_setup.sh off     the service off - the Python and the sign-in stay, switching on again is quick
#   tidal_setup.sh status  active / inactive

VENV="/opt/mupibox-tidal"
# the version the box is tested with: a newer tidalapi may change what the service relies on
TIDALAPI="0.8.11"
UNIT="mupi_tidal"
APT="flock -w 120 /tmp/.mupibox.apt.lock"

set -u

# one at a time (the app's switch, the update): an "off" while an "on" still installed was undone by the "on" at its
# end. What the app saved last counts - the next one waits for the one before and then does what it says.
exec 9>/run/lock/mupibox-tidal-setup.lock
flock -w 900 9 || { echo "another TIDAL setup is still running"; exit 1; }

case "${1:-}" in
on)
	if ! python3 -c "import venv, ensurepip" >/dev/null 2>&1; then
		DEBIAN_FRONTEND=noninteractive ${APT} apt-get -o DPkg::Lock::Timeout=600 install -y -q python3-venv || exit 1
	fi
	if [ ! -x "${VENV}/bin/python" ]; then
		python3 -m venv "${VENV}" || exit 1
	fi
	if [ "$("${VENV}/bin/python" -c 'import tidalapi; print(tidalapi.__version__)' 2>/dev/null)" != "${TIDALAPI}" ]; then
		"${VENV}/bin/pip" install -q --disable-pip-version-check "tidalapi==${TIDALAPI}" || exit 1
	fi
	systemctl cat "${UNIT}.service" >/dev/null 2>&1 || { echo "${UNIT}.service is missing"; exit 1; }
	# (switched off in the app while this installed: the setting counts, the service is not started)
	if [ "$(/usr/bin/jq -r '.tidal.enabled // false' /etc/mupibox/mupiboxconfig.json 2>/dev/null)" != "true" ]; then
		echo "TIDAL was switched off meanwhile - not started"
		exit 0
	fi
	systemctl enable "${UNIT}" && systemctl restart "${UNIT}" || exit 1
	;;
off)
	systemctl disable --now "${UNIT}" >/dev/null 2>&1
	exit 0
	;;
status)
	systemctl is-active "${UNIT}"
	;;
*)
	echo "usage: $0 on|off|status"
	exit 2
	;;
esac
