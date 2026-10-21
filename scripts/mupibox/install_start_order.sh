#!/bin/bash
#
# The start order of the services that are not needed for the display (run as root by the install and the update, they
# call daemon-reload afterwards):
#
#   pm2 (server, player) -> the kiosk's Chromium shows the start page -> Bluetooth (bluetoothd) -> php-fpm -> lighttpd
#   -> smbd -> DietPi dashboard
#
# Not the LAN (mupi_ethernet): on DietPi 10 it is the only one that brings the cable up (eth0 has no allow-hotplug there)
# - behind the display a box on a cable came into the network 30 to 120 s later, without the time (quiet times, the
# day's limit) and without Spotify meanwhile. It asks for its address in the background and holds nothing up.
#
# The last four were started 45 s after the power was switched on (mupibox-delayed-start.conf): a fixed time that is too
# long on a fast box and too short on a slow one (a system on a stick: the display was still loading when they started,
# Chromium's child processes waited 15 s for the browser, and the start page failed). Now each one starts when the one
# before has started, the first when the display is up (mupibox-display-ready.service, wait_display_ready.sh: at most
# 120 s). One that is started later on (the app's Samba switch, say) starts at once: the order only matters for the
# start of the box. Each one is ordered after ALL the ones before it, not only after the last one: a unit that is not
# started at the start of the box (Samba is off until the app switches it on) does not hold a chain together - the
# DietPi dashboard behind it would have started at once. A unit that does not exist in an After= is ignored by systemd.

UNIT_DIR="/etc/systemd/system"
READY="mupibox-display-ready.service"

cat > "${UNIT_DIR}/${READY}" <<'EOF'
# MuPiBox: ends when the display shows the start page (at the latest after 120 s). The services that are not needed for
# the display are ordered after it (see scripts/mupibox/install_start_order.sh).
[Unit]
Description=MuPiBox display shows the start page
After=pm2-dietpi.service getty@tty1.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/bin/mupibox/wait_display_ready.sh 120
TimeoutStartSec=150
EOF

before="${READY}"
# (an earlier version of this script ordered the LAN behind the display too)
rm -f "${UNIT_DIR}/mupi_ethernet.service.d/mupibox-start-order.conf"
rmdir "${UNIT_DIR}/mupi_ethernet.service.d" 2>/dev/null

for unit in bluetooth $(systemctl list-unit-files "php*-fpm.service" --no-legend 2>/dev/null | awk '{print $1}' | sed 's/\.service$//') lighttpd smbd dietpi-dashboard; do
	mkdir -p "${UNIT_DIR}/${unit}.service.d"
	# (the fixed 45 s wait of the earlier versions goes)
	rm -f "${UNIT_DIR}/${unit}.service.d/mupibox-delayed-start.conf"
	cat > "${UNIT_DIR}/${unit}.service.d/mupibox-start-order.conf" <<EOF
# MuPiBox: starts after the display shows the start page and the services before it (see
# scripts/mupibox/install_start_order.sh)
[Unit]
Wants=${READY}
After=${before}
EOF
	before="${before} ${unit}.service"
done
