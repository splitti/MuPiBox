#!/bin/sh
#
# Simulate the shutdown with OnOffShim
# Trigger is PIN 17

TRIGGER_PIN=`/usr/bin/jq -r .shim.triggerPin ${CONFIG}` 
 
sudo sh -c 'echo "${TRIGGER_PIN}" > /sys/class/gpio/export'
sudo sh -c 'echo "out" > /sys/class/gpio/gpio${TRIGGER_PIN}/direction'
sudo sh -c 'echo "1" > /sys/class/gpio/gpio${TRIGGER_PIN}/value'