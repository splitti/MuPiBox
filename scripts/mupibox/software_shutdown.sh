#!/bin/sh
#
# Simulate the shutdown with OnOffShim
# Trigger is PIN 17

CONFIG="/etc/mupibox/mupiboxconfig.json"
TRIGGER_PIN=$(/usr/bin/jq -r .shim.triggerPin ${CONFIG})
LOG="/var/log/mupi_softshutdown.log"

sudo sh -c '${TRIGGER_PIN} > /sys/class/gpio/export' >> ${LOG}
sudo sh -c "echo 'out' > /sys/class/gpio/gpio${TRIGGER_PIN}/direction" >> ${LOG}
sudo sh -c "echo '1' > /sys/class/gpio/gpio${TRIGGER_PIN}/value" >> ${LOG}
