#!/bin/bash
#

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
