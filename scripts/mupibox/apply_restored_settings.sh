#!/bin/bash
#
# After a backup was restored (the app's eltern/admin.ts and the admin interface's admin.php): what the restored
# configuration switches on but lives outside it is set up the way the configuration says. A fresh box restored from
# a backup showed the MuPiHAT as active in the app, while its services, driver and sound card had never been set up
# ("no HAT found" on the battery page until it was switched off and on in the admin interface). The caller restarts
# the box afterwards. Runs as root.

CONFIG=/etc/mupibox/mupiboxconfig.json
B=/usr/local/bin/mupibox
CUSTOM_CSS=/home/dietpi/.mupibox/Sonos-Kids-Controller-master/www/theme-data/custom/custom-settings.css

j() { /usr/bin/jq -r "$1" "${CONFIG}" 2>/dev/null; }
enabled() { systemctl is-enabled "$1" >/dev/null 2>&1; }

# the restored sound card, read before the MuPiHAT's scripts write theirs (a name DietPi could take, else none)
CARD=$(j '.mupibox.physicalDevice // empty')
case "${CARD}" in *[!A-Za-z0-9\ ._:-]*) CARD='' ;; esac
CARD_ARG=()
[ -n "${CARD}" ] && CARD_ARG=("${CARD}")

# MuPiHAT: I2C, the amplifier's driver, its services and sound card (enable/disable_mupihat.sh) - with the restored
# card: switched off, the script set the 3.5 mm output and a backup's USB DAC was lost
if [ "$(j '.mupihat.hat_active // false')" = "true" ]; then
	if ! enabled mupi_hat.service; then
		echo "MuPiHAT on (restored configuration)"
		"${B}/enable_mupihat.sh" "${CARD_ARG[@]}"
	fi
elif enabled mupi_hat.service; then
	echo "MuPiHAT off (restored configuration)"
	"${B}/disable_mupihat.sh" "${CARD_ARG[@]}"
fi

# the restored sound card in DietPi's configuration (dietpi.txt), as the app chooses it (eltern/hardware.ts), and the
# MAX98357A's driver for it - or out again for another card while the MuPiHAT is off (amp_driver.sh)
if [ -n "${CARD}" ]; then
	current=$(sed -n '/^[[:blank:]]*CONFIG_SOUNDCARD=/{s/^[^=]*=//p;q}' /boot/dietpi.txt 2>/dev/null)
	if [ "${CARD,,}" != "${current,,}" ]; then
		echo "sound card ${CARD} (restored configuration)"
		/boot/dietpi/func/dietpi-set_hardware soundcard "${CARD}"
	fi
	if [ -x "${B}/amp_driver.sh" ]; then
		case "${CARD}" in MAX98357A*) "${B}/amp_driver.sh" on ;; *) "${B}/amp_driver.sh" off ;; esac
	fi
fi

# fan and rotary encoder: their services
for pair in 'fan.fan_active:mupi_fan' 'rotary.active:mupi_rotary'; do
	key="${pair%%:*}"
	svc="${pair##*:}.service"
	[ -f "/etc/systemd/system/${svc}" ] || continue
	if [ "$(j ".${key} // false")" = "true" ]; then
		enabled "${svc}" || { echo "${svc} on (restored configuration)"; systemctl enable "${svc}"; }
	elif enabled "${svc}"; then
		echo "${svc} off (restored configuration)"
		systemctl disable "${svc}"
	fi
done

# the board's 3.5 mm output next to the sound card (onboard_audio.sh; it does nothing with the onboard card)
if [ "$(j '.mupibox.onboardAudio // false')" = "true" ] && [ -x "${B}/onboard_audio.sh" ]; then
	"${B}/onboard_audio.sh" on >/dev/null
fi

# the start, goodbye and battery pictures put together again, with the restored own pictures (unpacked as root: the
# folder back to dietpi, the server writes there)
BOOT_CUSTOM=/home/dietpi/MuPiBox/sysmedia/images/bootscreen-custom
[ -d "${BOOT_CUSTOM}" ] && chown -R dietpi:dietpi "${BOOT_CUSTOM}"
[ -x "${B}/bootscreen_update.sh" ] && "${B}/bootscreen_update.sh" >/dev/null 2>&1

# the own theme's stylesheet: written anew from the restored settings when the server starts (display.ts)
[ -n "$(j '.mupibox.customTheme // empty')" ] && rm -f "${CUSTOM_CSS}"

exit 0
