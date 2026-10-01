#!/bin/bash

CONFIG="/etc/mupibox/mupiboxconfig.json"
POWEROFF_PIN=$(/usr/bin/jq -r .shim.poweroffPin ${CONFIG})
CUT_PIN=$(/usr/bin/jq -r .shim.cutPin ${CONFIG})

# Sets a pin as output to 0 or 1. libgpiod 1 (Debian 12 "Bookworm"): gpioset as always - the pin keeps its level after
# it. libgpiod 2 (Debian 13 "Trixie"): its gpioset holds the level only while it runs, so pinctrl (raspberrypi-utils)
# sets it, or else a gpioset that stays in the background.
set_pin() {
    if ! gpioset --version 2>/dev/null | grep -q ' v2\.'; then
        gpioset gpiochip0 "$1=$2"
    elif command -v pinctrl >/dev/null; then
        pinctrl set "$1" op "$([ "$2" = 1 ] && echo dh || echo dl)"
    else
        gpioset --daemonize --chip gpiochip0 "$1=$2"
    fi
}

if [ "$1" = "poweroff" ]; then
    echo "$(date): Initiating poweroff sequence"

    # CUT_PIN setzen (z. B. Stromzufuhr abschalten)
    set_pin ${CUT_PIN} 1

    # POWEROFF_PIN setzen (Signal an OnOff SHIM)
    set_pin ${POWEROFF_PIN} 0

    echo "$(date): Poweroff sequence complete"
fi
