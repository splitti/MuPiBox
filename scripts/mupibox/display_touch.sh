#!/bin/bash
#
# The touch of a display on the ribbon cable, once more when it gave up at the start (mupi_startup.sh, as root). The
# Touch Display 2 takes the power of its touch chip from the panel (raspberrypi,touchscreen-panel-regulator-v2): the
# chip's driver can come first, gets no answer on I2C ("Goodix-TS 10-005d: I2C communication failure: -5") and gives up
# - the picture is there, the touch not, until the next start. Once the display is there, a touch chip without its
# driver (goodix, edt-ft5x06, ilitek ...) is probed again, a few times; a box where all is right is left as it is.

set -u
TOUCH='goodix|edt|ft5|focaltech|ilitek|touchscreen'

# the touch chips with no driver bound (the regulator of the panel is no touch chip: it has its driver)
unbound() {
	local d c
	for d in /sys/bus/i2c/devices/*-*; do
		[ -e "${d}/of_node/compatible" ] || continue
		[ -e "${d}/driver" ] && continue
		c=$(tr '\0' ' ' < "${d}/of_node/compatible")
		[[ "${c}" =~ ${TOUCH} ]] && [[ ! "${c}" =~ regulator ]] && basename "${d}"
	done
}

[ -n "$(unbound)" ] || exit 0

# the display first (its panel switches the touch's power on): up to 30 s
for _ in $(seq 1 30); do
	grep -qx connected /sys/class/drm/card*-DSI-*/status 2>/dev/null && break
	sleep 1
done

for try in 1 2 3 4 5; do
	sleep 2
	for dev in $(unbound); do
		echo "${dev}" > /sys/bus/i2c/drivers_probe 2>/dev/null
	done
	if [ -z "$(unbound)" ]; then
		logger -t mupibox-display "touch: bound again (try ${try})"
		exit 0
	fi
done
logger -t mupibox-display "touch: no driver for $(unbound | tr '\n' ' ')- the touch stays off until the next start"
exit 1
