#!/bin/bash

CONFIG="/etc/mupibox/mupiboxconfig.json"
POWEROFF_PIN=$(/usr/bin/jq -r .shim.poweroffPin ${CONFIG})
CUT_PIN=$(/usr/bin/jq -r .shim.cutPin ${CONFIG})

if [ "$1" = "poweroff" ]; then
    echo "$(date): Initiating poweroff sequence"

    # CUT_PIN setzen (z. B. Stromzufuhr abschalten)
    gpioset gpiochip0 ${CUT_PIN}=1

    # POWEROFF_PIN setzen (Signal an OnOff SHIM)
    gpioset gpiochip0 ${POWEROFF_PIN}=0

    echo "$(date): Poweroff sequence complete"
fi
