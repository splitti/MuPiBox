#!/bin/bash
#
# Switches the MuPiHAT on: I2C, the driver of its amplifier (MAX98357A, I2S), the I2C modules, its services, and its
# sound card - set right away (it was left to /boot/run_once.sh, which the start runs only once the box is online,
# with a second restart; without internet the old card stayed) and noted in mupiboxconfig.json, so the app shows it.
# Ends with an error when something did not arrive: the app (eltern/hardware.ts) and the admin interface then keep
# the switch as it was. The box is restarted by the caller.
# BOOT_CONFIG / DIETPI_TXT / MUPIBOX_CONFIG / DRY_RUN=1 (no services, no DietPi call) for a test on copies.

BOOT_CONFIG="${BOOT_CONFIG:-}"
if [ -z "${BOOT_CONFIG}" ]; then
	# /boot/firmware/config.txt on newer DietPi (v10), /boot/config.txt before
	if [ -f /boot/firmware/config.txt ]; then BOOT_CONFIG=/boot/firmware/config.txt; else BOOT_CONFIG=/boot/config.txt; fi
fi
DIETPI_TXT="${DIETPI_TXT:-/boot/dietpi.txt}"
MUPIBOX_CONFIG="${MUPIBOX_CONFIG:-/etc/mupibox/mupiboxconfig.json}"
CARD='MAX98357A bcm2835-i2s-HiFi HiFi-0'
ERR=0

add_line() { grep -qxF "$1" "$2" || echo "$1" >> "$2"; }

# boot configuration (a line already there is not added again)
for line in '#--------MuPiHAT--------' 'dtparam=i2c_arm=on' 'dtparam=i2c1=on' 'dtparam=i2c_arm_baudrate=50000' \
	'dtoverlay=max98357a,sdmode-pin=16' 'dtoverlay=i2s-mmap'; do
	add_line "${line}" "${BOOT_CONFIG}"
done

if [ "${DRY_RUN}" != "1" ]; then
	add_line 'i2c-dev' /etc/modules
	add_line 'i2c-bcm2708' /etc/modules
	modprobe i2c-dev
	modprobe i2c-bcm2708
	systemctl enable mupi_hat.service mupi_hat_control.service
	service mupi_hat start
	service mupi_hat_control start
	/boot/dietpi/func/dietpi-set_hardware soundcard "${CARD}" || ERR=1
fi

# the sound card in mupiboxconfig.json (the app and the admin interface show this one), under the config lock the
# server and the admin interface take; written in place, so owner and rights stay
LOCK=/tmp/.mupiboxconfig.lock
[ -e "${LOCK}" ] || { : > "${LOCK}"; chmod 666 "${LOCK}"; }
(
	flock -w 15 9 || exit 1
	TMP=$(mktemp)
	if jq --arg c "${CARD}" '.mupibox.physicalDevice = $c' "${MUPIBOX_CONFIG}" > "${TMP}" && [ -s "${TMP}" ]; then
		cat "${TMP}" > "${MUPIBOX_CONFIG}"
	else
		rm -f "${TMP}"
		exit 1
	fi
	rm -f "${TMP}"
) 9<"${LOCK}" || ERR=1

# arrived? the driver lines, and DietPi's card (which DietPi keeps in small letters)
grep -qxF 'dtoverlay=max98357a,sdmode-pin=16' "${BOOT_CONFIG}" && grep -qxF 'dtoverlay=i2s-mmap' "${BOOT_CONFIG}" || ERR=1
if [ "${DRY_RUN}" != "1" ]; then
	written=$(sed -n '/^[[:blank:]]*CONFIG_SOUNDCARD=/{s/^[^=]*=//p;q}' "${DIETPI_TXT}")
	[ "${written,,}" = "${CARD,,}" ] || ERR=1
fi
[ "${ERR}" = "0" ] || echo "MuPiHAT: not everything arrived (boot configuration ${BOOT_CONFIG}, sound card \"${written}\")" >&2
exit ${ERR}
