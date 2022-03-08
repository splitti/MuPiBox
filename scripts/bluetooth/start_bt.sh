#!/bin/bash
#

sudo bluetoothctl power on 
sleep 0.3 
sudo bluetoothctl pairable on 
sudo bluetoothctl agent on 
sudo bluetoothctl default-agent 
sleep 0.4 
sudo bluetoothctl discoverable on