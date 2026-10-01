#!/bin/bash
#
# Bluetooth on (app, admin interface). bluetoothctl's own commands wait for their answer; "power on" right after a
# "power off" (removing a device in the admin interface does both) fails while the "off" is still going - it is tried
# again for a few seconds, else Bluetooth stayed off.

for i in 1 2 3 4 5 6 7 8 9 10; do
	/usr/bin/bluetoothctl power on 2>&1 | grep -q "succeeded" && break
	sleep 0.5
done
/usr/bin/bluetoothctl agent on >/dev/null 2>&1
/usr/bin/bluetoothctl default-agent >/dev/null 2>&1
/usr/bin/bluetoothctl show | grep "Powered"
