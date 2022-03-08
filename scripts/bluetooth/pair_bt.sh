#!/bin/bash
#

device=$1
sudo bluetoothctl trust ${device}
sleep 0.3
sudo bluetoothctl pair ${device}
sleep 0.3
sudo bluetoothctl connect ${device}
