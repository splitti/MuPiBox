#!/bin/bash
#
# Switches whether hciuart.service (loads the onboard Bluetooth chip's firmware over UART at
# boot) is allowed to start. Masking, not just disabling, is needed: hciuart.service is pulled
# in by a device-activated ".wants" symlink (WantedBy=dev-serial1.device) that gets recreated as
# soon as the device appears again unless the unit is masked.
#
#   set_bluetooth_chip.sh off   hciuart.service is stopped and masked (won't start at boot)
#   set_bluetooth_chip.sh on    hciuart.service is unmasked and enabled again

case "$1" in
	off)
		systemctl stop hciuart.service
		systemctl mask hciuart.service
		;;
	on)
		systemctl unmask hciuart.service
		systemctl enable hciuart.service
		;;
	*)
		echo "usage: $0 off|on" >&2
		exit 1
		;;
esac
