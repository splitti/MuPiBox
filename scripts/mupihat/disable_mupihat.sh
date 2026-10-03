#!/bin/bash
#
# Switches the MuPiHAT off: its services, the driver of its amplifier (MAX98357A, I2S) out of the boot configuration,
# and the onboard 3.5mm output as sound card - set right away and noted in mupiboxconfig.json. This script was a copy
# of enable_mupihat.sh: it wrote the amplifier's driver and the I2C lines in instead of taking them out (the
# amplifier stayed a second sound card, and the sound could still go to it) and put the I2C modules back into
# /etc/modules. I2C stays on (harmless, and other hardware may use it).
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
CARD='rpi-bcm2835-3.5mm'
ERR=0

if [ "${DRY_RUN}" != "1" ]; then
	service mupi_hat_control stop
	systemctl disable mupi_hat_control.service
	service mupi_hat stop
	systemctl disable mupi_hat.service
fi

# the amplifier's driver out of the boot configuration (DietPi does not know it and would leave it)
sed -i -e '/^[[:blank:]]*dtoverlay=max98357a/d' -e '/^[[:blank:]]*dtoverlay=i2s-mmap[[:blank:]]*$/d' "${BOOT_CONFIG}"

if [ "${DRY_RUN}" != "1" ]; then
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

# arrived? no driver line left, and DietPi's card
grep -Eq '^[[:blank:]]*dtoverlay=(max98357a|i2s-mmap)' "${BOOT_CONFIG}" && ERR=1
if [ "${DRY_RUN}" != "1" ]; then
	written=$(sed -n '/^[[:blank:]]*CONFIG_SOUNDCARD=/{s/^[^=]*=//p;q}' "${DIETPI_TXT}")
	[ "${written,,}" = "${CARD,,}" ] || ERR=1
fi
[ "${ERR}" = "0" ] || echo "MuPiHAT: not everything arrived (boot configuration ${BOOT_CONFIG}, sound card \"${written}\")" >&2
exit ${ERR}
