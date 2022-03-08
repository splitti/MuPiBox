#!/bin/bash
#

sudo pkill -f bluetoothctl
sudo -u dietpi timeout 10s bluetoothctl scan on

device=$1
sudo -u dietpi bluetoothctl trust ${device}
sleep 1
sudo -u dietpi bluetoothctl pair ${device}
sleep 1
sudo -u dietpi bluetoothctl scan off
sleep 1
sudo -u dietpi bluetoothctl connect ${device}
