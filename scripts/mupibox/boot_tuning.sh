#!/bin/bash
#
# Two settings for a faster and lighter start, set by the install and the update (as root) - each only when nothing
# was chosen for it before:
#
# - initial_turbo=30 in the Pi's config.txt: the CPU runs at full speed for the first 30 s of a start instead of
#   ramping up (the old admin interface's "Initial Turbo" switch; it writes initial_turbo=0 when it is switched off -
#   any initial_turbo line stays as it is).
# - zram swap on a Pi with 1 GB (or less): the swap lives compressed in the RAM instead of a file on the card or stick.
#   With 1 GB the box swaps while it starts (the RAM is full after about a minute), and a swap file on a slow medium
#   held the start up for minutes (IO wait up to 92 %, seen on a Pi 4 with its system on a USB stick: start page after
#   170 s, with zram after 28 s). DietPi's own tool sets it up (50 % of the RAM, kept in dietpi.txt); a swap switched
#   off on purpose (AUTO_SETUP_SWAPFILE_SIZE=0, the old admin interface's switch) stays off.

BOOT_CONFIG="/boot/config.txt"
[ -f /boot/firmware/config.txt ] && BOOT_CONFIG="/boot/firmware/config.txt"
DIETPI_TXT="/boot/dietpi.txt"
SET_SWAP="/boot/dietpi/func/dietpi-set_swapfile"

# --- initial_turbo (Raspberry Pi only: a board without config.txt is left alone)
if [ -f "${BOOT_CONFIG}" ] && ! grep -qE '^[[:blank:]]*initial_turbo[[:blank:]]*=' "${BOOT_CONFIG}"; then
	# (in its own [all] section: the line was appended after whatever section ends the file, e.g. [pi4])
	printf '\n[all]\n# MuPiBox: full CPU speed for the first 30 s of a start\ninitial_turbo=30\n' >> "${BOOT_CONFIG}"
	echo "initial_turbo=30 set in ${BOOT_CONFIG}"
fi

# --- zram swap with 1 GB of RAM or less (a 1 GB Pi reports about 900 MB)
mem_kb=$(awk '/^MemTotal:/ { print $2 }' /proc/meminfo)
if [ -n "${mem_kb}" ] && [ "${mem_kb}" -le 1100000 ] && [ -x "${SET_SWAP}" ] && [ -f "${DIETPI_TXT}" ]; then
	size=$(sed -n 's/^[[:blank:]]*AUTO_SETUP_SWAPFILE_SIZE=//p' "${DIETPI_TXT}" | head -n 1)
	location=$(sed -n 's/^[[:blank:]]*AUTO_SETUP_SWAPFILE_LOCATION=//p' "${DIETPI_TXT}" | head -n 1)
	if [ "${size}" = "0" ]; then
		echo "swap is switched off on purpose - no zram"
	elif [ "${location}" = "zram" ] || [ "${location}" = "zram0" ] || [ "${location}" = "/dev/zram0" ]; then
		: # zram already
	elif ! modprobe zram 2>/dev/null; then
		# (DietPi's tool switches the old swap off and deletes its file before it loads the module: without the module
		# the box was left without any swap)
		echo "no zram module for this kernel - the swap stays as it is"
	else
		echo "1 GB of RAM: swap as zram instead of ${location:-a file}"
		if ! "${SET_SWAP}" 1 zram || ! grep -q '^/dev/zram0[[:blank:]]' /proc/swaps; then
			echo "zram could not be set up - the swap as before (${size:-1} MiB, ${location:-/var/swap})"
			"${SET_SWAP}" "${size:-1}" "${location:-/var/swap}"
		fi
	fi
fi
exit 0
