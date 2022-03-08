#!/bin/bash
#

sudo pkill -f bluetoothctl
timeout 10s bluetoothctl scan on

device=$1
bluetoothctl trust ${device}
sleep 1
bluetoothctl pair ${device}
sleep 1
bluetoothctl scan off
sleep 1
bluetoothctl connect ${device}

