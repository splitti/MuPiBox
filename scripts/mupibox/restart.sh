#!/bin/bash
#

# An update handed over by the admin interface of 4.x runs (start_mupibox_update.sh, unit mupibox-update-admin): that
# admin interface calls this script after every update click - no restart in the middle of the update, the unit
# restarts the box when it is done.
if systemctl is-active --quiet mupibox-update-admin 2>/dev/null; then
	logger -t mupibox "restart held: an update runs (mupibox-update-admin)"
	exit 0
fi

systemctl stop mupi_startstop # (systemctl, not service: for stop, service asks every socket unit of the system first - 2.3 s)
systemctl --no-block stop mupi_powerled # (--no-block: the LED's goodbye animation takes about 2 s and runs on while the box shuts down)
reboot