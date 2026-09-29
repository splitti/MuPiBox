#!/bin/bash
#
# Remove a paired Bluetooth device by MAC. Called from the admin
# bluetooth.php endpoint. The MAC is user-controlled, so it must be
# validated strictly before being piped into bluetoothctl — anything else
# allows newline injection of arbitrary bluetoothctl commands.

MAC="${1:-}"
if [[ ! "$MAC" =~ ^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$ ]]; then
	echo "Error: invalid MAC address format" >&2
	exit 1
fi

coproc bluetoothctl
echo -e "power on\n" >&${COPROC[1]}
echo -e "agent on\n" >&${COPROC[1]}
echo -e "default-agent\n" >&${COPROC[1]}
echo -e "untrust $MAC\n" >&${COPROC[1]}
sleep 2
echo -e "remove $MAC\nyes\n" >&${COPROC[1]}
sleep 2
echo -e 'exit' >&${COPROC[1]}
output=$(cat <&${COPROC[0]})
echo "$output"
