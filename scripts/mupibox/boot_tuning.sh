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
rc=0
if [ -n "${mem_kb}" ] && [ "${mem_kb}" -le 1100000 ] && [ -x "${SET_SWAP}" ] && [ -f "${DIETPI_TXT}" ]; then
	size=$(sed -n 's/^[[:blank:]]*AUTO_SETUP_SWAPFILE_SIZE=//p' "${DIETPI_TXT}" | head -n 1)
	location=$(sed -n 's/^[[:blank:]]*AUTO_SETUP_SWAPFILE_LOCATION=//p' "${DIETPI_TXT}" | head -n 1)
	# The swap as it is now, to put it back if zram fails: the active swap file (path and size, MiB) as /proc/swaps names
	# it - dietpi.txt may be empty or say "1" (auto), and DietPi's tool then takes what it finds active too. Only without
	# an active file the values of dietpi.txt.
	read -r prev_path prev_size < <(awk '$2 == "file" { printf "%s %d\n", $1, $3 / 1024; exit }' /proc/swaps)
	if [ -z "${prev_path}" ] && [[ ${location} == /* ]] && [[ ${size} =~ ^[0-9]+$ ]]; then
		prev_path=${location}
		prev_size=${size}
	fi
	if [ "${size}" = "0" ]; then
		echo "swap is switched off on purpose - no zram"
	elif [ "${location}" = "zram" ] || [ "${location}" = "zram0" ] || [ "${location}" = "/dev/zram0" ] || grep -q '^/dev/zram0[[:blank:]]' /proc/swaps; then
		: # zram already
	elif ! modprobe zram 2>/dev/null; then
		# (DietPi's tool switches the old swap off and deletes its file before it loads the module: without the module
		# the box was left without any swap)
		echo "no zram module for this kernel - the swap stays as it is"
	else
		echo "1 GB of RAM: swap as zram instead of ${prev_path:-no swap file}"
		if ! "${SET_SWAP}" 1 zram || ! grep -q '^/dev/zram0[[:blank:]]' /proc/swaps; then
			if [ -n "${prev_path}" ] && [ "${prev_size:-0}" -gt 0 ]; then
				echo "zram could not be set up - the swap as before (${prev_size} MiB, ${prev_path})"
				if ! "${SET_SWAP}" "${prev_size}" "${prev_path}" || ! grep -q "^${prev_path}[[:blank:]]" /proc/swaps; then
					echo "ERROR: the swap could not be put back (${prev_size} MiB, ${prev_path}) - the box runs without swap" >&2
					rc=1
				fi
			else
				echo "ERROR: zram could not be set up, and there was no swap file before" >&2
				rc=1
			fi
		fi
	fi
fi
exit "${rc}"
