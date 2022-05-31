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
/usr/bin/bluetoothctl defaut-agent

for MAC in $(/usr/bin/bluetoothctl paired-devices | cut -d" " -f2)
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
