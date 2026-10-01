#!/bin/bash
#


until pids=$(pgrep -f "chromium-browser")
do
	sleep 1
done
until pids=$(pgrep -f "bluetoothd")
do
	sleep 1
done

/usr/bin/bluetoothctl power on
/usr/bin/bluetoothctl agent on
/usr/bin/bluetoothctl default-agent

# The paired devices: "devices Paired" from bluetoothctl 5.65 on (Debian 12 has 5.66 - "paired-devices" is gone there
# and found nothing, so no device was connected at the start); older ones still know "paired-devices". Only what
# "info" calls paired (an old bluetoothctl lists every known device for "devices Paired").
paired_devices() {
	local list
	list=$(/usr/bin/bluetoothctl devices Paired 2>/dev/null | grep "^Device")
	[ -n "${list}" ] || list=$(/usr/bin/bluetoothctl paired-devices 2>/dev/null | grep "^Device")
	for MAC in $(echo "${list}" | cut -d" " -f2); do
		/usr/bin/bluetoothctl info "${MAC}" 2>/dev/null | grep -q "Paired: yes" && echo "${MAC}"
	done
}

for MAC in $(paired_devices)
do
	/usr/bin/bluetoothctl connect ${MAC}
	CONN_STATE=$(/usr/bin/bluetoothctl info)
	if [ "$( echo ${CONN_STATE} | grep 'Connected: yes')" ]; then
		DEVICE=$(echo ${CONN_STATE} | grep "Device" | cut -d" " -f2)
		#sudo su - dietpi -c "/usr/bin/bluetoothctl connect ${DEVICE}"
		/usr/bin/bluetoothctl connect ${DEVICE}
		break
	fi
done

while true
do
        CONN_STATE=$(/usr/bin/bluetoothctl info)

        if [ "$( echo ${CONN_STATE} | grep 'Connected: yes')" ]; then
                DEVICE=$(echo ${CONN_STATE} | grep "Device" | cut -d" " -f2)
                #sudo su - dietpi -c "/usr/bin/bluetoothctl connect ${DEVICE}"
                /usr/bin/bluetoothctl connect ${DEVICE}
        fi
        sleep 5
done
