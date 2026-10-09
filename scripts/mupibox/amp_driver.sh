#!/bin/bash
#
# The I2S driver of the MAX98357A amplifier (the MuPiHAT's, also sold as a board of its own) in the boot configuration,
# for the admin interface's choice of the sound card (mupi.php) - the app does the same in eltern/hardware.ts:
#   on   the driver lines where they count for every Pi (before the first [section] or under an [all] of their own);
#        DietPi does not know the card's name and leaves the drivers alone, so without the HAT the box had no sound
#   off  out again when another card is chosen and the MuPiHAT is not on (it would clash with another I2S card)
# Runs as root; the change applies after a restart. BOOT_CONFIG / CONFIG for a test on copies.

CONFIG="${CONFIG:-/etc/mupibox/mupiboxconfig.json}"
if [ -z "${BOOT_CONFIG:-}" ]; then
	if [ -f /boot/firmware/config.txt ]; then BOOT_CONFIG=/boot/firmware/config.txt; else BOOT_CONFIG=/boot/config.txt; fi
fi
DRIVER=('dtoverlay=max98357a,sdmode-pin=16' 'dtoverlay=i2s-mmap')

# the line is in force for every Pi: before the first [section] or under [all]
effective() {
	awk -v want="$1" '
		/^[[:blank:]]*\[/ { s = $0; sub(/^[[:blank:]]*/, "", s); sub(/\].*/, "]", s); next }
		{ l = $0; sub(/[[:blank:]]+$/, "", l); sub(/^[[:blank:]]+/, "", l) }
		l == want && (s == "" || s == "[all]") { found = 1 }
		END { exit !found }' "$2"
}

case "${1:-}" in
	on)
		missing=()
		for line in "${DRIVER[@]}"; do effective "${line}" "${BOOT_CONFIG}" || missing+=("${line}"); done
		[ ${#missing[@]} -gt 0 ] || exit 0
		last=$(sed -n 's/^[[:blank:]]*\(\[[^]]*\]\).*/\1/p' "${BOOT_CONFIG}" | tail -n 1)
		[ -z "${last}" ] || [ "${last}" = "[all]" ] || echo '[all]' >> "${BOOT_CONFIG}"
		for line in "${missing[@]}"; do echo "${line}" >> "${BOOT_CONFIG}"; done
		;;
	off)
		[ "$(/usr/bin/jq -r '.mupihat.hat_active // false' "${CONFIG}" 2>/dev/null)" = "true" ] && exit 0
		sed -i -e '/^[[:blank:]]*dtoverlay=max98357a/d' -e '/^[[:blank:]]*dtoverlay=i2s-mmap[[:blank:]]*$/d' "${BOOT_CONFIG}"
		;;
	*)
		echo "usage: $0 on|off" >&2
		exit 2
		;;
esac
exit 0
