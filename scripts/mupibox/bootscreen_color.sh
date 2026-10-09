#!/bin/bash
#
# Sets colours to the base colour of boot screen $1 (see bootscreen_update.sh):
#   $2 = browser  the browser's start background (chromium-autostart.sh reads it)
#   $2 = console  the console (kernel command line, from the next start on)
#   $2 = both     (default) both

OUT="/home/dietpi/MuPiBox/sysmedia/images/bootscreen"
WHAT="${2:-both}"
COLOR=$(awk -v id="$1" '$1 == id {print $2}' "${OUT}/colors.txt" 2>/dev/null)
[ -n "${COLOR}" ] || exit 0
HEX=${COLOR#\#}
R=$((16#${HEX:0:2}))
G=$((16#${HEX:2:2}))
B=$((16#${HEX:4:2}))

if [ "${WHAT}" != "console" ]; then
	echo "${HEX}" | tr 'A-F' 'a-f' > "${OUT}/color"
	chown dietpi:dietpi "${OUT}/color" 2>/dev/null
fi

if [ "${WHAT}" != "browser" ]; then
	# the eight colours the boot sets up, all in the base colour
	CMDLINE="/boot/cmdline.txt"
	[ -f /boot/firmware/cmdline.txt ] && CMDLINE="/boot/firmware/cmdline.txt"
	if grep -q "vt.default_red=" "${CMDLINE}"; then
		rep() { printf '%s,%s,%s,%s,%s,%s,%s,%s' "$1" "$1" "$1" "$1" "$1" "$1" "$1" "$1"; }
		NEW_LINE=$(sed -e "s/vt\.default_red=[0-9,]*/vt.default_red=$(rep ${R})/" \
			-e "s/vt\.default_grn=[0-9,]*/vt.default_grn=$(rep ${G})/" \
			-e "s/vt\.default_blu=[0-9,]*/vt.default_blu=$(rep ${B})/" "${CMDLINE}")
		# write only when it changes (the boot partition is on the SD card)
		[ "${NEW_LINE}" != "$(cat "${CMDLINE}")" ] && printf '%s\n' "${NEW_LINE}" > "${CMDLINE}"
	fi
	# The initramfs splash of older installations ("initramfs initramfs.img" in config.txt and splash.txt, installers up
	# to 3.x) shows splash.png of the boot partition at the kernel's start, before splash_screen.sh: that was the old
	# blue start picture, then the chosen one came (issue #177). It gets the chosen one too, written only when it changes.
	BOOT_DIR=$(dirname "${CMDLINE}")
	PIC="${OUT}/splash-$1.png"
	if [ -f "${BOOT_DIR}/splash.txt" ] && [ -f "${PIC}" ] && grep -qE '^[[:space:]]*initramfs[[:space:]]+initramfs\.img' "${BOOT_DIR}/config.txt" 2>/dev/null; then
		cmp -s "${PIC}" "${BOOT_DIR}/splash.png" || cp "${PIC}" "${BOOT_DIR}/splash.png"
	fi
fi
exit 0
