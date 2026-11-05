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
# the sound card afterwards: the HAT's amplifier, or the one given (a restored backup keeps its own card,
# apply_restored_settings.sh)
CARD="${1:-MAX98357A bcm2835-i2s-HiFi HiFi-0}"
ERR=0

add_line() { grep -qxF "$1" "$2" || echo "$1" >> "$2"; }
# The line is in the boot configuration where it counts for every Pi: before the first [section] or under [all]. One
# under [pi5] (or [cm4], [gpio4=1], ...) does nothing on a Pi 4 - and a line added to the end of the file lands in the
# last section there is.
effective() {
	awk -v want="$1" '
		/^[[:blank:]]*\[/ { s = $0; sub(/^[[:blank:]]*/, "", s); sub(/\].*/, "]", s); next }
		{ l = $0; sub(/[[:blank:]]+$/, "", l); sub(/^[[:blank:]]+/, "", l) }
		l == want && (s == "" || s == "[all]") { found = 1 }
		END { exit !found }' "$2"
}
DRIVER=('dtparam=i2c_arm=on' 'dtparam=i2c1=on' 'dtparam=i2c_arm_baudrate=50000' 'dtoverlay=max98357a,sdmode-pin=16' 'dtoverlay=i2s-mmap')

# KILL as the MuPiHAT has it: GPIO 4, active low - a line of its own, not only the pin changed: with active_low=0 left in
# it, the driver pulled KILL low at its start, and the box went off while booting. Not for a restored backup, and not next
# to a button on gpio-shutdown or in a line that loads further overlays (see start_mupibox_update.sh).
if [ "${MUPIHAT_KEEP_PINS:-}" != "1" ] && ! grep -qE '^[[:space:]]*dtoverlay=.*gpio-shutdown' "${BOOT_CONFIG}"; then
	sed -i --follow-symlinks -E '/^[[:space:]]*dtoverlay=gpio-poweroff(,.*)?[[:space:]]*$/d' "${BOOT_CONFIG}" || ERR=1
	grep -qE '^[[:space:]]*dtoverlay=.*gpio-poweroff' "${BOOT_CONFIG}" || DRIVER+=('dtoverlay=gpio-poweroff,gpiopin=4,active_low=1')
fi

# boot configuration (a line already in force is not added again)
missing=()
for line in "${DRIVER[@]}"; do effective "${line}" "${BOOT_CONFIG}" || missing+=("${line}"); done
if [ ${#missing[@]} -gt 0 ]; then
	last=$(sed -n 's/^[[:blank:]]*\(\[[^]]*\]\).*/\1/p' "${BOOT_CONFIG}" | tail -n 1)
	[ -z "${last}" ] || [ "${last}" = "[all]" ] || echo '[all]' >> "${BOOT_CONFIG}"
	add_line '#--------MuPiHAT--------' "${BOOT_CONFIG}"
	for line in "${missing[@]}"; do echo "${line}" >> "${BOOT_CONFIG}"; done
fi

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
# server and the admin interface take. Written next to it and renamed (as the server does): a failed write or a power
# cut leaves the old file, never an empty one; owner and rights taken over.
LOCK=/tmp/.mupiboxconfig.lock
[ -e "${LOCK}" ] || { : > "${LOCK}"; chmod 666 "${LOCK}"; }
(
	flock -w 15 9 || exit 1
	TMP="${MUPIBOX_CONFIG}.mupihat-new"
	# The MuPiHAT's pins, by its schematic: the LED of its on/off switch on GPIO 13 (J15), KILL on 4, the button's INT on
	# 17 - a box coming from an older version kept other pins, and the LED stayed dark. Not over a fan that is switched on
	# and runs on GPIO 13, and not for a restored backup (MUPIHAT_KEEP_PINS=1): its pins are the ones the box is wired for.
	if jq --arg c "${CARD}" --arg keep "${MUPIHAT_KEEP_PINS:-}" '.mupibox.physicalDevice = $c
		| if $keep == "1" then . else
			.shim.poweroffPin = "4" | .shim.triggerPin = "17"
			| if (.fan.fan_active == true and (.fan.fan_gpio | tostring) == "13") then . else .shim.ledPin = "13" end
		end' "${MUPIBOX_CONFIG}" > "${TMP}" && [ -s "${TMP}" ] &&
		chown --reference="${MUPIBOX_CONFIG}" "${TMP}" && chmod --reference="${MUPIBOX_CONFIG}" "${TMP}" && mv -f "${TMP}" "${MUPIBOX_CONFIG}"; then
		exit 0
	fi
	rm -f "${TMP}"
	exit 1
) 9<"${LOCK}" || ERR=1

# the 3.5 mm output switched on in the app: DietPi's switch of the card has blocked it again (see onboard_audio.sh;
# after the card is written above, the script goes by it)
if [ "${DRY_RUN}" != "1" ] && [ -x /usr/local/bin/mupibox/onboard_audio.sh ]; then
	/usr/local/bin/mupibox/onboard_audio.sh reapply >/dev/null || true
fi

# arrived? the driver lines (in force for this Pi), and DietPi's card (which DietPi keeps in small letters)
effective 'dtoverlay=max98357a,sdmode-pin=16' "${BOOT_CONFIG}" && effective 'dtoverlay=i2s-mmap' "${BOOT_CONFIG}" || ERR=1
if [ "${DRY_RUN}" != "1" ]; then
	written=$(sed -n '/^[[:blank:]]*CONFIG_SOUNDCARD=/{s/^[^=]*=//p;q}' "${DIETPI_TXT}")
	[ "${written,,}" = "${CARD,,}" ] || ERR=1
fi
[ "${ERR}" = "0" ] || echo "MuPiHAT: not everything arrived (boot configuration ${BOOT_CONFIG}, sound card \"${written}\")" >&2
exit ${ERR}
