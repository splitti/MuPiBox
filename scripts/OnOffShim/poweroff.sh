#!/bin/bash

CONFIG="/etc/mupibox/mupiboxconfig.json"
POWEROFF_PIN=$(/usr/bin/jq -r .shim.poweroffPin ${CONFIG})
CUT_PIN=$(/usr/bin/jq -r .shim.cutPin ${CONFIG})

if [ "$1" = "poweroff" ]; then
    echo "$(date): Initiating poweroff sequence"

    # CUT_PIN setzen (z. B. Stromzufuhr abschalten)
    pinctrl set ${CUT_PIN} op dh

    # POWEROFF_PIN setzen (Signal an OnOff SHIM)
    pinctrl set ${POWEROFF_PIN} op dl

    echo "$(date): Poweroff sequence complete"
fi
