#!/bin/bash
#

pkill -f bluetoothctl
bluetoothctl pairable on 
bluetoothctl agent on 
bluetoothctl default-agent 
sleep 0.4 
bluetoothctl discoverable on
timeout 10s bluetoothctl scan on
sleep 0.5
device=$1
dietpi bluetoothctl scan off
sleep 0.5
bluetoothctl trust ${device}
sleep 0.5
dietpi bluetoothctl pair ${device}
sleep 1
bluetoothctl connect ${device}
sleep 2
